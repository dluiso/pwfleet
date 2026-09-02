import { z } from "zod";
import { pool } from "./client";
import { ensureInitialFormCatalog } from "./seed";

async function bootstrapProductionCatalog() {
  z.object({ NODE_ENV: z.literal("production") }).parse(process.env);
  const catalog = await ensureInitialFormCatalog();
  process.stdout.write(
    `${JSON.stringify({
      status: "initial-form-catalog-ready",
      vehicleClasses: [catalog.dumpTruckClass.code, catalog.pickupClass.code],
      templates: [catalog.dumpTemplate.code, catalog.standardTemplate.code],
    })}\n`,
  );
}

bootstrapProductionCatalog()
  .catch((error: unknown) => {
    const name = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Production catalog bootstrap failed: ${name}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
