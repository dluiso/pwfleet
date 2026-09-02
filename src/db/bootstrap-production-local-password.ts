import { and, eq, sql } from "drizzle-orm";
import fs from "node:fs";
import { z } from "zod";
import { db, pool } from "./client";
import { auditEvents, users } from "./schema";
import { hashLocalPassword, validateLocalPassword, verifyLocalPassword } from "@/lib/password";

const inputSchema = z.object({
  NODE_ENV: z.literal("production"),
  AUTH_MODE: z.literal("local"),
  BOOTSTRAP_ADMIN_EMAIL: z.email().trim().toLowerCase().max(320),
});

async function bootstrapLocalPassword() {
  const input = inputSchema.parse(process.env);
  const password = z.string().min(12).max(128).parse(fs.readFileSync(0, "utf8"));
  if (!validateLocalPassword(password)) {
    throw new Error("The password does not meet the local authentication policy.");
  }
  const passwordHash = await hashLocalPassword(password);

  const created = await db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(93284119)`);
    const [administrator] = await transaction
      .select()
      .from(users)
      .where(and(
        sql`lower(${users.email}) = ${input.BOOTSTRAP_ADMIN_EMAIL}`,
        eq(users.role, "administrator"),
        eq(users.active, true),
      ))
      .for("update")
      .limit(1);
    if (!administrator) throw new Error("The active bootstrap administrator record is unavailable.");
    if (administrator.localPasswordHash) {
      if (!await verifyLocalPassword(password, administrator.localPasswordHash)) {
        throw new Error("A different local password is already configured; use the authenticated password-management workflow.");
      }
      return false;
    }

    await transaction
      .update(users)
      .set({
        localPasswordHash: passwordHash,
        localPasswordChangedAt: new Date(),
        recordVersion: administrator.recordVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, administrator.id));
    await transaction.insert(auditEvents).values({
      actorUserId: administrator.id,
      eventType: "authentication.local_password_bootstrapped",
      entityType: "user",
      entityId: administrator.id,
      metadata: { source: "production_bootstrap" },
    });
    return true;
  });

  process.stdout.write(`${JSON.stringify({ status: "administrator-local-password-ready", created })}\n`);
}

bootstrapLocalPassword()
  .catch((error: unknown) => {
    const name = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Administrator local password bootstrap failed: ${name}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
