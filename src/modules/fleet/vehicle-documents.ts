import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import { attachments, auditEvents, vehicleAttachments, vehicles } from "@/db/schema";
import { AuthorizationError, getCurrentActor, requirePermission } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";
import { MalwareDetectedError, scanBufferForMalware } from "@/lib/malware-scan";
import { assertStorageCapacity, UploadCapacityError } from "@/lib/upload-admission";
import { retireVehicleDocumentSchema, vehicleDocumentMetadataSchema } from "@/modules/administration/validation";

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const documentMimeTypes = new Set([...imageMimeTypes, "application/pdf"]);

export class VehicleDocumentError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = "VehicleDocumentError";
  }
}

function safeOriginalName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "vehicle-document").slice(0, 255);
}

function ensureStoredPath(storageKey: string): { root: string; destination: string } {
  const root = path.resolve(getEnvironment().FILE_STORAGE_ROOT);
  const destination = path.resolve(root, storageKey);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new VehicleDocumentError("Invalid storage destination.", 500);
  return { root, destination };
}

async function normalizeFile(file: File, category: string): Promise<{ bytes: Buffer; mimeType: string; extension: string }> {
  if (!documentMimeTypes.has(file.type)) {
    throw new VehicleDocumentError("Only PDF, JPEG, PNG, WebP, HEIC, and HEIF files are accepted.", 415);
  }
  if (category === "profile_photo" && !imageMimeTypes.has(file.type)) {
    throw new VehicleDocumentError("A profile photo must be a supported image.", 415);
  }
  try {
    const source = Buffer.from(await file.arrayBuffer());
    await scanBufferForMalware(source);
    if (file.type === "application/pdf") {
      const tail = source.subarray(Math.max(0, source.length - 2048)).toString("latin1");
      if (!source.subarray(0, 5).equals(Buffer.from("%PDF-")) || !tail.includes("%%EOF")) throw new VehicleDocumentError("The uploaded file is not a valid PDF document.", 422);
      return { bytes: source, mimeType: "application/pdf", extension: "pdf" };
    }
    let bytes: Buffer;
    try {
      bytes = await sharp(source, { failOn: "warning", limitInputPixels: 24_000_000 })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new VehicleDocumentError("The uploaded file is not a valid supported image.", 422);
    }
    return { bytes, mimeType: "image/jpeg", extension: "jpg" };
  } catch (error) {
    if (error instanceof VehicleDocumentError) throw error;
    if (error instanceof UploadCapacityError) throw new VehicleDocumentError(error.message, error.status);
    throw new VehicleDocumentError(error instanceof MalwareDetectedError ? error.message : "File scanning is temporarily unavailable.", error instanceof MalwareDetectedError ? 422 : 503);
  }
}

export function mayViewVehicleDocuments(role: string): boolean {
  return role === "supervisor" || role === "fleet_manager" || role === "administrator" || role === "auditor";
}

