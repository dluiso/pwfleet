import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  attachments,
  defects,
  inspectionSubmissions,
  inspectionTemplates,
  maintenanceEscalationPolicies,
  maintenanceWorkEntries,
  notificationOutbox,
  userNotifications,
  safetyCaseEvents,
  safetyCaseAttachments,
  safetyCases,
  users,
  vehicles,
} from "@/db/schema";
import { getCurrentActor } from "@/lib/auth";
import {
  deleteWorkEntrySchema,
  maintenanceWorkEntrySchema,
  maintenanceEstimateReviewSchema,
  maintenanceEstimateSchema,
  maintenanceReassignmentSchema,
  safetyCaseActionSchema,
  safetyCaseDetailsSchema,
  safetyCaseEvidenceSchema,
  type SafetyCaseActionInput,
} from "./validation";
import { isInspectionEligibleForRelease } from "./release-policy";

export class MaintenanceWorkflowError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "MaintenanceWorkflowError";
  }
}

function parseAction(input: unknown): SafetyCaseActionInput {
  const parsed = safetyCaseActionSchema.safeParse(input);
  if (!parsed.success) {
    throw new MaintenanceWorkflowError("The safety-case action is invalid.", 400, parsed.error.flatten());
  }
  return parsed.data;
}

function isSupervisor(role: typeof users.$inferSelect.role) {
  return role === "supervisor" || role === "fleet_manager" || role === "administrator";
}

function isMaintenance(role: typeof users.$inferSelect.role) {
  return role === "maintenance_technician" || role === "fleet_manager" || role === "administrator";
}

function isAssignableTechnician(role: typeof users.$inferSelect.role) {
  return role === "maintenance_technician" || role === "fleet_manager";
}

function requireActionRole(role: typeof users.$inferSelect.role, action: SafetyCaseActionInput["action"]) {
  const maintenanceAction = action === "start_repair" || action === "complete_repair";
  if ((maintenanceAction && !isMaintenance(role)) || (!maintenanceAction && !isSupervisor(role))) {
    throw new MaintenanceWorkflowError("Your role is not authorized for this safety-case action.", 403);
  }
}

const allowedFrom: Record<SafetyCaseActionInput["action"], ReadonlySet<typeof safetyCases.$inferSelect.status>> = {
  acknowledge: new Set(["pending_supervisor_review"]),
  hold: new Set(["pending_supervisor_review", "acknowledged"]),
  assign_maintenance: new Set(["pending_supervisor_review", "acknowledged", "held"]),
  start_repair: new Set(["maintenance_assigned"]),
  complete_repair: new Set(["repair_in_progress"]),
  approve_release: new Set(["acknowledged", "held", "awaiting_release"]),
  deny_release: new Set(["awaiting_release"]),
};

const actionEvent = {
  acknowledge: "acknowledged",
  hold: "held",
  assign_maintenance: "maintenance_assigned",
  start_repair: "repair_started",
  complete_repair: "repair_completed",
  approve_release: "release_approved",
  deny_release: "release_denied",
} as const;

function actionNote(input: SafetyCaseActionInput) {
  return "note" in input ? input.note?.trim() || null : null;
}

