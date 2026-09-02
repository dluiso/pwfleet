import { and, eq, gt, isNull } from "drizzle-orm";
import { authSessions, users, type User } from "@/db/schema";
import { readSessionToken } from "./session";

export async function validateActiveSessionToken(token: string): Promise<User> {
  const session = await readSessionToken(token);
  // Keep database initialization behind the authenticated path so /api/live
  // remains available even when configuration or a dependency is unhealthy.
  const { db } = await import("@/db/client");
  const [actor] = await db
    .select({ user: users })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(
      eq(authSessions.id, session.sessionId),
      eq(authSessions.userId, session.userId),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
      eq(users.active, true),
      eq(users.oidcIssuer, session.oidcIssuer),
      eq(users.oidcSubject, session.oidcSubject),
      eq(users.email, session.email),
    ))
    .limit(1);
  if (!actor) throw new Error("The session is inactive or no longer authorized.");
  return actor.user;
}
