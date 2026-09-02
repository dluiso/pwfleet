import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./client";
import { inspectionTemplates, users, vehicleInspectionAssignments } from "./schema";
import { getEnvironment } from "@/lib/env";
import { checkMalwareScanner } from "@/lib/malware-scan";
import { discoverOidc } from "@/lib/oidc";
import { createSmtpTransport } from "@/modules/notifications/email";

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
  const [administrator] = await db.select({ id: users.id }).from(users).where(sql`${users.role} = 'administrator' and ${users.active} = true`).limit(1);
  if (!administrator) throw new Error("At least one active administrator is required.");
  const [unsafeAssignment] = await db
    .select({ id: vehicleInspectionAssignments.id })
    .from(vehicleInspectionAssignments)
    .innerJoin(inspectionTemplates, eq(vehicleInspectionAssignments.templateId, inspectionTemplates.id))
    .where(sql`(${vehicleInspectionAssignments.effectiveUntil} is null or ${vehicleInspectionAssignments.effectiveUntil} >= current_date) and ${inspectionTemplates.ruleSetStatus} <> 'approved'`)
    .limit(1);
  if (unsafeAssignment) throw new Error("Every active vehicle form assignment must use an approved rule set.");
  const discovery = await discoverOidc();
  const malware = await checkMalwareScanner();
  const smtp = createSmtpTransport();
  if (!smtp) throw new Error("SMTP transport is required in production.");
  await smtp.verify();
  smtp.close();
  process.stdout.write(`${JSON.stringify({ status: "ready", databaseMigrations: migrations.length, storage: "writable", oidcIssuerValidated: discovery.issuer, malwareScanner: malware, smtp: "verified", activeAdministrator: true })}\n`);
} catch (error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`Production readiness failed: ${name}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
