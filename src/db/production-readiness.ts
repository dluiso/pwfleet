import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./client";
import { inspectionTemplates, users, vehicleInspectionAssignments } from "./schema";
import { getEnvironment } from "@/lib/env";
import { checkMalwareScanner } from "@/lib/malware-scan";
import { discoverOidc } from "@/lib/oidc";
import { createSmtpTransportForConfiguration } from "@/modules/notifications/email";
import { getRuntimeIntegrationConfiguration } from "@/modules/integrations/settings";

const env = getEnvironment();
if (env.NODE_ENV !== "production") throw new Error("Production readiness checks require NODE_ENV=production.");

try {
  const storageRoot = path.resolve(env.FILE_STORAGE_ROOT);
  await fs.access(storageRoot, fs.constants.R_OK | fs.constants.W_OK);
  const migrations = (await fs.readdir(path.resolve(process.cwd(), "migrations"))).filter((file) => file.endsWith(".sql")).sort();
  const applied = await db.execute<{ filename: string; checksum: string }>(sql`select filename, checksum from schema_migrations order by filename`);
  const appliedByName = new Map(applied.rows.map((row) => [row.filename, row.checksum]));
  for (const filename of migrations) {
    const source = await fs.readFile(path.resolve(process.cwd(), "migrations", filename));
    const expected = crypto.createHash("sha256").update(source).digest("hex");
    if (appliedByName.get(filename) !== expected) throw new Error(`Database migration validation failed for ${filename}.`);
  }
  const [administrator] = await db.select({ id: users.id, localPasswordHash: users.localPasswordHash }).from(users).where(sql`${users.role} = 'administrator' and ${users.active} = true`).limit(1);
  if (!administrator) throw new Error("At least one active administrator is required.");
  const integrations = await getRuntimeIntegrationConfiguration();
  if (integrations.authentication.mode === "local" && !administrator.localPasswordHash) throw new Error("Local authentication requires an active administrator with a password.");
  const [unsafeAssignment] = await db
    .select({ id: vehicleInspectionAssignments.id })
    .from(vehicleInspectionAssignments)
    .innerJoin(inspectionTemplates, eq(vehicleInspectionAssignments.templateId, inspectionTemplates.id))
    .where(sql`(${vehicleInspectionAssignments.effectiveUntil} is null or ${vehicleInspectionAssignments.effectiveUntil} >= current_date) and ${inspectionTemplates.ruleSetStatus} <> 'approved'`)
    .limit(1);
  if (unsafeAssignment) throw new Error("Every active vehicle form assignment must use an approved rule set.");
  const discovery = integrations.authentication.mode === "oidc" ? await discoverOidc(integrations.authentication) : null;
  const malware = await checkMalwareScanner();
  const smtp = integrations.email.mode === "smtp" ? await createSmtpTransportForConfiguration(integrations.email) : null;
  if (integrations.email.mode === "smtp") {
    if (!smtp) throw new Error("SMTP transport is required when email delivery is enabled.");
    await smtp.verify();
    smtp.close();
  }
  process.stdout.write(`${JSON.stringify({
    status: "ready",
    databaseMigrations: migrations.length,
    storage: "writable",
    authentication: integrations.authentication.mode,
    ...(discovery ? { oidcIssuerValidated: discovery.issuer } : {}),
    malwareScanner: malware,
    email: integrations.email.mode === "smtp" ? "smtp-verified" : "capture",
    activeAdministrator: true,
  })}\n`);
} catch (error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`Production readiness failed: ${name}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
