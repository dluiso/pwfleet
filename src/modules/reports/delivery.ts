import { db } from "@/db/client";
import { auditEvents, notificationOutbox, reportDeliveries, userNotifications } from "@/db/schema";
import { createFleetReportArtifact } from "./artifacts";
import type { FleetReportFilters } from "./validation";

export async function queueFleetReportDelivery(input: { deliveryKey: string; reportKey: string; subscriptionId: string | null; scheduledFor: Date; recipient: { id: string; email: string }; format: "pdf" | "csv"; filters: FleetReportFilters; actorUserId?: string | null }) {
  const { artifact } = await createFleetReportArtifact({ reportKey: input.reportKey, format: input.format, filters: input.filters });
  return db.transaction(async (transaction) => {
    const eventKey = `report:${input.deliveryKey}`;
    const [outbox] = await transaction.insert(notificationOutbox).values({ eventKey, recipientUserId: input.recipient.id, recipientEmail: input.recipient.email, urgency: "normal", subject: `Harvey PW fleet report - ${input.filters.from} through ${input.filters.to}`, templateKey: "report_delivery", payload: { reportArtifactId: artifact.id, reportFormat: input.format, reportPeriod: `${input.filters.from} through ${input.filters.to}`, notificationBody: "Your requested fleet operations report is attached." } }).onConflictDoNothing().returning({ id: notificationOutbox.id });
    if (!outbox) throw new Error("This report delivery was already queued.");
    const [delivery] = await transaction.insert(reportDeliveries).values({ subscriptionId: input.subscriptionId, artifactId: artifact.id, notificationOutboxId: outbox.id, deliveryKey: input.deliveryKey, recipientEmail: input.recipient.email, scheduledFor: input.scheduledFor }).returning();
    await transaction.insert(userNotifications).values({ eventKey, userId: input.recipient.id, kind: "report", urgency: "normal", title: "Fleet report queued", body: `The ${input.format.toUpperCase()} report for ${input.filters.from} through ${input.filters.to} is queued for delivery.`, href: "/reports", requiresAcknowledgment: false }).onConflictDoNothing();
    await transaction.insert(auditEvents).values({ actorUserId: input.actorUserId ?? null, eventType: "report.delivery_queued", entityType: "report_delivery", entityId: delivery!.id, metadata: { subscriptionId: input.subscriptionId, artifactId: artifact.id, format: input.format, from: input.filters.from, to: input.filters.to, recipientUserId: input.recipient.id } });
    return delivery!;
  });
}
