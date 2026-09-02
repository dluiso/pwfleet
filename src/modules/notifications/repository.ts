import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { userNotifications } from "@/db/schema";
import { getCurrentActor } from "@/lib/auth";

export async function getNotificationSummary() {
  const actor = await getCurrentActor();
  const [[unread], recent] = await Promise.all([
    db.select({ value: count() }).from(userNotifications).where(and(eq(userNotifications.userId, actor.id), isNull(userNotifications.readAt))),
    db.select().from(userNotifications).where(eq(userNotifications.userId, actor.id)).orderBy(desc(userNotifications.createdAt)).limit(5),
  ]);
  return { unreadCount: unread?.value ?? 0, recent };
}

export async function listUserNotifications(limit = 100) {
  const actor = await getCurrentActor();
  return db
    .select()
    .from(userNotifications)
    .where(eq(userNotifications.userId, actor.id))
    .orderBy(desc(userNotifications.createdAt))
    .limit(Math.min(Math.max(limit, 1), 250));
}
