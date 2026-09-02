import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "./client";
import {
  vehicleInspectionAssignments,
  vehicleQrCodes,
  vehicles,
} from "./schema";
import { getEnvironment } from "@/lib/env";
import { getTemplateDefinition } from "@/modules/fleet/repository";
import { submitInspection } from "@/modules/inspections/service";

function responseFor(item: {
  fieldType: string;
  options: string[] | null;
}, odometer: number) {
  switch (item.fieldType) {
    case "pass_defect_na":
      return "pass";
    case "odometer":
      return odometer;
    case "fuel_level":
    case "select":
      return item.options?.[0] ?? "Recorded";
    case "number":
      return 1;
    case "attestation":
      return true;
    case "damage_map":
      return [];
    case "textarea":
    case "text":
    case "photo":
    default:
      return "Development QA record";
  }
}

async function createQaInspection() {
  const env = getEnvironment();
  if (env.NODE_ENV === "production") {
    throw new Error("QA records cannot be created in production.");
  }

  const rows = await db
    .select({
      vehicleId: vehicles.id,
      currentOdometer: vehicles.currentOdometer,
      templateId: vehicleInspectionAssignments.templateId,
      qrCodeId: vehicleQrCodes.id,
    })
    .from(vehicles)
    .innerJoin(
      vehicleInspectionAssignments,
      eq(vehicleInspectionAssignments.vehicleId, vehicles.id),
    )
    .leftJoin(
      vehicleQrCodes,
      and(eq(vehicleQrCodes.vehicleId, vehicles.id), eq(vehicleQrCodes.status, "active")),
    )
    .where(eq(vehicles.unitNumber, "03"))
    .orderBy(asc(vehicleInspectionAssignments.createdAt))
    .limit(1);
  const target = rows[0];
  if (!target) throw new Error("Seed vehicle 03 and its inspection assignment are required.");

  const template = await getTemplateDefinition(target.templateId);
  if (!template) throw new Error("Assigned inspection template was not found.");
  const odometer = (target.currentOdometer ?? 0) + 1;
  const answers = template.sections.flatMap((section) =>
    section.items.map((item) => ({
      itemId: item.id,
      response: responseFor(item, odometer),
    })),
  );
  const result = await submitInspection({
    vehicleId: target.vehicleId,
    templateId: target.templateId,
    ...(target.qrCodeId ? { qrCodeId: target.qrCodeId } : {}),
    odometer,
    answers,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await createQaInspection();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown QA record error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
