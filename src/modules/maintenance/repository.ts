import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attachments,
  defects,
  inspectionSubmissions,
  inspectionTemplates,
  maintenanceEscalationPolicies,
  maintenanceWorkEntries,
  safetyCaseAttachments,
  safetyCaseEvents,
  safetyCases,
  users,
  vehicles,
} from "@/db/schema";
import { getCurrentActor, requirePermission } from "@/lib/auth";

function isSupervisor(role: typeof users.$inferSelect.role) {
  return role === "supervisor" || role === "fleet_manager" || role === "administrator";
}

export async function listSafetyCases() {
  const actor = await requirePermission("inspection:review");
  const rows = await db
    .select({
      id: safetyCases.id,
      status: safetyCases.status,
      recordVersion: safetyCases.recordVersion,
      priority: safetyCases.priority,
      targetResolutionAt: safetyCases.targetResolutionAt,
      summary: safetyCases.summary,
      updatedAt: safetyCases.updatedAt,
      assignedTechnicianUserId: safetyCases.assignedTechnicianUserId,
      sourceSubmissionId: safetyCases.sourceSubmissionId,
      vehicleId: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      disposition: vehicles.disposition,
      severity: inspectionSubmissions.calculatedSeverity,
      templateName: inspectionTemplates.name,
      submittedAt: inspectionSubmissions.submittedAt,
      inspectorName: users.displayName,
    })
    .from(safetyCases)
    .innerJoin(vehicles, eq(safetyCases.vehicleId, vehicles.id))
    .innerJoin(inspectionSubmissions, eq(safetyCases.sourceSubmissionId, inspectionSubmissions.id))
    .innerJoin(inspectionTemplates, eq(inspectionSubmissions.templateId, inspectionTemplates.id))
    .innerJoin(users, eq(inspectionSubmissions.inspectorUserId, users.id))
    .where(and(
      ne(safetyCases.status, "released"),
      isSupervisor(actor.role) ? undefined : eq(safetyCases.assignedTechnicianUserId, actor.id),
    ))
    .orderBy(desc(safetyCases.updatedAt));

  if (!rows.length) return [];
  const submissionIds = rows.map((row) => row.sourceSubmissionId);
  const defectRows = await db
    .select({ submissionId: defects.submissionId, blocksDeparture: defects.blocksDeparture, status: defects.status })
    .from(defects)
    .where(inArray(defects.submissionId, submissionIds));
  const technicianIds = [...new Set(rows.map((row) => row.assignedTechnicianUserId).filter((id): id is string => Boolean(id)))];
  const technicians = technicianIds.length
    ? await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, technicianIds))
    : [];
  const technicianById = new Map(technicians.map((technician) => [technician.id, technician.name]));
  const caseIds = rows.map((row) => row.id);
  const costRows = await db.select({ safetyCaseId: maintenanceWorkEntries.safetyCaseId, costCents: maintenanceWorkEntries.costCents }).from(maintenanceWorkEntries).where(inArray(maintenanceWorkEntries.safetyCaseId, caseIds));

  return rows.map((row) => {
    const caseDefects = defectRows.filter((defect) => defect.submissionId === row.sourceSubmissionId && defect.status !== "closed");
    return {
      ...row,
      assignedTechnicianName: row.assignedTechnicianUserId ? technicianById.get(row.assignedTechnicianUserId) ?? "Unavailable user" : null,
      openDefectCount: caseDefects.length,
      blockingDefectCount: caseDefects.filter((defect) => defect.blocksDeparture).length,
      totalCostCents: costRows.filter((entry) => entry.safetyCaseId === row.id).reduce((total, entry) => total + entry.costCents, 0),
      overdue: Boolean(row.targetResolutionAt && row.targetResolutionAt.getTime() < Date.now()),
    };
  });
}

