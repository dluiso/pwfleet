import { pool } from "@/db/client";
import { processPendingNotifications } from "@/modules/notifications/processor";
import { processSafetyEscalations } from "@/modules/notifications/escalation";
import { processVehicleDocumentExpirations } from "@/modules/notifications/vehicle-document-expirations";
import { processScheduledReports } from "@/modules/reports/scheduler";
import { cleanupRateLimitBuckets } from "@/lib/rate-limit";
import { enforceStorageRetention } from "@/lib/storage-retention";

try {
  const reports = await processScheduledReports();
  const escalations = await processSafetyEscalations();
  const vehicleDocuments = await processVehicleDocumentExpirations();
  const rateLimitBucketsDeleted = await cleanupRateLimitBuckets();
  const storageRetention = await enforceStorageRetention();
  const delivery = await processPendingNotifications();
  process.stdout.write(`${JSON.stringify({ reports, escalations, vehicleDocuments, rateLimitBucketsDeleted, storageRetention, delivery })}\n`);
} catch (error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`Notification processing failed: ${name}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
