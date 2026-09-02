import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  defects,
  inspectionAnswers,
  inspectionItems,
  inspectionSections,
  inspectionSubmissions,
  inspectionTemplates,
  maintenanceWorkEntries,
  safetyCases,
  users,
  vehicleClasses,
  vehicles,
} from "@/db/schema";
import { AuthorizationError, can, getCurrentActor } from "@/lib/auth";

export class ReportNotFoundError extends Error {
  constructor() {
    super("The requested inspection report was not found.");
    this.name = "ReportNotFoundError";
  }
}

export async function listInspectionReports(limit = 100) {
  const actor = await getCurrentActor();
  const safeLimit = Math.min(Math.max(limit, 1), 250);

  return db
    .select({
      id: inspectionSubmissions.id,
      status: inspectionSubmissions.status,
      severity: inspectionSubmissions.calculatedSeverity,
      disposition: inspectionSubmissions.calculatedDisposition,
      submittedAt: inspectionSubmissions.submittedAt,
      odometer: inspectionSubmissions.odometer,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      classCode: vehicleClasses.code,
      templateName: inspectionTemplates.name,
      templateVersion: inspectionSubmissions.templateVersion,
      inspectorName: users.displayName,
    })
    .from(inspectionSubmissions)
    .innerJoin(vehicles, eq(inspectionSubmissions.vehicleId, vehicles.id))
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .innerJoin(
      inspectionTemplates,
      eq(inspectionSubmissions.templateId, inspectionTemplates.id),
    )
    .innerJoin(users, eq(inspectionSubmissions.inspectorUserId, users.id))
    .where(
      can(actor, "reports:read")
        ? undefined
        : eq(inspectionSubmissions.inspectorUserId, actor.id),
    )
    .orderBy(desc(inspectionSubmissions.submittedAt))
    .limit(safeLimit);
}

export async function getMaintenanceReportSnapshot() {
  const actor = await getCurrentActor();
  if (!can(actor, "reports:read")) throw new AuthorizationError("reports:read");
  const [caseRows, workRows] = await Promise.all([
    db.select({ status: safetyCases.status, priority: safetyCases.priority, targetResolutionAt: safetyCases.targetResolutionAt }).from(safetyCases),
    db.select({ costCents: maintenanceWorkEntries.costCents, laborMinutes: maintenanceWorkEntries.laborMinutes }).from(maintenanceWorkEntries),
  ]);
  const now = Date.now();
  const active = caseRows.filter((item) => item.status !== "released");
  return {
    totalCases: caseRows.length,
    activeCases: active.length,
    overdueCases: active.filter((item) => item.targetResolutionAt && item.targetResolutionAt.getTime() < now).length,
    criticalCases: active.filter((item) => item.priority === "critical").length,
    releasedCases: caseRows.filter((item) => item.status === "released").length,
    totalCostCents: workRows.reduce((total, item) => total + item.costCents, 0),
    totalLaborMinutes: workRows.reduce((total, item) => total + item.laborMinutes, 0),
  };
}

export async function getInspectionReport(inspectionId: string) {
  const actor = await getCurrentActor();
  const rows = await db
    .select({
      id: inspectionSubmissions.id,
      status: inspectionSubmissions.status,
      severity: inspectionSubmissions.calculatedSeverity,
      disposition: inspectionSubmissions.calculatedDisposition,
      startedAt: inspectionSubmissions.startedAt,
      submittedAt: inspectionSubmissions.submittedAt,
      odometer: inspectionSubmissions.odometer,
      inspectorId: inspectionSubmissions.inspectorUserId,
      inspectorName: users.displayName,
      inspectorEmail: users.email,
      templateCode: inspectionTemplates.code,
      templateName: inspectionTemplates.name,
      templateVersion: inspectionSubmissions.templateVersion,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      vin: vehicles.vin,
      licensePlate: vehicles.licensePlate,
      licenseState: vehicles.licenseState,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      classCode: vehicleClasses.code,
      className: vehicleClasses.name,
    })
    .from(inspectionSubmissions)
    .innerJoin(vehicles, eq(inspectionSubmissions.vehicleId, vehicles.id))
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .innerJoin(
      inspectionTemplates,
      eq(inspectionSubmissions.templateId, inspectionTemplates.id),
    )
    .innerJoin(users, eq(inspectionSubmissions.inspectorUserId, users.id))
    .where(eq(inspectionSubmissions.id, inspectionId))
    .limit(1);

  const report = rows[0];
  if (!report || (!can(actor, "reports:read") && report.inspectorId !== actor.id)) {
    throw new ReportNotFoundError();
  }

  const [answerRows, defectRows] = await Promise.all([
    db
      .select({
        id: inspectionAnswers.id,
        response: inspectionAnswers.response,
        comment: inspectionAnswers.comment,
        severity: inspectionAnswers.calculatedSeverity,
        itemKey: inspectionItems.itemKey,
        label: inspectionItems.label,
        fieldType: inspectionItems.fieldType,
        itemOrder: inspectionItems.sortOrder,
        sectionKey: inspectionSections.sectionKey,
        sectionTitle: inspectionSections.title,
        sectionOrder: inspectionSections.sortOrder,
      })
      .from(inspectionAnswers)
      .innerJoin(
        inspectionItems,
        eq(inspectionAnswers.inspectionItemId, inspectionItems.id),
      )
      .innerJoin(
        inspectionSections,
        eq(inspectionItems.sectionId, inspectionSections.id),
      )
      .where(eq(inspectionAnswers.submissionId, inspectionId))
      .orderBy(asc(inspectionSections.sortOrder), asc(inspectionItems.sortOrder)),
    db
      .select({
        id: defects.id,
        title: defects.title,
        description: defects.description,
        severity: defects.severity,
        status: defects.status,
        blocksDeparture: defects.blocksDeparture,
      })
      .from(defects)
      .where(eq(defects.submissionId, inspectionId))
      .orderBy(desc(defects.blocksDeparture), asc(defects.title)),
  ]);

  const sections = new Map<
    string,
    { key: string; title: string; order: number; answers: typeof answerRows }
  >();
  for (const answer of answerRows) {
    const section = sections.get(answer.sectionKey) ?? {
      key: answer.sectionKey,
      title: answer.sectionTitle,
      order: answer.sectionOrder,
      answers: [],
    };
    section.answers.push(answer);
    sections.set(answer.sectionKey, section);
  }

  return {
    ...report,
    sections: [...sections.values()].sort((a, b) => a.order - b.order),
    defects: defectRows,
  };
}
