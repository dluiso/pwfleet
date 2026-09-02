import fs from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnvironment } from "@/lib/env";
import * as schema from "./schema";

type DatabaseGlobals = typeof globalThis & {
  __fleetPool?: Pool;
};

function createPool(): Pool {
  const env = getEnvironment();
  const ssl =
    env.DATABASE_SSL_MODE === "require"
      ? {
          rejectUnauthorized: true,
          ...(env.DATABASE_SSL_CA_FILE
            ? { ca: fs.readFileSync(env.DATABASE_SSL_CA_FILE, "utf8") }
            : {}),
        }
      : false;

  return new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    ssl,
    application_name: "harvey-pw-fleet",
  });
}

const databaseGlobals = globalThis as DatabaseGlobals;
export const pool = databaseGlobals.__fleetPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  databaseGlobals.__fleetPool = pool;
}

export const db = drizzle(pool, { schema });

