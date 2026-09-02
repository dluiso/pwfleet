import { inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { users, type User } from "@/db/schema";
import { getEnvironment } from "./env";
import { sessionCookieName } from "./session";
import { validateActiveSessionToken } from "./session-auth";

export type Permission =
  | "fleet:read"
  | "fleet:write"
  | "inspection:submit"
  | "inspection:review"
  | "maintenance:manage"
  | "configuration:manage"
  | "reports:read"
  | "audit:read";

const rolePermissions: Record<User["role"], ReadonlySet<Permission>> = {
  driver: new Set(["fleet:read", "inspection:submit"]),
  supervisor: new Set([
    "fleet:read",
    "inspection:submit",
    "inspection:review",
    "reports:read",
  ]),
  fleet_manager: new Set([
    "fleet:read",
    "fleet:write",
    "inspection:submit",
    "inspection:review",
    "maintenance:manage",
    "reports:read",
  ]),
  maintenance_technician: new Set([
    "fleet:read",
    "inspection:review",
    "maintenance:manage",
  ]),
  administrator: new Set([
    "fleet:read",
    "fleet:write",
    "inspection:submit",
    "inspection:review",
    "maintenance:manage",
    "configuration:manage",
    "reports:read",
    "audit:read",
  ]),
  auditor: new Set(["fleet:read", "reports:read", "audit:read"]),
};

export class AuthenticationRequiredError extends Error {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationError extends Error {
  constructor(permission: Permission) {
    super(`The current user does not have the required permission: ${permission}.`);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentActor(): Promise<User> {
  const env = getEnvironment();

  if (env.AUTH_MODE === "oidc") {
    const token = (await cookies()).get(sessionCookieName())?.value;
    if (!token) throw new AuthenticationRequiredError();
    try {
      return await validateActiveSessionToken(token);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) throw error;
      throw new AuthenticationRequiredError("The authentication session is invalid or expired.");
    }
  }

  const actor = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${env.DEV_ACTOR_EMAIL!})`)
    .limit(1);

  if (!actor[0]?.active) {
    throw new AuthenticationRequiredError("The configured development actor is inactive or missing.");
  }

  return actor[0];
}

export async function requirePermission(permission: Permission): Promise<User> {
  const actor = await getCurrentActor();
  if (!rolePermissions[actor.role].has(permission)) {
    throw new AuthorizationError(permission);
  }
  return actor;
}

export async function listActiveRecipientsByRole(
  roles: User["role"][],
): Promise<User[]> {
  if (!roles.length) return [];
  return db
    .select()
    .from(users)
    .where(sql`${users.active} = true and ${inArray(users.role, roles)}`);
}

export function can(actor: User, permission: Permission): boolean {
  return rolePermissions[actor.role].has(permission);
}