export async function transitionSafetyCase(caseId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  const input = parseAction(rawInput);
  requireActionRole(actor.role, input.action);

  return db.transaction(async (transaction) => {
    const [caseLocator] = await transaction
      .select({ vehicleId: safetyCases.vehicleId })
      .from(safetyCases)
      .where(eq(safetyCases.id, caseId))
      .limit(1);
    if (!caseLocator) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    const [vehicle] = await transaction
      .select({ disposition: vehicles.disposition, unitNumber: vehicles.unitNumber, displayCode: vehicles.displayCode })
      .from(vehicles)
      .where(eq(vehicles.id, caseLocator.vehicleId))
      .for("update")
      .limit(1);
    const [caseRecord] = await transaction
      .select()
      .from(safetyCases)
      .where(eq(safetyCases.id, caseId))
      .for("update")
      .limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== input.recordVersion) {
      throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh before taking action.", 409);
    }
    if (!allowedFrom[input.action].has(caseRecord.status)) {
      throw new MaintenanceWorkflowError(`The ${input.action.replaceAll("_", " ")} action is not allowed while this case is ${caseRecord.status.replaceAll("_", " ")}.`, 409);
    }

    const [sourceSubmission] = await transaction
      .select({ inspectorUserId: inspectionSubmissions.inspectorUserId })
      .from(inspectionSubmissions)
      .where(eq(inspectionSubmissions.id, caseRecord.sourceSubmissionId))
      .limit(1);
    if (!sourceSubmission || !vehicle) throw new MaintenanceWorkflowError("The safety case references an unavailable operational record.", 409);

    let nextStatus: typeof safetyCases.$inferSelect.status;
    let vehicleDisposition: typeof vehicles.$inferSelect.disposition | undefined;
    const now = new Date();
    const casePatch: Partial<typeof safetyCases.$inferInsert> = {};
    const affectedSubmissionIds = [caseRecord.sourceSubmissionId, caseRecord.reinspectionSubmissionId].filter((id): id is string => Boolean(id));

    if (input.action === "acknowledge") {
      nextStatus = "acknowledged";
      casePatch.acknowledgedAt = now;
      casePatch.acknowledgedByUserId = actor.id;
      if (input.note?.trim()) casePatch.supervisorNote = input.note.trim();
      await transaction.update(defects).set({ status: "under_review", updatedAt: now }).where(and(eq(defects.submissionId, caseRecord.sourceSubmissionId), eq(defects.status, "reported")));
    } else if (input.action === "hold") {
      nextStatus = "held";
      vehicleDisposition = vehicle.disposition === "out_of_service" ? "out_of_service" : "hold_for_review";
      casePatch.supervisorNote = input.note;
      await transaction.update(defects).set({ status: "under_review", updatedAt: now }).where(and(eq(defects.submissionId, caseRecord.sourceSubmissionId), ne(defects.status, "closed")));
    } else if (input.action === "assign_maintenance") {
      const [technician] = await transaction
        .select({ id: users.id, role: users.role, active: users.active })
        .from(users)
        .where(eq(users.id, input.assignedTechnicianUserId))
        .limit(1);
      if (!technician?.active || !isAssignableTechnician(technician.role)) {
        throw new MaintenanceWorkflowError("Select an active maintenance technician or fleet manager.", 422);
      }
      nextStatus = "maintenance_assigned";
      vehicleDisposition = vehicle.disposition === "out_of_service" ? "out_of_service" : "maintenance_in_progress";
      casePatch.assignedTechnicianUserId = technician.id;
      casePatch.assignedAt = now;
      casePatch.assignedByUserId = actor.id;
      if (input.note?.trim()) casePatch.supervisorNote = input.note.trim();
      await transaction.update(defects).set({ status: "assigned", updatedAt: now }).where(and(inArray(defects.submissionId, affectedSubmissionIds), ne(defects.status, "closed")));
    } else if (input.action === "start_repair") {
      if (actor.role === "maintenance_technician" && caseRecord.assignedTechnicianUserId !== actor.id) {
        throw new MaintenanceWorkflowError("This maintenance case is assigned to another technician.", 403);
      }
      nextStatus = "repair_in_progress";
      vehicleDisposition = vehicle.disposition === "out_of_service" ? "out_of_service" : "maintenance_in_progress";
      casePatch.repairStartedAt = now;
      casePatch.repairStartedByUserId = actor.id;
      await transaction.update(defects).set({ status: "repair_in_progress", updatedAt: now }).where(and(inArray(defects.submissionId, affectedSubmissionIds), ne(defects.status, "closed")));
    } else if (input.action === "complete_repair") {
      if (actor.role === "maintenance_technician" && caseRecord.assignedTechnicianUserId !== actor.id) {
        throw new MaintenanceWorkflowError("This maintenance case is assigned to another technician.", 403);
      }
      nextStatus = "awaiting_reinspection";
      vehicleDisposition = "ready_for_reinspection";
      casePatch.resolutionNote = input.note;
      casePatch.repairCompletedAt = now;
      casePatch.repairCompletedByUserId = actor.id;
      await transaction.update(defects).set({ status: "verification_required", updatedAt: now }).where(and(inArray(defects.submissionId, affectedSubmissionIds), ne(defects.status, "closed")));
    } else if (input.action === "deny_release") {
      nextStatus = "awaiting_reinspection";
      vehicleDisposition = "ready_for_reinspection";
      casePatch.supervisorNote = input.note;
    } else {
      const verificationSubmissionId = caseRecord.status === "awaiting_release" ? caseRecord.reinspectionSubmissionId : caseRecord.sourceSubmissionId;
      if (!verificationSubmissionId) throw new MaintenanceWorkflowError("A completed reinspection is required before release.", 409);
      const [verificationSubmission] = await transaction
        .select({ disposition: inspectionSubmissions.calculatedDisposition, ruleSetStatus: inspectionTemplates.ruleSetStatus })
        .from(inspectionSubmissions)
        .innerJoin(inspectionTemplates, eq(inspectionSubmissions.templateId, inspectionTemplates.id))
        .where(eq(inspectionSubmissions.id, verificationSubmissionId))
        .limit(1);
      const blockingDefects = await transaction
        .select({ id: defects.id })
        .from(defects)
        .where(and(eq(defects.submissionId, verificationSubmissionId), eq(defects.blocksDeparture, true), ne(defects.status, "closed")));
      if (!verificationSubmission || !isInspectionEligibleForRelease({ ...verificationSubmission, blockingDefectCount: blockingDefects.length })) {
        throw new MaintenanceWorkflowError("This vehicle still has blocking defects and cannot be released.", 409);
      }
      nextStatus = "released";
      const advisoryDefects = await transaction
        .select({ id: defects.id })
        .from(defects)
        .where(and(eq(defects.submissionId, verificationSubmissionId), ne(defects.status, "closed")));
      vehicleDisposition = advisoryDefects.length ? "cleared_with_advisory" : "cleared";
      casePatch.supervisorNote = input.note;
      casePatch.releasedAt = now;
      casePatch.releasedByUserId = actor.id;
      await transaction.update(defects).set({ status: "closed", closedAt: now, updatedAt: now }).where(and(inArray(defects.submissionId, affectedSubmissionIds), ne(defects.status, "closed")));
      await transaction.update(inspectionSubmissions).set({ status: "closed", updatedAt: now }).where(inArray(inspectionSubmissions.id, affectedSubmissionIds));
    }

    const [updated] = await transaction
      .update(safetyCases)
      .set({
        ...casePatch,
        status: nextStatus,
        recordVersion: caseRecord.recordVersion + 1,
        updatedAt: now,
      })
      .where(and(eq(safetyCases.id, caseId), eq(safetyCases.recordVersion, input.recordVersion)))
      .returning({ id: safetyCases.id, status: safetyCases.status, recordVersion: safetyCases.recordVersion });
    if (!updated) throw new MaintenanceWorkflowError("This safety case was updated concurrently. Refresh and try again.", 409);

    if (vehicleDisposition) {
      await transaction.update(vehicles).set({ disposition: vehicleDisposition, recordVersion: sql`${vehicles.recordVersion} + 1`, updatedAt: now }).where(eq(vehicles.id, caseRecord.vehicleId));
    }
    const note = actionNote(input);
    await transaction.insert(safetyCaseEvents).values({
      safetyCaseId: caseId,
      actorUserId: actor.id,
      action: actionEvent[input.action],
      fromStatus: caseRecord.status,
      toStatus: nextStatus,
      note,
      metadata: {
        ...(input.action === "assign_maintenance" ? { assignedTechnicianUserId: input.assignedTechnicianUserId } : {}),
        ...(vehicleDisposition ? { vehicleDisposition } : {}),
      },
    });
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: `safety_case.${actionEvent[input.action]}`,
      entityType: "safety_case",
      entityId: caseId,
      metadata: { fromStatus: caseRecord.status, toStatus: nextStatus, vehicleId: caseRecord.vehicleId, vehicleDisposition: vehicleDisposition ?? vehicle.disposition },
    });

    const recipientIds = new Set<string>([sourceSubmission.inspectorUserId]);
    if (input.action === "assign_maintenance") recipientIds.add(input.assignedTechnicianUserId);
    if (caseRecord.assignedTechnicianUserId && input.action === "approve_release") recipientIds.add(caseRecord.assignedTechnicianUserId);
    const recipients = await transaction.select({ id: users.id, email: users.email }).from(users).where(and(inArray(users.id, [...recipientIds]), eq(users.active, true)));
    const vehicleCode = vehicle.displayCode ?? `Unit ${vehicle.unitNumber}`;
    for (const recipient of recipients) {
      const critical = nextStatus === "held" || nextStatus === "maintenance_assigned";
      const subject = `Vehicle safety case update - ${vehicleCode}`;
      await transaction.insert(notificationOutbox).values({
        eventKey: `safety-case:${caseId}:${updated.recordVersion}`,
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        urgency: critical ? "critical" : "normal",
        subject,
        templateKey: "safety_case_update",
        payload: {
          inspectionId: caseRecord.sourceSubmissionId,
          safetyCaseId: caseId,
          vehicleCode,
          disposition: vehicleDisposition ?? vehicle.disposition,
          caseStatus: nextStatus,
          action: actionEvent[input.action],
          actionBy: actor.displayName,
          note,
        },
      }).onConflictDoNothing();
      await transaction.insert(userNotifications).values({
        eventKey: `safety-case:${caseId}:${updated.recordVersion}`,
        userId: recipient.id,
        kind: "safety_case",
        urgency: critical ? "critical" : "normal",
        title: subject,
        body: nextStatus === "released"
          ? "An authorized supervisor released the vehicle for operation."
          : `The case is now ${nextStatus.replaceAll("_", " ")}. Review the recorded decision before operating or servicing the vehicle.`,
        href: `/maintenance/${caseId}`,
        requiresAcknowledgment: critical,
      }).onConflictDoNothing();
    }

    return updated;
  });
}

