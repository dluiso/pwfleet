import { z } from "zod";

const optionalUuid = z.preprocess((value) => value === "" || value === null ? undefined : value, z.uuid().optional());
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T) => z.preprocess((value) => value === "" || value === null ? undefined : value, z.enum(values).optional());

export const fleetReportSelectionSchema = z.object({
  vehicleId: optionalUuid,
  vehicleClassId: optionalUuid,
  driverUserId: optionalUuid,
  templateId: optionalUuid,
  severity: optionalEnum(["none", "advisory", "minor", "major", "critical"]),
  disposition: optionalEnum(["inspection_required", "cleared", "cleared_with_advisory", "hold_for_review", "out_of_service", "maintenance_in_progress", "ready_for_reinspection"]),
  maintenanceStatus: optionalEnum(["pending_supervisor_review", "acknowledged", "held", "maintenance_assigned", "repair_in_progress", "awaiting_reinspection", "awaiting_release", "released"]),
});

export const fleetReportFiltersSchema = fleetReportSelectionSchema.extend({
  from: z.iso.date(),
  to: z.iso.date(),
}).superRefine((value, context) => {
  const from = new Date(`${value.from}T00:00:00Z`);
  const to = new Date(`${value.to}T00:00:00Z`);
  if (to < from) context.addIssue({ code: "custom", path: ["to"], message: "The end date must not precede the start date." });
  if (to.getTime() - from.getTime() > 366 * 5 * 86_400_000) context.addIssue({ code: "custom", path: ["to"], message: "Report ranges are limited to five years." });
});

export type FleetReportFilters = z.infer<typeof fleetReportFiltersSchema>;

export function filtersFromSearchParams(params: URLSearchParams) {
  return fleetReportFiltersSchema.parse({
    from: params.get("from"), to: params.get("to"), vehicleId: params.get("vehicleId"), vehicleClassId: params.get("vehicleClassId"), driverUserId: params.get("driverUserId"), templateId: params.get("templateId"), severity: params.get("severity"), disposition: params.get("disposition"), maintenanceStatus: params.get("maintenanceStatus"),
  });
}
