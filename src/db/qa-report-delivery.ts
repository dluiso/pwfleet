import fs from "node:fs/promises";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import { db, pool } from "./client";
import { auditEvents, notificationOutbox, reportArtifacts, reportDeliveries, userNotifications, users } from "./schema";
import { getEnvironment } from "@/lib/env";
import { processPendingNotifications } from "@/modules/notifications/processor";
import { queueManualFleetReport } from "@/modules/reports/subscriptions";

async function run() {
  if (getEnvironment().NODE_ENV === "production") throw new Error("Report-delivery QA cannot run in production.");
  const [[pending], [actor]] = await Promise.all([
    db.select({ value: count() }).from(notificationOutbox).where(eq(notificationOutbox.status, "pending")),
    db.select({ id: users.id }).from(users).where(eq(users.email, getEnvironment().DEV_ACTOR_EMAIL!)).limit(1),
  ]);
  if (!actor || (pending?.value ?? 0) !== 0) throw new Error("An active development actor and an empty pending outbox are required for isolated report QA.");
  let deliveryId: string | undefined;
  let artifactId: string | undefined;
  let outboxId: string | undefined;
  let eventKey: string | undefined;
  let artifactPath: string | undefined;
  try {
    const delivery = await queueManualFleetReport({ recipientUserId: actor.id, format: "pdf", filters: { from: "2026-08-01", to: "2026-08-31", vehicleId: "", vehicleClassId: "", driverUserId: "", templateId: "", severity: "", disposition: "", maintenanceStatus: "" } });
    deliveryId = delivery.id;
    artifactId = delivery.artifactId!;
    outboxId = delivery.notificationOutboxId!;
    const [[artifact], [outbox]] = await Promise.all([db.select().from(reportArtifacts).where(eq(reportArtifacts.id, artifactId)).limit(1), db.select({ eventKey: notificationOutbox.eventKey }).from(notificationOutbox).where(eq(notificationOutbox.id, outboxId)).limit(1)]);
    if (!artifact || !outbox) throw new Error("Report artifact or outbox record was not created.");
    eventKey = outbox.eventKey;
    const root = path.resolve(getEnvironment().FILE_STORAGE_ROOT);
    artifactPath = path.resolve(root, artifact.storageKey);
    const signature = (await fs.readFile(artifactPath)).subarray(0, 4).toString("ascii");
    if (signature !== "%PDF") throw new Error("Generated report artifact is not a PDF.");
    const processed = await processPendingNotifications(10);
    const [captured] = await db.select({ status: reportDeliveries.status }).from(reportDeliveries).where(eq(reportDeliveries.id, deliveryId)).limit(1);
    if (processed.processed !== 1 || captured?.status !== "captured") throw new Error("Report delivery was not captured successfully.");
    return { deliveryId, artifactId, status: captured.status, bytes: artifact.byteSize, sha256: artifact.sha256 };
  } finally {
    if (deliveryId) await db.delete(auditEvents).where(eq(auditEvents.entityId, deliveryId));
    if (deliveryId) await db.delete(reportDeliveries).where(eq(reportDeliveries.id, deliveryId));
    if (eventKey) await db.delete(userNotifications).where(eq(userNotifications.eventKey, eventKey));
    if (outboxId) await db.delete(notificationOutbox).where(eq(notificationOutbox.id, outboxId));
    if (artifactId) await db.delete(reportArtifacts).where(eq(reportArtifacts.id, artifactId));
    if (artifactPath) await fs.unlink(artifactPath).catch(() => undefined);
  }
}

try { process.stdout.write(`${JSON.stringify(await run())}\n`); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "Unknown report QA error"}\n`); process.exitCode = 1; } finally { await pool.end(); }