export async function updateSafetyCaseDetails(caseId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (!isSupervisor(actor.role) && !isMaintenance(actor.role)) throw new MaintenanceWorkflowError("Your role cannot edit maintenance details.", 403);
  const parsed = safetyCaseDetailsSchema.safeParse(rawInput);
  if (!parsed.success) throw new MaintenanceWorkflowError("The maintenance details are invalid.", 400, parsed.error.flatten());
  const input = parsed.data;
  return db.transaction(async (transaction) => {
    const [caseRecord] = await transaction.select().from(safetyCases).where(eq(safetyCases.id, caseId)).for("update").limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== input.recordVersion) throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh and try again.", 409);
    if (caseRecord.status === "released") throw new MaintenanceWorkflowError("Released safety cases are read-only.", 409);
    if (actor.role === "maintenance_technician" && caseRecord.assignedTechnicianUserId !== actor.id) throw new MaintenanceWorkflowError("This safety case is assigned to another technician.", 403);
    const [updated] = await transaction.update(safetyCases).set({
      priority: input.priority,
      targetResolutionAt: input.targetResolutionAt ? new Date(input.targetResolutionAt) : null,
      serviceProvider: input.serviceProvider,
      externalReference: input.externalReference,
      recordVersion: caseRecord.recordVersion + 1,
      updatedAt: new Date(),
    }).where(and(eq(safetyCases.id, caseId), eq(safetyCases.recordVersion, input.recordVersion))).returning({ id: safetyCases.id, recordVersion: safetyCases.recordVersion });
    if (!updated) throw new MaintenanceWorkflowError("This safety case was updated concurrently.", 409);
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "safety_case.details_updated", entityType: "safety_case", entityId: caseId, metadata: { priority: input.priority, targetResolutionAt: input.targetResolutionAt, serviceProvider: input.serviceProvider, externalReference: input.externalReference } });
    return updated;
  });
}

