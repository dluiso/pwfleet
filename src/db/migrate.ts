import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./client";

const migrationDirectory = path.resolve(process.cwd(), "migrations");
const advisoryLockKey = 1_938_220_417;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [advisoryLockKey]);
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await fs.readdir(migrationDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const filename of files) {
      const sql = await fs.readFile(path.join(migrationDirectory, filename), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{
        checksum: string;
      }>("select checksum from schema_migrations where filename = $1", [filename]);

      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${filename} has been modified.`);
        }
        continue;
      }

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (filename, checksum) values ($1, $2)",
          [filename, checksum],
        );
        await client.query("commit");
        process.stdout.write(`Applied ${filename}\n`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [advisoryLockKey]);
    client.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

