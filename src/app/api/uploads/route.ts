import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { attachments } from "@/db/schema";
import { db } from "@/db/client";
import { AuthorizationError, can, getCurrentActor } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";
import { hasSameOrigin, sameOriginError } from "@/lib/http-security";
import { MalwareDetectedError, scanBufferForMalware } from "@/lib/malware-scan";
import { enforceActorRateLimit, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { acquireUploadProcessingLease, assertStorageCapacity, UploadCapacityError } from "@/lib/upload-admission";

const acceptedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function safeOriginalName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "inspection-photo").slice(0, 255);
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return sameOriginError();
  const rateLimit = await enforceRateLimit(request, "file.upload", 30, 600);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const actor = await getCurrentActor();
  if (!can(actor, "inspection:submit") && !can(actor, "maintenance:manage") && !can(actor, "inspection:review")) {
    throw new AuthorizationError("inspection:submit");
  }
  const env = getEnvironment();
  const actorLimit = await enforceActorRateLimit(actor.id, "upload.actor.daily", env.UPLOAD_USER_DAILY_LIMIT, 86_400);
  if (!actorLimit.allowed) return rateLimitResponse(actorLimit);
  let releaseUploadSlot: () => void;
  try { releaseUploadSlot = await acquireUploadProcessingLease(); } catch (error) {
    if (error instanceof UploadCapacityError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }

  try {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "An image file is required." }, { status: 400 });
  }
  if (!acceptedMimeTypes.has(file.type)) {
    return Response.json({ error: "Only JPEG, PNG, WebP, HEIC, and HEIF images are accepted." }, { status: 415 });
  }
  if (file.size <= 0 || file.size > env.UPLOAD_MAX_BYTES) {
    return Response.json(
      { error: `The image must be smaller than ${Math.floor(env.UPLOAD_MAX_BYTES / 1_048_576)} MB.` },
      { status: 413 },
    );
  }

  let processed: Buffer;
  try {
    const source = Buffer.from(await file.arrayBuffer());
    await scanBufferForMalware(source);
    processed = await sharp(source, { failOn: "warning", limitInputPixels: 24_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    if (error instanceof UploadCapacityError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof MalwareDetectedError) return Response.json({ error: error.message }, { status: 422 });
    return Response.json({ error: "The uploaded file is not a valid supported image." }, { status: 422 });
  }

  const date = new Date();
  const storageKey = path.posix.join(
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    `${crypto.randomUUID()}.jpg`,
  );
  const root = path.resolve(env.FILE_STORAGE_ROOT);
  const destination = path.resolve(root, storageKey);
  if (!destination.startsWith(`${root}${path.sep}`)) {
    return Response.json({ error: "Invalid storage destination." }, { status: 500 });
  }

  try {
    await assertStorageCapacity(processed.byteLength);
  } catch (error) {
    if (error instanceof UploadCapacityError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, processed, { flag: "wx", mode: 0o600 });

  try {
    const [record] = await db
      .insert(attachments)
      .values({
        uploadedByUserId: actor.id,
        storageKey,
        originalName: safeOriginalName(file.name),
        mimeType: "image/jpeg",
        byteSize: processed.byteLength,
        sha256: crypto.createHash("sha256").update(processed).digest("hex"),
      })
      .returning({ id: attachments.id });

    return Response.json(
      {
        id: record!.id,
        name: safeOriginalName(file.name),
        mimeType: "image/jpeg",
        byteSize: processed.byteLength,
      },
      { status: 201 },
    );
  } catch (error) {
    await fs.unlink(destination).catch(() => undefined);
    throw error;
  }
  } finally {
    releaseUploadSlot();
  }
}