export async function addMaintenanceWorkEntry(caseId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (!isMaintenance(actor.role)) throw new MaintenanceWorkflowError("Your role cannot add maintenance work entries.", 403);
  const parsed = maintenanceWorkEntrySchema.safeParse(rawInput);
  if (!parsed.success) throw new MaintenanceWorkflowError("The maintenance work entry is invalid.", 400, parsed.error.flatten());
  const input = parsed.data;
  return db.transaction(async (transaction) => {
    const [caseRecord] = await transaction.select().from(safetyCases).where(eq(safetyCases.id, caseId)).for("update").limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== input.recordVersion) throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh and try again.", 409);
    if (caseRecord.status === "released") throw new MaintenanceWorkflowError("Released safety cases are read-only.", 409);
    if (actor.role === "maintenance_technician" && caseRecord.assignedTechnicianUserId !== actor.id) throw new MaintenanceWorkflowError("This safety case is assigned to another technician.", 403);
    if (input.costCents > 0) {
      const [[policy], existingEntries] = await Promise.all([
        transaction.select().from(maintenanceEscalationPolicies).where(eq(maintenanceEscalationPolicies.priority, caseRecord.priority)).limit(1),
        transaction.select({ costCents: maintenanceWorkEntries.costCents }).from(maintenanceWorkEntries).where(eq(maintenanceWorkEntries.safetyCaseId, caseId)),
      ]);
      const projectedCost = existingEntries.reduce((total, entry) => total + entry.costCents, 0) + input.costCents;
      if (policy?.active && projectedCost > policy.estimateApprovalThresholdCents && (caseRecord.estimateStatus !== "approved" || (caseRecord.estimatedCostCents ?? 0) < projectedCost)) {
        throw new MaintenanceWorkflowError(`Supervisor approval is required before recorded costs exceed ${(policy.estimateApprovalThresholdCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`, 409);
      }
    }
    const [entry] = await transaction.insert(maintenanceWorkEntries).values({
      safetyCaseId: caseId,
      entryType: input.entryType,
      description: input.description,
      partNumber: input.partNumber,
      quantity: input.quantity,
      costCents: input.costCents,
      laborMinutes: input.laborMinutes,
      vendorName: input.vendorName,
      enteredByUserId: actor.id,
    }).returning({ id: maintenanceWorkEntries.id });
    const [updated] = await transaction.update(safetyCases).set({ recordVersion: caseRecord.recordVersion + 1, updatedAt: new Date() }).where(and(eq(safetyCases.id, caseId), eq(safetyCases.recordVersion, input.recordVersion))).returning({ recordVersion: safetyCases.recordVersion });
    if (!updated) throw new MaintenanceWorkflowError("This safety case was updated concurrently.", 409);
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "safety_case.work_entry_added", entityType: "maintenance_work_entry", entityId: entry!.id, metadata: { safetyCaseId: caseId, entryType: input.entryType, costCents: input.costCents, laborMinutes: input.laborMinutes } });
    return { id: entry!.id, recordVersion: updated.recordVersion };
  });
}

