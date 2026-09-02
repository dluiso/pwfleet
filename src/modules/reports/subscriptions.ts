import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, reportDeliveries, reportSubscriptions, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { FleetReportError } from "./fleet-report";
import { queueFleetReportDelivery } from "./delivery";
import { nextReportOccurrence } from "./schedule";
import { manualReportDeliverySchema, reportSubscriptionInputSchema } from "./subscription-validation";

export async function listReportSubscriptionData() {
  await requirePermission("configuration:manage");
  const [subscriptions, recipients, deliveries] = await Promise.all([
    db.select({ id: reportSubscriptions.id, name: reportSubscriptions.name, recipientUserId: reportSubscriptions.recipientUserId, recipientName: users.displayName, recipientEmail: users.email, frequency: reportSubscriptions.frequency, format: reportSubscriptions.format, timeZone: reportSubscriptions.timeZone, deliveryHourLocal: reportSubscriptions.deliveryHourLocal, dayOfWeek: reportSubscriptions.dayOfWeek, dayOfMonth: reportSubscriptions.dayOfMonth, monthOfYear: reportSubscriptions.monthOfYear, filters: reportSubscriptions.filters, active: reportSubscriptions.active, nextRunAt: reportSubscriptions.nextRunAt, lastRunAt: reportSubscriptions.lastRunAt, recordVersion: reportSubscriptions.recordVersion }).from(reportSubscriptions).innerJoin(users, eq(reportSubscriptions.recipientUserId, users.id)).orderBy(desc(reportSubscriptions.createdAt)),
    db.select({ id: users.id, displayName: users.displayName, email: users.email }).from(users).where(eq(users.active, true)).orderBy(users.displayName),
    db.select().from(reportDeliveries).orderBy(desc(reportDeliveries.createdAt)).limit(100),
  ]);
  return { subscriptions, recipients, deliveries };
}

async function activeRecipient(userId: string) {
  const [recipient] = await db.select({ id: users.id, email: users.email, active: users.active }).from(users).where(eq(users.id, userId)).limit(1);
  if (!recipient?.active) throw new FleetReportError("Select an active report recipient.", 422);
  return recipient;
}

export async function createReportSubscription(rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const parsed = reportSubscriptionInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new FleetReportError("The report subscription is invalid.", 400, parsed.error.flatten());
  const input = parsed.data;
  await activeRecipient(input.recipientUserId);
  const nextRunAt = nextReportOccurrence(input, new Date());
  const [created] = await db.insert(reportSubscriptions).values({ ...input, recordVersion: 1, nextRunAt, createdByUserId: actor.id }).returning();
  await db.insert(auditEvents).values({ actorUserId: actor.id, eventType: "report_subscription.created", entityType: "report_subscription", entityId: created!.id, metadata: { recipientUserId: input.recipientUserId, frequency: input.frequency, format: input.format, nextRunAt: nextRunAt.toISOString() } });
  return created!;
}

export async function updateReportSubscription(subscriptionId: string, rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const parsed = reportSubscriptionInputSchema.safeParse(rawInput);
  if (!parsed.success || !parsed.data.recordVersion) throw new FleetReportError("The report subscription is invalid.", 400, parsed.success ? undefined : parsed.error.flatten());
  const input = parsed.data;
  await activeRecipient(input.recipientUserId);
  return db.transaction(async (transaction) => {
    const [current] = await transaction.select().from(reportSubscriptions).where(eq(reportSubscriptions.id, subscriptionId)).for("update").limit(1);
    if (!current) throw new FleetReportError("Report subscription not found.", 404);
    if (current.recordVersion !== input.recordVersion) throw new FleetReportError("This subscription changed after it was opened. Refresh and try again.", 409);
    const nextRunAt = nextReportOccurrence(input, new Date());
    const [updated] = await transaction.update(reportSubscriptions).set({ ...input, nextRunAt, recordVersion: current.recordVersion + 1, updatedAt: new Date() }).where(and(eq(reportSubscriptions.id, subscriptionId), eq(reportSubscriptions.recordVersion, input.recordVersion))).returning();
    if (!updated) throw new FleetReportError("This subscription was updated concurrently.", 409);
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "report_subscription.updated", entityType: "report_subscription", entityId: subscriptionId, metadata: { recipientUserId: input.recipientUserId, frequency: input.frequency, format: input.format, active: input.active, nextRunAt: nextRunAt.toISOString() } });
    return updated;
  });
}

export async function queueManualFleetReport(rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const parsed = manualReportDeliverySchema.safeParse(rawInput);
  if (!parsed.success) throw new FleetReportError("The manual report delivery is invalid.", 400, parsed.error.flatten());
  const recipient = await activeRecipient(parsed.data.recipientUserId);
  const token = crypto.randomUUID();
  return queueFleetReportDelivery({ deliveryKey: `manual:${token}`, reportKey: `manual:${token}`, subscriptionId: null, scheduledFor: new Date(), recipient, format: parsed.data.format, filters: parsed.data.filters, actorUserId: actor.id });
}
