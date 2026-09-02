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
      eq(users.email, session.email),
    ))
    .limit(1);
  if (!actor) throw new Error("The session is inactive or no longer authorized.");
  if (session.authMethod === "local") {
    if (!actor.user.localPasswordHash || actor.user.recordVersion !== session.authVersion) {
      throw new Error("The local authentication binding is no longer valid.");
    }
  } else if (actor.user.oidcIssuer !== session.oidcIssuer || actor.user.oidcSubject !== session.oidcSubject) {
    throw new Error("The OIDC authentication binding is no longer valid.");
  }
  return actor.user;
}