export async function deleteMaintenanceWorkEntry(caseId: string, entryId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (!isMaintenance(actor.role)) throw new MaintenanceWorkflowError("Your role cannot remove maintenance work entries.", 403);
  const parsed = deleteWorkEntrySchema.safeParse(rawInput);
  if (!parsed.success) throw new MaintenanceWorkflowError("The work-entry deletion request is invalid.", 400, parsed.error.flatten());
  return db.transaction(async (transaction) => {
    const [caseRecord] = await transaction.select().from(safetyCases).where(eq(safetyCases.id, caseId)).for("update").limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== parsed.data.recordVersion) throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh and try again.", 409);
    if (caseRecord.status === "released") throw new MaintenanceWorkflowError("Released safety cases are read-only.", 409);
    const [entry] = await transaction.select().from(maintenanceWorkEntries).where(and(eq(maintenanceWorkEntries.id, entryId), eq(maintenanceWorkEntries.safetyCaseId, caseId))).limit(1);
    if (!entry) throw new MaintenanceWorkflowError("Maintenance work entry not found.", 404);
    if (actor.role === "maintenance_technician" && (caseRecord.assignedTechnicianUserId !== actor.id || entry.enteredByUserId !== actor.id)) throw new MaintenanceWorkflowError("Technicians may remove only their own entries from their assigned case.", 403);
    await transaction.delete(maintenanceWorkEntries).where(eq(maintenanceWorkEntries.id, entryId));
    const [updated] = await transaction.update(safetyCases).set({ recordVersion: caseRecord.recordVersion + 1, updatedAt: new Date() }).where(eq(safetyCases.id, caseId)).returning({ recordVersion: safetyCases.recordVersion });
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "safety_case.work_entry_removed", entityType: "maintenance_work_entry", entityId: entryId, metadata: { safetyCaseId: caseId, entryType: entry.entryType, costCents: entry.costCents } });
    return { id: entryId, recordVersion: updated!.recordVersion };
  });
}

