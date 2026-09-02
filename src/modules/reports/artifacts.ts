import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { reportArtifacts } from "@/db/schema";
import { getEnvironment } from "@/lib/env";
import { buildFleetOperationalReport, renderFleetReportCsv } from "./fleet-report";
import { renderFleetOperationalPdf } from "./fleet-report-pdf";
import type { FleetReportFilters } from "./validation";

export async function createFleetReportArtifact(input: { reportKey: string; format: "pdf" | "csv"; filters: FleetReportFilters }) {
  const env = getEnvironment();
  const report = await buildFleetOperationalReport(input.filters);
  const bytes = input.format === "pdf" ? await renderFleetOperationalPdf(report) : Buffer.from(renderFleetReportCsv(report), "utf8");
  const id = crypto.randomUUID();
  const storageKey = path.posix.join("reports", String(report.generatedAt.getUTCFullYear()), String(report.generatedAt.getUTCMonth() + 1).padStart(2, "0"), `${id}.${input.format}`);
  const root = path.resolve(env.FILE_STORAGE_ROOT);
  const destination = path.resolve(root, storageKey);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("Invalid report storage destination.");
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
  const filename = `harvey-fleet-${input.filters.from}-to-${input.filters.to}.${input.format}`;
  try {
    const [artifact] = await db.insert(reportArtifacts).values({ id, reportKey: input.reportKey, format: input.format, periodStart: input.filters.from, periodEnd: input.filters.to, filters: Object.fromEntries(Object.entries(input.filters).filter((entry): entry is [string, string] => typeof entry[1] === "string")), storageKey, filename, mimeType: input.format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8", byteSize: bytes.byteLength, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), expiresAt: new Date(Date.now() + env.REPORT_ARTIFACT_RETENTION_DAYS * 86_400_000) }).returning();
    return { artifact: artifact!, report };
  } catch (error) {
    await fs.unlink(destination).catch(() => undefined);
    throw error;
  }
}
