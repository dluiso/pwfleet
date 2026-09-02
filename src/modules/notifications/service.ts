import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, userNotifications } from "@/db/schema";
import { getCurrentActor } from "@/lib/auth";
import { notificationActionSchema } from "./validation";

export class NotificationActionError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = "NotificationActionError";
  }
}

export async function updateUserNotification(notificationId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  const parsed = notificationActionSchema.safeParse(rawInput);
  if (!parsed.success) throw new NotificationActionError("The notification action is invalid.", 400, parsed.error.flatten());
  return db.transaction(async (transaction) => {
    const [record] = await transaction.select().from(userNotifications).where(and(eq(userNotifications.id, notificationId), eq(userNotifications.userId, actor.id))).for("update").limit(1);
    if (!record) throw new NotificationActionError("Notification not found.", 404);
    const now = new Date();
    const acknowledge = parsed.data.action === "acknowledge";
    if (acknowledge && !record.requiresAcknowledgment) throw new NotificationActionError("This notification does not require acknowledgment.", 409);
    await transaction.update(userNotifications).set({ readAt: record.readAt ?? now, ...(acknowledge ? { acknowledgedAt: record.acknowledgedAt ?? now } : {}) }).where(eq(userNotifications.id, record.id));
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: acknowledge ? "notification.acknowledged" : "notification.read", entityType: "user_notification", entityId: record.id, metadata: { eventKey: record.eventKey } });
    return { id: record.id, read: true, acknowledged: acknowledge || Boolean(record.acknowledgedAt) };
  });
}

export async function markAllNotificationsRead() {
  const actor = await getCurrentActor();
  const now = new Date();
  const updated = await db.update(userNotifications).set({ readAt: now }).where(and(eq(userNotifications.userId, actor.id), isNull(userNotifications.readAt))).returning({ id: userNotifications.id });
  if (updated.length) await db.insert(auditEvents).values({ actorUserId: actor.id, eventType: "notification.read_all", entityType: "user_notification", metadata: { count: updated.length } });
  return { updated: updated.length };
}