export async function getSafetyCase(caseId: string) {
  const actor = await getCurrentActor();
  if (!isSupervisor(actor.role) && actor.role !== "maintenance_technician") return null;
  const [caseRecord] = await db
    .select({
      id: safetyCases.id,
      status: safetyCases.status,
      priority: safetyCases.priority,
      targetResolutionAt: safetyCases.targetResolutionAt,
      serviceProvider: safetyCases.serviceProvider,
      externalReference: safetyCases.externalReference,
      estimatedCostCents: safetyCases.estimatedCostCents,
      estimateStatus: safetyCases.estimateStatus,
      estimateNote: safetyCases.estimateNote,
      estimateSubmittedAt: safetyCases.estimateSubmittedAt,
      estimateReviewedAt: safetyCases.estimateReviewedAt,
      recordVersion: safetyCases.recordVersion,
      summary: safetyCases.summary,
      supervisorNote: safetyCases.supervisorNote,
      resolutionNote: safetyCases.resolutionNote,
      assignedTechnicianUserId: safetyCases.assignedTechnicianUserId,
      sourceSubmissionId: safetyCases.sourceSubmissionId,
      reinspectionSubmissionId: safetyCases.reinspectionSubmissionId,
      createdAt: safetyCases.createdAt,
      updatedAt: safetyCases.updatedAt,
      acknowledgedAt: safetyCases.acknowledgedAt,
      assignedAt: safetyCases.assignedAt,
      repairStartedAt: safetyCases.repairStartedAt,
      repairCompletedAt: safetyCases.repairCompletedAt,
      releasedAt: safetyCases.releasedAt,
      vehicleId: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      disposition: vehicles.disposition,
      sourceSeverity: inspectionSubmissions.calculatedSeverity,
      sourceDisposition: inspectionSubmissions.calculatedDisposition,
      sourceSubmittedAt: inspectionSubmissions.submittedAt,
      templateName: inspectionTemplates.name,
      templateVersion: inspectionSubmissions.templateVersion,
      inspectorId: users.id,
      inspectorName: users.displayName,
      inspectorEmail: users.email,
    })
    .from(safetyCases)
    .innerJoin(vehicles, eq(safetyCases.vehicleId, vehicles.id))
    .innerJoin(inspectionSubmissions, eq(safetyCases.sourceSubmissionId, inspectionSubmissions.id))
    .innerJoin(inspectionTemplates, eq(inspectionSubmissions.templateId, inspectionTemplates.id))
    .innerJoin(users, eq(inspectionSubmissions.inspectorUserId, users.id))
    .where(eq(safetyCases.id, caseId))
    .limit(1);
  if (!caseRecord) return null;
  if (!isSupervisor(actor.role) && caseRecord.assignedTechnicianUserId !== actor.id) return null;

  const relevantSubmissionIds = [caseRecord.sourceSubmissionId, caseRecord.reinspectionSubmissionId].filter((id): id is string => Boolean(id));
  const [caseDefects, events, technicians, assignedTechnician, reinspection, workEntries, evidence, escalationPolicy] = await Promise.all([
    db.select().from(defects).where(inArray(defects.submissionId, relevantSubmissionIds)).orderBy(desc(defects.blocksDeparture), desc(defects.severity), asc(defects.title)),
    db
      .select({
        id: safetyCaseEvents.id,
        action: safetyCaseEvents.action,
        fromStatus: safetyCaseEvents.fromStatus,
        toStatus: safetyCaseEvents.toStatus,
        note: safetyCaseEvents.note,
        metadata: safetyCaseEvents.metadata,
        createdAt: safetyCaseEvents.createdAt,
        actorName: users.displayName,
        actorRole: users.role,
      })
      .from(safetyCaseEvents)
      .leftJoin(users, eq(safetyCaseEvents.actorUserId, users.id))
      .where(eq(safetyCaseEvents.safetyCaseId, caseId))
      .orderBy(desc(safetyCaseEvents.createdAt)),
    db
      .select({ id: users.id, displayName: users.displayName, role: users.role })
      .from(users)
      .where(and(eq(users.active, true), or(eq(users.role, "maintenance_technician"), eq(users.role, "fleet_manager"))))
      .orderBy(asc(users.displayName)),
    caseRecord.assignedTechnicianUserId
      ? db.select({ id: users.id, displayName: users.displayName, role: users.role }).from(users).where(eq(users.id, caseRecord.assignedTechnicianUserId)).limit(1)
      : Promise.resolve([]),
    caseRecord.reinspectionSubmissionId
      ? db.select({ id: inspectionSubmissions.id, severity: inspectionSubmissions.calculatedSeverity, disposition: inspectionSubmissions.calculatedDisposition, submittedAt: inspectionSubmissions.submittedAt }).from(inspectionSubmissions).where(eq(inspectionSubmissions.id, caseRecord.reinspectionSubmissionId)).limit(1)
      : Promise.resolve([]),
    db
      .select({
        id: maintenanceWorkEntries.id,
        entryType: maintenanceWorkEntries.entryType,
        description: maintenanceWorkEntries.description,
        partNumber: maintenanceWorkEntries.partNumber,
        quantity: maintenanceWorkEntries.quantity,
        costCents: maintenanceWorkEntries.costCents,
        laborMinutes: maintenanceWorkEntries.laborMinutes,
        vendorName: maintenanceWorkEntries.vendorName,
        createdAt: maintenanceWorkEntries.createdAt,
        enteredByUserId: maintenanceWorkEntries.enteredByUserId,
        enteredByName: users.displayName,
      })
      .from(maintenanceWorkEntries)
      .innerJoin(users, eq(maintenanceWorkEntries.enteredByUserId, users.id))
      .where(eq(maintenanceWorkEntries.safetyCaseId, caseId))
      .orderBy(desc(maintenanceWorkEntries.createdAt)),
    db
      .select({
        attachmentId: safetyCaseAttachments.attachmentId,
        category: safetyCaseAttachments.category,
        caption: safetyCaseAttachments.caption,
        createdAt: safetyCaseAttachments.createdAt,
        originalName: attachments.originalName,
        mimeType: attachments.mimeType,
        byteSize: attachments.byteSize,
        linkedByName: users.displayName,
      })
      .from(safetyCaseAttachments)
      .innerJoin(attachments, eq(safetyCaseAttachments.attachmentId, attachments.id))
      .innerJoin(users, eq(safetyCaseAttachments.linkedByUserId, users.id))
      .where(eq(safetyCaseAttachments.safetyCaseId, caseId))
      .orderBy(desc(safetyCaseAttachments.createdAt)),
    db.select().from(maintenanceEscalationPolicies).where(eq(maintenanceEscalationPolicies.priority, caseRecord.priority)).limit(1),
  ]);

  return {
    ...caseRecord,
    defects: caseDefects,
    events,
    technicians,
    assignedTechnician: assignedTechnician[0] ?? null,
    reinspection: reinspection[0] ?? null,
    workEntries,
    evidence,
    escalationPolicy: escalationPolicy[0] ?? null,
    totalCostCents: workEntries.reduce((total, entry) => total + entry.costCents, 0),
    totalLaborMinutes: workEntries.reduce((total, entry) => total + entry.laborMinutes, 0),
    overdue: Boolean(caseRecord.status !== "released" && caseRecord.targetResolutionAt && caseRecord.targetResolutionAt.getTime() < Date.now()),
    actor: {
      id: actor.id,
      role: actor.role,
      canSupervise: isSupervisor(actor.role),
      canMaintain: actor.role === "maintenance_technician" || actor.role === "fleet_manager" || actor.role === "administrator",
    },
  };
}

export async function listMaintenanceDefects() {
  await requirePermission("inspection:review");
  return db
    .select({
      id: defects.id,
      title: defects.title,
      description: defects.description,
      severity: defects.severity,
      status: defects.status,
      blocksDeparture: defects.blocksDeparture,
      createdAt: defects.createdAt,
      vehicleId: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      reporterName: users.displayName,
    })
    .from(defects)
    .innerJoin(vehicles, eq(defects.vehicleId, vehicles.id))
    .innerJoin(users, eq(defects.reportedByUserId, users.id))
    .where(ne(defects.status, "closed"))
    .orderBy(desc(defects.blocksDeparture), desc(defects.createdAt));
}
