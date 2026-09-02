import fs from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "@/lib/env";

async function main() {
  const env = getEnvironment();
  if (env.NODE_ENV !== "production") throw new Error("Production configuration checks require NODE_ENV=production.");
  if (!env.DATABASE_SSL_CA_FILE) throw new Error("Production requires an explicit database CA file.");
  await fs.access(path.resolve(env.DATABASE_SSL_CA_FILE), fs.constants.R_OK);
  process.stdout.write(`${JSON.stringify({ status: "configuration-valid", authentication: env.AUTH_MODE, databaseTls: "verified-ca-required", email: env.EMAIL_MODE, fileScanning: "clamav" })}\n`);
}

main().catch((error) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`Production configuration validation failed: ${name}\n`);
  process.exitCode = 1;
});
