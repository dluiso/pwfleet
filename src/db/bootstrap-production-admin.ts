import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "./client";
import { auditEvents, users } from "./schema";

const inputSchema = z.object({
  NODE_ENV: z.literal("production"),
  BOOTSTRAP_ADMIN_EMAIL: z.email().trim().toLowerCase().max(320),
  BOOTSTRAP_ADMIN_DISPLAY_NAME: z.string().trim().min(2).max(160),
});

async function bootstrapAdministrator() {
  const input = inputSchema.parse(process.env);

  const result = await db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(93284117)`);

    const [existingTarget] = await transaction
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${input.BOOTSTRAP_ADMIN_EMAIL}`)
      .for("update")
      .limit(1);

    if (existingTarget) {
      if (existingTarget.role !== "administrator" || !existingTarget.active) {
        throw new Error("The bootstrap email already belongs to a non-active-administrator record.");
      }
      return { id: existingTarget.id, created: false };
    }

    const [existingAdministrator] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.role} = 'administrator' and ${users.active} = true`)
      .for("update")
      .limit(1);

    if (existingAdministrator) {
      throw new Error("An active administrator already exists; use the authenticated administration workflow.");
    }

    const [created] = await transaction
      .insert(users)
      .values({
        email: input.BOOTSTRAP_ADMIN_EMAIL,
        displayName: input.BOOTSTRAP_ADMIN_DISPLAY_NAME,
        role: "administrator",
        active: true,
      })
      .returning({ id: users.id });

    await transaction.insert(auditEvents).values({
      eventType: "user.bootstrap_created",
      entityType: "user",
      entityId: created!.id,
      metadata: { role: "administrator", source: "production_bootstrap" },
    });

    return { id: created!.id, created: true };
  });

  process.stdout.write(`${JSON.stringify({ status: "administrator-ready", created: result.created })}\n`);
}

bootstrapAdministrator()
  .catch((error: unknown) => {
    const name = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Administrator bootstrap failed: ${name}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