export async function uploadVehicleDocument(vehicleId: string, formData: FormData) {
  const actor = await requirePermission("fleet:write");
  const file = formData.get("file");
  if (!(file instanceof File)) throw new VehicleDocumentError("A document file is required.", 400);
  const env = getEnvironment();
  if (file.size <= 0 || file.size > env.UPLOAD_MAX_BYTES) {
    throw new VehicleDocumentError(`The file must be smaller than ${Math.floor(env.UPLOAD_MAX_BYTES / 1_048_576)} MB.`, 413);
  }
  const parsed = vehicleDocumentMetadataSchema.safeParse({
    category: formData.get("category"),
    caption: formData.get("caption"),
    effectiveDate: formData.get("effectiveDate"),
    expiresOn: formData.get("expiresOn"),
    isPrimary: formData.get("isPrimary"),
  });
  if (!parsed.success) throw new VehicleDocumentError("The document metadata is invalid.", 400, parsed.error.flatten());

  const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  if (!vehicle) throw new VehicleDocumentError("Vehicle not found.", 404);

  const normalized = await normalizeFile(file, parsed.data.category);
  await assertStorageCapacity(normalized.bytes.byteLength).catch((error) => {
    if (error instanceof UploadCapacityError) throw new VehicleDocumentError(error.message, error.status);
    throw error;
  });
  const now = new Date();
  const storageKey = path.posix.join(
    "vehicle-documents",
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${crypto.randomUUID()}.${normalized.extension}`,
  );
  const { destination } = ensureStoredPath(storageKey);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, normalized.bytes, { flag: "wx", mode: 0o600 });

  try {
    return await db.transaction(async (transaction) => {
      if (parsed.data.isPrimary) {
        await transaction
          .update(vehicleAttachments)
          .set({ isPrimary: false })
          .where(and(eq(vehicleAttachments.vehicleId, vehicleId), eq(vehicleAttachments.isPrimary, true), isNull(vehicleAttachments.retiredAt)));
      }
      const [attachment] = await transaction
        .insert(attachments)
        .values({
          uploadedByUserId: actor.id,
          storageKey,
          originalName: safeOriginalName(file.name),
          mimeType: normalized.mimeType,
          byteSize: normalized.bytes.byteLength,
          sha256: crypto.createHash("sha256").update(normalized.bytes).digest("hex"),
          status: "linked",
        })
        .returning({ id: attachments.id });
      await transaction.insert(vehicleAttachments).values({
        vehicleId,
        attachmentId: attachment!.id,
        category: parsed.data.category,
        caption: parsed.data.caption ?? null,
        effectiveDate: parsed.data.effectiveDate ?? null,
        expiresOn: parsed.data.expiresOn ?? null,
        isPrimary: parsed.data.isPrimary,
        linkedByUserId: actor.id,
      });
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "vehicle.document_added",
        entityType: "vehicle",
        entityId: vehicleId,
        metadata: { attachmentId: attachment!.id, category: parsed.data.category, expiresOn: parsed.data.expiresOn ?? null, isPrimary: parsed.data.isPrimary },
      });
      return { id: attachment!.id };
    });
  } catch (error) {
    await fs.unlink(destination).catch(() => undefined);
    throw error;
  }
}

export async function retireVehicleDocument(vehicleId: string, attachmentId: string, rawInput: unknown) {
  const actor = await requirePermission("fleet:write");
  const parsed = retireVehicleDocumentSchema.safeParse(rawInput);
  if (!parsed.success) throw new VehicleDocumentError("A valid retirement reason is required.", 400, parsed.error.flatten());
  const [updated] = await db
    .update(vehicleAttachments)
    .set({ isPrimary: false, retiredAt: new Date(), retiredByUserId: actor.id, retirementReason: parsed.data.reason })
    .where(and(eq(vehicleAttachments.vehicleId, vehicleId), eq(vehicleAttachments.attachmentId, attachmentId), isNull(vehicleAttachments.retiredAt)))
    .returning({ attachmentId: vehicleAttachments.attachmentId });
  if (!updated) throw new VehicleDocumentError("Active vehicle document not found.", 404);
  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    eventType: "vehicle.document_retired",
    entityType: "vehicle",
    entityId: vehicleId,
    metadata: { attachmentId, reason: parsed.data.reason },
  });
  return { id: attachmentId, retired: true };
}

export async function readVehicleDocument(attachmentId: string) {
  const actor = await getCurrentActor();
  if (!mayViewVehicleDocuments(actor.role)) throw new AuthorizationError("fleet:write");
  const [record] = await db
    .select({ storageKey: attachments.storageKey, mimeType: attachments.mimeType, originalName: attachments.originalName })
    .from(attachments)
    .innerJoin(vehicleAttachments, eq(attachments.id, vehicleAttachments.attachmentId))
    .where(and(eq(attachments.id, attachmentId), isNull(vehicleAttachments.retiredAt)))
    .limit(1);
  if (!record) throw new VehicleDocumentError("Vehicle document not found.", 404);
  const { destination } = ensureStoredPath(record.storageKey);
  try {
    return { ...record, bytes: await fs.readFile(destination) };
  } catch {
    throw new VehicleDocumentError("Vehicle document file is unavailable.", 404);
  }
}
