import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, auditEvents, notificationOutbox, userNotifications, vehicleAttachments, vehicles } from "@/db/schema";
import { listActiveRecipientsByRole } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";

type ExpirationBucket = "expired" | "7_days" | "30_days" | "60_days";

function bucketFor(expiresOn: string, today: string): { bucket: ExpirationBucket; days: number } {
  const days = Math.floor((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { bucket: "expired", days };
  if (days <= 7) return { bucket: "7_days", days };
  if (days <= 30) return { bucket: "30_days", days };
  return { bucket: "60_days", days };
}

export async function processVehicleDocumentExpirations(now = new Date()) {
  const timeZone = getEnvironment().APP_TIME_ZONE;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);
  const [records, recipients] = await Promise.all([
    db
      .select({
        attachmentId: attachments.id,
        vehicleId: vehicles.id,
        unitNumber: vehicles.unitNumber,
        displayCode: vehicles.displayCode,
        category: vehicleAttachments.category,
        expiresOn: vehicleAttachments.expiresOn,
        originalName: attachments.originalName,
      })
      .from(vehicleAttachments)
      .innerJoin(attachments, eq(vehicleAttachments.attachmentId, attachments.id))
      .innerJoin(vehicles, eq(vehicleAttachments.vehicleId, vehicles.id))
      .where(and(isNull(vehicleAttachments.retiredAt), lte(vehicleAttachments.expiresOn, cutoff))),
    listActiveRecipientsByRole(["fleet_manager", "administrator"]),
  ]);
  let queued = 0;
  for (const record of records) {
    if (!record.expiresOn) continue;
    const { bucket, days } = bucketFor(record.expiresOn, today);
    const vehicleCode = record.displayCode || record.unitNumber;
    const expired = bucket === "expired";
    const body = expired
      ? `${record.category.replaceAll("_", " ")} for vehicle ${vehicleCode} expired on ${record.expiresOn}. Replace or verify the controlled record.`
      : `${record.category.replaceAll("_", " ")} for vehicle ${vehicleCode} expires on ${record.expiresOn} (${days} day${days === 1 ? "" : "s"}).`;
    for (const recipient of recipients) {
      const eventKey = `vehicle-document-expiry:${record.attachmentId}:${bucket}`;
      const result = await db.transaction(async (transaction) => {
        const outbox = await transaction
          .insert(notificationOutbox)
          .values({
            eventKey,
            recipientUserId: recipient.id,
            recipientEmail: recipient.email,
            urgency: expired ? "critical" : "normal",
            subject: `${expired ? "Expired" : "Expiring"} vehicle document · ${vehicleCode}`,
            templateKey: "vehicle_document_expiration",
            payload: { vehicleId: record.vehicleId, vehicleCode, documentName: record.originalName, documentCategory: record.category, expiresOn: record.expiresOn, notificationBody: body },
          })
          .onConflictDoNothing()
          .returning({ id: notificationOutbox.id });
        await transaction
          .insert(userNotifications)
          .values({ eventKey, userId: recipient.id, kind: "system", urgency: expired ? "critical" : "normal", title: `${expired ? "Expired" : "Expiring"} vehicle document · ${vehicleCode}`, body, href: `/vehicles/${record.vehicleId}`, requiresAcknowledgment: expired })
          .onConflictDoNothing();
        return outbox.length;
      });
      queued += result;
    }
  }
  if (queued) {
    await db.insert(auditEvents).values({ eventType: "vehicle.document_expiration_notifications_queued", entityType: "vehicle_document", metadata: { queued, evaluated: records.length, runAt: now.toISOString() } });
  }
  return { evaluated: records.length, queued };
}
