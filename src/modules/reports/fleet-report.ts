import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { defects, inspectionSubmissions, inspectionTemplates, maintenanceWorkEntries, safetyCases, users, vehicleClasses, vehicles } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";
import { addCalendarDays, zonedStartOfDay } from "@/lib/time-zone";
import { fleetReportFiltersSchema, type FleetReportFilters } from "./validation";

export class FleetReportError extends Error {
  constructor(message: string, public readonly status = 400, public readonly details?: unknown) {
    super(message);
    this.name = "FleetReportError";
  }
}

export async function getFleetReportOptions() {
  await requirePermission("reports:read");
  const [vehicleRows, classRows, driverRows, templateRows] = await Promise.all([
    db.select({ id: vehicles.id, unitNumber: vehicles.unitNumber, displayCode: vehicles.displayCode }).from(vehicles).orderBy(asc(vehicles.unitNumber)),
    db.select({ id: vehicleClasses.id, code: vehicleClasses.code, name: vehicleClasses.name }).from(vehicleClasses).orderBy(asc(vehicleClasses.code)),
    db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.active, true)).orderBy(asc(users.displayName)),
    db.select({ id: inspectionTemplates.id, name: inspectionTemplates.name, version: inspectionTemplates.version }).from(inspectionTemplates).orderBy(asc(inspectionTemplates.name), desc(inspectionTemplates.version)),
  ]);
  return { vehicles: vehicleRows, classes: classRows, drivers: driverRows, templates: templateRows };
}

export async function getFleetOperationalReport(rawFilters: FleetReportFilters | unknown) {
  await requirePermission("reports:read");
  return buildFleetOperationalReport(rawFilters);
}