export async function linkSafetyCaseEvidence(caseId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (!isSupervisor(actor.role) && !isMaintenance(actor.role)) throw new MaintenanceWorkflowError("Your role cannot add safety-case evidence.", 403);
  const parsed = safetyCaseEvidenceSchema.safeParse(rawInput);
  if (!parsed.success) throw new MaintenanceWorkflowError("The evidence record is invalid.", 400, parsed.error.flatten());
  const input = parsed.data;
  return db.transaction(async (transaction) => {
    const [caseRecord] = await transaction.select().from(safetyCases).where(eq(safetyCases.id, caseId)).for("update").limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== input.recordVersion) throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh and try again.", 409);
    if (caseRecord.status === "released") throw new MaintenanceWorkflowError("Released safety cases are read-only.", 409);
    if (actor.role === "maintenance_technician" && caseRecord.assignedTechnicianUserId !== actor.id) throw new MaintenanceWorkflowError("This safety case is assigned to another technician.", 403);
    const [attachment] = await transaction
      .update(attachments)
      .set({ status: "linked" })
      .where(and(eq(attachments.id, input.attachmentId), eq(attachments.uploadedByUserId, actor.id), eq(attachments.status, "pending")))
      .returning();
    if (!attachment) throw new MaintenanceWorkflowError("The uploaded evidence is unavailable, already linked, or owned by another user.", 422);
    await transaction.insert(safetyCaseAttachments).values({ safetyCaseId: caseId, attachmentId: attachment.id, category: input.category, caption: input.caption, linkedByUserId: actor.id });
    const [updated] = await transaction.update(safetyCases).set({ recordVersion: caseRecord.recordVersion + 1, updatedAt: new Date() }).where(eq(safetyCases.id, caseId)).returning({ recordVersion: safetyCases.recordVersion });
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "safety_case.evidence_linked", entityType: "attachment", entityId: attachment.id, metadata: { safetyCaseId: caseId, category: input.category, sha256: attachment.sha256 } });
    return { id: attachment.id, recordVersion: updated!.recordVersion };
  });
}

export async function submitMaintenanceEstimate(caseId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (!isMaintenance(actor.role)) throw new MaintenanceWorkflowError("Your role cannot submit maintenance estimates.", 403);
  const parsed = maintenanceEstimateSchema.safeParse(rawInput);
  if (!parsed.success) throw new MaintenanceWorkflowError("The maintenance estimate is invalid.", 400, parsed.error.flatten());
  const input = parsed.data;
  return db.transaction(async (transaction) => {
    const [caseRecord] = await transaction.select().from(safetyCases).where(eq(safetyCases.id, caseId)).for("update").limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== input.recordVersion) throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh and try again.", 409);
    if (caseRecord.status === "released") throw new MaintenanceWorkflowError("Released safety cases are read-only.", 409);
    if (actor.role === "maintenance_technician" && caseRecord.assignedTechnicianUserId !== actor.id) throw new MaintenanceWorkflowError("This safety case is assigned to another technician.", 403);
    const now = new Date();
    const [updated] = await transaction.update(safetyCases).set({ estimatedCostCents: input.estimatedCostCents, estimateStatus: "pending", estimateNote: input.note, estimateSubmittedAt: now, estimateSubmittedByUserId: actor.id, estimateReviewedAt: null, estimateReviewedByUserId: null, recordVersion: caseRecord.recordVersion + 1, updatedAt: now }).where(and(eq(safetyCases.id, caseId), eq(safetyCases.recordVersion, input.recordVersion))).returning({ recordVersion: safetyCases.recordVersion });
    if (!updated) throw new MaintenanceWorkflowError("This safety case was updated concurrently.", 409);
    await transaction.insert(safetyCaseEvents).values({ safetyCaseId: caseId, actorUserId: actor.id, action: "estimate_submitted", fromStatus: caseRecord.status, toStatus: caseRecord.status, note: input.note, metadata: { estimatedCostCents: input.estimatedCostCents } });
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "safety_case.estimate_submitted", entityType: "safety_case", entityId: caseId, metadata: { estimatedCostCents: input.estimatedCostCents } });
    const reviewers = await transaction.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.active, true), inArray(users.role, ["supervisor", "fleet_manager", "administrator"])));
    for (const reviewer of reviewers) {
      const eventKey = `safety-case:${caseId}:estimate:${updated.recordVersion}`;
      await transaction.insert(userNotifications).values({ eventKey, userId: reviewer.id, kind: "maintenance", urgency: "normal", title: "Maintenance estimate requires review", body: `${actor.displayName} submitted an estimate of ${(input.estimatedCostCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`, href: `/maintenance/${caseId}`, requiresAcknowledgment: true }).onConflictDoNothing();
      await transaction.insert(notificationOutbox).values({ eventKey, recipientUserId: reviewer.id, recipientEmail: reviewer.email, urgency: "normal", subject: "Maintenance estimate requires review", templateKey: "safety_case_update", payload: { safetyCaseId: caseId, caseStatus: caseRecord.status, action: "estimate_submitted", actionBy: actor.displayName, note: input.note } }).onConflictDoNothing();
    }
    return { recordVersion: updated.recordVersion, estimateStatus: "pending" as const };
  });
}

