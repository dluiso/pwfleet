import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "./client";
import { auditEvents, users } from "./schema";

const inputSchema = z.object({
  NODE_ENV: z.literal("production"),
  BOOTSTRAP_ADMIN_EMAIL: z.email().trim().toLowerCase().max(320),
  BOOTSTRAP_ADMIN_IDENTITY_SUBJECT: z.uuid().transform((value) => value.toLowerCase()),
  OIDC_ISSUER: z.url().startsWith("https://"),
});

async function bindBootstrapAdministrator() {
  const input = inputSchema.parse(process.env);
  const result = await db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(93284118)`);
    const [administrator] = await transaction
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${input.BOOTSTRAP_ADMIN_EMAIL}`, eq(users.role, "administrator"), eq(users.active, true)))
      .for("update")
      .limit(1);
    if (!administrator) throw new Error("The active bootstrap administrator record is unavailable.");
    if (administrator.oidcIssuer || administrator.oidcSubject) {
      if (administrator.oidcIssuer !== input.OIDC_ISSUER || administrator.oidcSubject !== input.BOOTSTRAP_ADMIN_IDENTITY_SUBJECT) {
        throw new Error("The bootstrap administrator is already bound to a different identity.");
      }
      return false;
    }
    const [identityOwner] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.oidcIssuer, input.OIDC_ISSUER), eq(users.oidcSubject, input.BOOTSTRAP_ADMIN_IDENTITY_SUBJECT)))
      .limit(1);
    if (identityOwner) throw new Error("The requested provider identity is already assigned.");
    await transaction
      .update(users)
      .set({
        oidcIssuer: input.OIDC_ISSUER,
        oidcSubject: input.BOOTSTRAP_ADMIN_IDENTITY_SUBJECT,
        identityBoundAt: new Date(),
        recordVersion: administrator.recordVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, administrator.id));
    await transaction.insert(auditEvents).values({
      actorUserId: administrator.id,
      eventType: "authentication.bootstrap_identity_bound",
      entityType: "user",
      entityId: administrator.id,
      metadata: { source: "production_bootstrap" },
    });
    return true;
  });
  process.stdout.write(`${JSON.stringify({ status: "administrator-identity-ready", created: result })}\n`);
}

bindBootstrapAdministrator()
  .catch((error: unknown) => {
    const name = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Administrator identity binding failed: ${name}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