export async function buildFleetOperationalReport(rawFilters: FleetReportFilters | unknown) {
  const parsed = fleetReportFiltersSchema.safeParse(rawFilters);
  if (!parsed.success) throw new FleetReportError("The report filters are invalid.", 400, parsed.error.flatten());
  const filters = parsed.data;
  const env = getEnvironment();
  const rangeStart = zonedStartOfDay(filters.from, env.APP_TIME_ZONE);
  const rangeEnd = zonedStartOfDay(addCalendarDays(filters.to, 1), env.APP_TIME_ZONE);
  const conditions: SQL[] = [gte(inspectionSubmissions.submittedAt, rangeStart), lt(inspectionSubmissions.submittedAt, rangeEnd)];
  if (filters.vehicleId) conditions.push(eq(inspectionSubmissions.vehicleId, filters.vehicleId));
  if (filters.vehicleClassId) conditions.push(eq(vehicles.vehicleClassId, filters.vehicleClassId));
  if (filters.driverUserId) conditions.push(eq(inspectionSubmissions.inspectorUserId, filters.driverUserId));
  if (filters.templateId) conditions.push(eq(inspectionSubmissions.templateId, filters.templateId));
  if (filters.severity) conditions.push(eq(inspectionSubmissions.calculatedSeverity, filters.severity));
  if (filters.disposition) conditions.push(eq(inspectionSubmissions.calculatedDisposition, filters.disposition));
  if (filters.maintenanceStatus) conditions.push(eq(safetyCases.status, filters.maintenanceStatus));

  const baseRows = await db.select({
    inspectionId: inspectionSubmissions.id,
    submittedAt: inspectionSubmissions.submittedAt,
    severity: inspectionSubmissions.calculatedSeverity,
    disposition: inspectionSubmissions.calculatedDisposition,
    odometer: inspectionSubmissions.odometer,
    vehicleId: vehicles.id,
    unitNumber: vehicles.unitNumber,
    displayCode: vehicles.displayCode,
    classCode: vehicleClasses.code,
    inspectorId: users.id,
    inspectorName: users.displayName,
    templateId: inspectionTemplates.id,
    templateName: inspectionTemplates.name,
    templateVersion: inspectionSubmissions.templateVersion,
    safetyCaseId: safetyCases.id,
    maintenanceStatus: safetyCases.status,
    maintenancePriority: safetyCases.priority,
    targetResolutionAt: safetyCases.targetResolutionAt,
  }).from(inspectionSubmissions)
    .innerJoin(vehicles, eq(inspectionSubmissions.vehicleId, vehicles.id))
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .innerJoin(users, eq(inspectionSubmissions.inspectorUserId, users.id))
    .innerJoin(inspectionTemplates, eq(inspectionSubmissions.templateId, inspectionTemplates.id))
    .leftJoin(safetyCases, eq(safetyCases.sourceSubmissionId, inspectionSubmissions.id))
    .where(and(...conditions))
    .orderBy(desc(inspectionSubmissions.submittedAt))
    .limit(env.REPORT_MAX_ROWS);

  const submissionIds = baseRows.map((row) => row.inspectionId);
  const caseIds = baseRows.map((row) => row.safetyCaseId).filter((id): id is string => Boolean(id));
  const [defectRows, workRows] = await Promise.all([
    submissionIds.length ? db.select({
      submissionId: defects.submissionId,
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${defects.status} <> 'closed')::int`,
      blocking: sql<number>`count(*) filter (where ${defects.status} <> 'closed' and ${defects.blocksDeparture} = true)::int`,
    }).from(defects).where(inArray(defects.submissionId, submissionIds)).groupBy(defects.submissionId) : Promise.resolve([]),
    caseIds.length ? db.select({
      safetyCaseId: maintenanceWorkEntries.safetyCaseId,
      costCents: sql<number>`coalesce(sum(${maintenanceWorkEntries.costCents}), 0)::int`,
      laborMinutes: sql<number>`coalesce(sum(${maintenanceWorkEntries.laborMinutes}), 0)::int`,
    }).from(maintenanceWorkEntries).where(inArray(maintenanceWorkEntries.safetyCaseId, caseIds)).groupBy(maintenanceWorkEntries.safetyCaseId) : Promise.resolve([]),
  ]);
  const defectSummary = new Map(defectRows.map((item) => [item.submissionId, item]));
  const workSummary = new Map(workRows.map((item) => [item.safetyCaseId, item]));
  const now = Date.now();
  const rows = baseRows.map((row) => {
    const rowDefects = defectSummary.get(row.inspectionId) ?? { total: 0, open: 0, blocking: 0 };
    const rowWork = row.safetyCaseId ? workSummary.get(row.safetyCaseId) ?? { costCents: 0, laborMinutes: 0 } : { costCents: 0, laborMinutes: 0 };
    return { ...row, defectCount: rowDefects.total, openDefectCount: rowDefects.open, blockingDefectCount: rowDefects.blocking, maintenanceCostCents: rowWork.costCents, laborMinutes: rowWork.laborMinutes, overdue: Boolean(row.maintenanceStatus && row.maintenanceStatus !== "released" && row.targetResolutionAt && row.targetResolutionAt.getTime() < now) };
  });
  return {
    generatedAt: new Date(), timeZone: env.APP_TIME_ZONE, filters, rangeStart, rangeEnd, truncated: baseRows.length === env.REPORT_MAX_ROWS, rows,
    totals: { inspections: rows.length, critical: rows.filter((row) => row.severity === "critical").length, blocked: rows.filter((row) => row.blockingDefectCount > 0).length, openDefects: rows.reduce((total, row) => total + row.openDefectCount, 0), maintenanceCostCents: rows.reduce((total, row) => total + row.maintenanceCostCents, 0), laborMinutes: rows.reduce((total, row) => total + row.laborMinutes, 0), overdueCases: rows.filter((row) => row.overdue).length },
  };
}

function csvValue(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderFleetReportCsv(report: Awaited<ReturnType<typeof getFleetOperationalReport>>) {
  const metadata = [
    ["Report", "Fleet operational report"], ["Generated", report.generatedAt.toISOString()], ["Time zone", report.timeZone], ["From", report.filters.from], ["To", report.filters.to], ["Filters", JSON.stringify(report.filters)], ["Truncated", report.truncated ? "yes" : "no"], [],
  ];
  const headers = ["Inspection ID", "Submitted", "Vehicle ID", "Vehicle", "Class", "Driver ID", "Driver", "Template ID", "Template", "Version", "Severity", "Disposition", "Odometer", "Defects", "Open defects", "Blocking defects", "Safety case ID", "Maintenance status", "Priority", "Overdue", "Maintenance cost USD", "Labor minutes"];
  const body = report.rows.map((row) => [row.inspectionId, row.submittedAt?.toISOString(), row.vehicleId, row.displayCode ?? `Unit ${row.unitNumber}`, row.classCode, row.inspectorId, row.inspectorName, row.templateId, row.templateName, row.templateVersion, row.severity, row.disposition, row.odometer, row.defectCount, row.openDefectCount, row.blockingDefectCount, row.safetyCaseId, row.maintenanceStatus, row.maintenancePriority, row.overdue ? "yes" : "no", (row.maintenanceCostCents / 100).toFixed(2), row.laborMinutes]);
  return `\uFEFF${[...metadata, headers, ...body].map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`;
}