export async function reviewMaintenanceEstimate(caseId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (!isSupervisor(actor.role)) throw new MaintenanceWorkflowError("Your role cannot review maintenance estimates.", 403);
  const parsed = maintenanceEstimateReviewSchema.safeParse(rawInput);
  if (!parsed.success) throw new MaintenanceWorkflowError("The estimate decision is invalid.", 400, parsed.error.flatten());
  const input = parsed.data;
  return db.transaction(async (transaction) => {
    const [caseRecord] = await transaction.select().from(safetyCases).where(eq(safetyCases.id, caseId)).for("update").limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== input.recordVersion) throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh and try again.", 409);
    if (caseRecord.estimateStatus !== "pending") throw new MaintenanceWorkflowError("This estimate is not awaiting review.", 409);
    const now = new Date();
    const estimateStatus = input.action === "approve" ? "approved" : "rejected";
    const [updated] = await transaction.update(safetyCases).set({ estimateStatus, estimateNote: `${caseRecord.estimateNote ?? ""}\nReview: ${input.note}`.trim(), estimateReviewedAt: now, estimateReviewedByUserId: actor.id, recordVersion: caseRecord.recordVersion + 1, updatedAt: now }).where(and(eq(safetyCases.id, caseId), eq(safetyCases.recordVersion, input.recordVersion))).returning({ recordVersion: safetyCases.recordVersion });
    if (!updated) throw new MaintenanceWorkflowError("This safety case was updated concurrently.", 409);
    const eventAction = input.action === "approve" ? "estimate_approved" : "estimate_rejected";
    await transaction.insert(safetyCaseEvents).values({ safetyCaseId: caseId, actorUserId: actor.id, action: eventAction, fromStatus: caseRecord.status, toStatus: caseRecord.status, note: input.note, metadata: { estimatedCostCents: caseRecord.estimatedCostCents } });
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: `safety_case.${eventAction}`, entityType: "safety_case", entityId: caseId, metadata: { estimatedCostCents: caseRecord.estimatedCostCents } });
    const recipientIds = [caseRecord.estimateSubmittedByUserId, caseRecord.assignedTechnicianUserId].filter((id): id is string => Boolean(id));
    if (recipientIds.length) {
      const recipients = await transaction.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.active, true), inArray(users.id, [...new Set(recipientIds)])));
      for (const recipient of recipients) {
        const eventKey = `safety-case:${caseId}:estimate-review:${updated.recordVersion}`;
        await transaction.insert(userNotifications).values({ eventKey, userId: recipient.id, kind: "maintenance", urgency: input.action === "reject" ? "critical" : "normal", title: `Maintenance estimate ${estimateStatus}`, body: `${actor.displayName} ${estimateStatus} the estimate. ${input.note}`, href: `/maintenance/${caseId}`, requiresAcknowledgment: input.action === "reject" }).onConflictDoNothing();
      }
    }
    return { recordVersion: updated.recordVersion, estimateStatus };
  });
}

