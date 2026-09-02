import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getEnvironment } from "@/lib/env";
import { checkMalwareScanner } from "@/lib/malware-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = getEnvironment();
    // Importing the database client creates its connection pool. Keep that work
    // inside the guarded readiness path so invalid configuration is reported as
    // unavailable instead of escaping as an unhandled module-initialization error.
    const { db } = await import("@/db/client");
    const storageRoot = path.resolve(env.FILE_STORAGE_ROOT);
    await Promise.all([db.execute(sql`select 1`), fs.access(storageRoot, fs.constants.R_OK | fs.constants.W_OK), checkMalwareScanner()]);
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
