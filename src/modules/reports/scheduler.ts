import { and, eq, lte } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { auditEvents, reportDeliveries, reportSubscriptions, userNotifications, users } from "@/db/schema";
import { queueFleetReportDelivery } from "./delivery";
import { nextReportOccurrence, reportWindowForOccurrence } from "./schedule";
import { fleetReportFiltersSchema } from "./validation";

const schedulerLockKey = 1_938_220_421;

function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "Unknown report generation error."; }

export async function processScheduledReports(now = new Date()) {
  const lockClient = await pool.connect();
  const result = { subscriptionsDue: 0, queued: 0, failed: 0, skipped: false };
  try {
    const lock = await lockClient.query<{ acquired: boolean }>("select pg_try_advisory_lock($1) as acquired", [schedulerLockKey]);
    if (!lock.rows[0]?.acquired) return { ...result, skipped: true };
    const due = await db.select({ subscription: reportSubscriptions, recipientId: users.id, recipientEmail: users.email }).from(reportSubscriptions).innerJoin(users, eq(reportSubscriptions.recipientUserId, users.id)).where(and(eq(reportSubscriptions.active, true), eq(users.active, true), lte(reportSubscriptions.nextRunAt, now))).limit(25);
    result.subscriptionsDue = due.length;
    for (const row of due) {
      const subscription = row.subscription;
      const scheduledFor = subscription.nextRunAt;
      const window = reportWindowForOccurrence(subscription.frequency, scheduledFor, subscription.timeZone);
      const filters = fleetReportFiltersSchema.parse({ ...subscription.filters, ...window });
      const deliveryKey = `subscription:${subscription.id}:${window.from}:${window.to}:${subscription.format}`;
      try {
        await queueFleetReportDelivery({ deliveryKey, reportKey: deliveryKey, subscriptionId: subscription.id, scheduledFor, recipient: { id: row.recipientId, email: row.recipientEmail }, format: subscription.format, filters });
        result.queued += 1;
      } catch (error) {
        result.failed += 1;
        const lastError = safeError(error);
        await db.insert(reportDeliveries).values({ subscriptionId: subscription.id, artifactId: null, notificationOutboxId: null, deliveryKey, recipientEmail: row.recipientEmail, status: "failed", scheduledFor, lastError }).onConflictDoNothing();
        await db.insert(userNotifications).values({ eventKey: `report-failure:${deliveryKey}`, userId: row.recipientId, kind: "report", urgency: "critical", title: "Scheduled report failed", body: "The scheduled report could not be generated. An administrator must review delivery history.", href: "/settings/reports", requiresAcknowledgment: true }).onConflictDoNothing();
        await db.insert(auditEvents).values({ eventType: "report.delivery_failed", entityType: "report_subscription", entityId: subscription.id, metadata: { deliveryKey, error: lastError } });
      }
      const nextRunAt = nextReportOccurrence(subscription, scheduledFor);
      await db.update(reportSubscriptions).set({ lastRunAt: scheduledFor, nextRunAt, recordVersion: subscription.recordVersion + 1, updatedAt: now }).where(and(eq(reportSubscriptions.id, subscription.id), eq(reportSubscriptions.recordVersion, subscription.recordVersion)));
    }
    return result;
  } finally {
    await lockClient.query("select pg_advisory_unlock($1)", [schedulerLockKey]).catch(() => undefined);
    lockClient.release();
  }
}