export async function reassignMaintenanceCase(caseId: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (!isSupervisor(actor.role)) throw new MaintenanceWorkflowError("Your role cannot reassign maintenance cases.", 403);
  const parsed = maintenanceReassignmentSchema.safeParse(rawInput);
  if (!parsed.success) throw new MaintenanceWorkflowError("The reassignment request is invalid.", 400, parsed.error.flatten());
  const input = parsed.data;
  return db.transaction(async (transaction) => {
    const [caseRecord] = await transaction.select().from(safetyCases).where(eq(safetyCases.id, caseId)).for("update").limit(1);
    if (!caseRecord) throw new MaintenanceWorkflowError("Safety case not found.", 404);
    if (caseRecord.recordVersion !== input.recordVersion) throw new MaintenanceWorkflowError("This safety case changed after it was opened. Refresh and try again.", 409);
    if (!new Set(["maintenance_assigned", "repair_in_progress"]).has(caseRecord.status)) throw new MaintenanceWorkflowError("Only an active maintenance assignment may be reassigned.", 409);
    if (caseRecord.assignedTechnicianUserId === input.assignedTechnicianUserId) throw new MaintenanceWorkflowError("Select a different technician.", 409);
    const [technician] = await transaction.select({ id: users.id, email: users.email, role: users.role, active: users.active }).from(users).where(eq(users.id, input.assignedTechnicianUserId)).limit(1);
    if (!technician?.active || !isAssignableTechnician(technician.role)) throw new MaintenanceWorkflowError("Select an active maintenance technician or fleet manager.", 422);
    const previousTechnicianUserId = caseRecord.assignedTechnicianUserId;
    const now = new Date();
    const [updated] = await transaction.update(safetyCases).set({ assignedTechnicianUserId: technician.id, assignedAt: now, assignedByUserId: actor.id, recordVersion: caseRecord.recordVersion + 1, updatedAt: now }).where(and(eq(safetyCases.id, caseId), eq(safetyCases.recordVersion, input.recordVersion))).returning({ recordVersion: safetyCases.recordVersion });
    if (!updated) throw new MaintenanceWorkflowError("This safety case was updated concurrently.", 409);
    await transaction.insert(safetyCaseEvents).values({ safetyCaseId: caseId, actorUserId: actor.id, action: "maintenance_reassigned", fromStatus: caseRecord.status, toStatus: caseRecord.status, note: input.note, metadata: { previousTechnicianUserId, assignedTechnicianUserId: technician.id } });
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "safety_case.maintenance_reassigned", entityType: "safety_case", entityId: caseId, metadata: { previousTechnicianUserId, assignedTechnicianUserId: technician.id } });
    const recipientIds = [previousTechnicianUserId, technician.id].filter((id): id is string => Boolean(id));
    const recipients = await transaction.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.active, true), inArray(users.id, [...new Set(recipientIds)])));
    for (const recipient of recipients) {
      const eventKey = `safety-case:${caseId}:reassigned:${updated.recordVersion}`;
      await transaction.insert(userNotifications).values({ eventKey, userId: recipient.id, kind: "maintenance", urgency: "critical", title: "Maintenance assignment changed", body: `${actor.displayName} reassigned this safety case. ${input.note}`, href: `/maintenance/${caseId}`, requiresAcknowledgment: recipient.id === technician.id }).onConflictDoNothing();
      await transaction.insert(notificationOutbox).values({ eventKey, recipientUserId: recipient.id, recipientEmail: recipient.email, urgency: "critical", subject: "Maintenance assignment changed", templateKey: "safety_case_update", payload: { safetyCaseId: caseId, caseStatus: caseRecord.status, action: "maintenance_reassigned", actionBy: actor.displayName, note: input.note } }).onConflictDoNothing();
    }
    return { recordVersion: updated.recordVersion, assignedTechnicianUserId: technician.id };
  });
}
