import fs from "node:fs/promises";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, pool } from "@/db/client";
import { attachments, auditEvents, notificationOutbox, userNotifications, vehicleAttachments, vehicles } from "@/db/schema";
import { getEnvironment } from "@/lib/env";
import { retireVehicleDocument, uploadVehicleDocument } from "@/modules/fleet/vehicle-documents";
import { processVehicleDocumentExpirations } from "@/modules/notifications/vehicle-document-expirations";

const env = getEnvironment();
if (env.NODE_ENV === "production") throw new Error("Vehicle dossier QA is forbidden in production.");

const createdAttachmentIds: string[] = [];
const storageKeys: string[] = [];
let eventPrefix = "";

try {
  const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles).limit(1);
  if (!vehicle) throw new Error("Seed at least one vehicle before running vehicle dossier QA.");
  const image = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#17634d" } }).png().toBuffer();

  const profileForm = new FormData();
  profileForm.set("file", new File([image], "qa-profile.png", { type: "image/png" }));
  profileForm.set("category", "profile_photo");
  profileForm.set("caption", "Temporary QA profile photo");
  profileForm.set("isPrimary", "true");
  const profile = await uploadVehicleDocument(vehicle.id, profileForm);
  createdAttachmentIds.push(profile.id);

  const expiredDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const registrationForm = new FormData();
  registrationForm.set("file", new File([image], "qa-registration.png", { type: "image/png" }));
  registrationForm.set("category", "registration");
  registrationForm.set("caption", "Temporary QA registration");
  registrationForm.set("expiresOn", expiredDate);
  registrationForm.set("isPrimary", "false");
  const registration = await uploadVehicleDocument(vehicle.id, registrationForm);
  createdAttachmentIds.push(registration.id);
  eventPrefix = `vehicle-document-expiry:${registration.id}:`;

  const [primary] = await db.select().from(vehicleAttachments).where(eq(vehicleAttachments.attachmentId, profile.id));
  if (!primary?.isPrimary || primary.category !== "profile_photo") throw new Error("Primary vehicle photo was not linked correctly.");

  const expiration = await processVehicleDocumentExpirations();
  const queued = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(sql`${notificationOutbox.eventKey} like ${`${eventPrefix}%`}`);
  if (!expiration.evaluated || !queued.length) throw new Error("Expired document notifications were not queued.");

  await retireVehicleDocument(vehicle.id, registration.id, { reason: "QA validation complete" });
  const [retired] = await db.select().from(vehicleAttachments).where(eq(vehicleAttachments.attachmentId, registration.id));
  if (!retired?.retiredAt) throw new Error("Vehicle document retirement did not preserve the record.");

  const files = await db.select({ id: attachments.id, storageKey: attachments.storageKey }).from(attachments).where(inArray(attachments.id, createdAttachmentIds));
  storageKeys.push(...files.map((item) => item.storageKey));
  process.stdout.write(`${JSON.stringify({ status: "passed", primaryPhoto: true, expirationNotifications: queued.length, retirementPreserved: true })}\n`);
} finally {
  if (eventPrefix) {
    await db.delete(userNotifications).where(sql`${userNotifications.eventKey} like ${`${eventPrefix}%`}`);
    await db.delete(notificationOutbox).where(sql`${notificationOutbox.eventKey} like ${`${eventPrefix}%`}`);
  }
  if (createdAttachmentIds.length) {
    await db.delete(auditEvents).where(sql`${auditEvents.metadata}->>'attachmentId' in (${sql.join(createdAttachmentIds.map((id) => sql`${id}`), sql`, `)})`);
    await db.delete(vehicleAttachments).where(inArray(vehicleAttachments.attachmentId, createdAttachmentIds));
    await db.delete(attachments).where(inArray(attachments.id, createdAttachmentIds));
    const root = path.resolve(env.FILE_STORAGE_ROOT);
    for (const storageKey of storageKeys) {
      const target = path.resolve(root, storageKey);
      if (target.startsWith(`${root}${path.sep}`)) await fs.unlink(target).catch(() => undefined);
    }
  }
  await pool.end();
}
