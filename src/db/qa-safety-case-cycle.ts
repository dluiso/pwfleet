import { and, eq, inArray, like, or } from "drizzle-orm";
import { db, pool } from "./client";
import {
  auditEvents,
  attachments,
  defects,
  inspectionSubmissions,
  inspectionTemplates,
  maintenanceWorkEntries,
  notificationOutbox,
  safetyCaseEvents,
  safetyCaseAttachments,
  safetyCases,
  users,
  userNotifications,
  vehicleClasses,
  vehicleInspectionAssignments,
  vehicles,
} from "./schema";
import { getEnvironment } from "@/lib/env";
import { getTemplateDefinition } from "@/modules/fleet/repository";
import { submitInspection } from "@/modules/inspections/service";
import { addMaintenanceWorkEntry, linkSafetyCaseEvidence, reviewMaintenanceEstimate, submitMaintenanceEstimate, transitionSafetyCase, updateSafetyCaseDetails } from "@/modules/maintenance/service";

const qaUnitNumber = "QA-SAFETY-CYCLE";

function responseFor(item: { fieldType: string; options: string[] | null }) {
  if (item.fieldType === "pass_defect_na") return "pass";
  if (item.fieldType === "odometer" || item.fieldType === "number") return 1;
  if (item.fieldType === "fuel_level" || item.fieldType === "select") return item.options?.[0] ?? "Recorded";
  if (item.fieldType === "attestation") return true;
  if (item.fieldType === "damage_map") return [];
  return "Safety workflow QA";
}

async function runSafetyCycle() {
  if (getEnvironment().NODE_ENV === "production") throw new Error("Safety-cycle QA cannot run in production.");
  const [existing] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.unitNumber, qaUnitNumber)).limit(1);
  if (existing) throw new Error(`Remove the interrupted ${qaUnitNumber} record before running QA again.`);

  const [[vehicleClass], [template], [driver], [technician], [qaActor]] = await Promise.all([
    db.select({ id: vehicleClasses.id }).from(vehicleClasses).where(eq(vehicleClasses.active, true)).limit(1),
    db.select({ id: inspectionTemplates.id, version: inspectionTemplates.version, ruleSetStatus: inspectionTemplates.ruleSetStatus, rulesApprovedAt: inspectionTemplates.rulesApprovedAt, rulesApprovedByUserId: inspectionTemplates.rulesApprovedByUserId }).from(inspectionTemplates).where(and(eq(inspectionTemplates.status, "published"), eq(inspectionTemplates.code, "DUMP_TRUCK_PRETRIP"))).limit(1),
    db.select({ id: users.id }).from(users).where(and(eq(users.active, true), eq(users.role, "driver"))).limit(1),
    db.select({ id: users.id }).from(users).where(and(eq(users.active, true), eq(users.role, "maintenance_technician"))).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.email, getEnvironment().DEV_ACTOR_EMAIL!)).limit(1),
  ]);
  if (!vehicleClass || !template || !driver || !technician || !qaActor) throw new Error("Seed class, form, driver, maintenance technician, and QA actor are required.");

  let vehicleId: string | undefined;
  let caseId: string | undefined;
  let reinspectionId: string | undefined;
  let attachmentId: string | undefined;
  const workEntryIds: string[] = [];
  try {
    if (template.ruleSetStatus !== "approved") await db.update(inspectionTemplates).set({ ruleSetStatus: "approved", rulesApprovedAt: new Date(), rulesApprovedByUserId: qaActor.id }).where(eq(inspectionTemplates.id, template.id));
    const created = await db.transaction(async (transaction) => {
      const [vehicle] = await transaction.insert(vehicles).values({ unitNumber: qaUnitNumber, displayCode: "QA-SF", vehicleClassId: vehicleClass.id, disposition: "hold_for_review" }).returning({ id: vehicles.id });
      const [source] = await transaction.insert(inspectionSubmissions).values({ vehicleId: vehicle!.id, templateId: template.id, templateVersion: template.version, inspectorUserId: driver.id, status: "pending_review", calculatedSeverity: "major", calculatedDisposition: "hold_for_review", submittedAt: new Date() }).returning({ id: inspectionSubmissions.id });
      await transaction.insert(vehicleInspectionAssignments).values({ vehicleId: vehicle!.id, templateId: template.id, frequency: "before_first_departure", autoLaunch: true });
      await transaction.insert(defects).values({ vehicleId: vehicle!.id, submissionId: source!.id, title: "QA blocking brake condition", description: "Synthetic local workflow test", severity: "major", blocksDeparture: true, reportedByUserId: driver.id });
      const [safetyCase] = await transaction.insert(safetyCases).values({ vehicleId: vehicle!.id, sourceSubmissionId: source!.id, summary: "Synthetic local safety workflow test" }).returning({ id: safetyCases.id });
      await transaction.insert(safetyCaseEvents).values({ safetyCaseId: safetyCase!.id, action: "created", toStatus: "pending_supervisor_review", note: "Synthetic local workflow test created." });
      return { vehicleId: vehicle!.id, sourceSubmissionId: source!.id, caseId: safetyCase!.id };
    });
    vehicleId = created.vehicleId;
    caseId = created.caseId;

    const details = await updateSafetyCaseDetails(caseId, { recordVersion: 1, priority: "critical", targetResolutionAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), serviceProvider: "Harvey Public Works Garage", externalReference: "QA-WO-001" });
    const labor = await addMaintenanceWorkEntry(caseId, { recordVersion: details.recordVersion, entryType: "labor", description: "Brake inspection and adjustment", partNumber: null, quantity: 1, costCents: 12_500, laborMinutes: 60, vendorName: null });
    workEntryIds.push(labor.id);
    const estimate = await submitMaintenanceEstimate(caseId, { recordVersion: labor.recordVersion, estimatedCostCents: 70_000, note: "QA estimated parts and labor" });
    const estimateReview = await reviewMaintenanceEstimate(caseId, { action: "approve", recordVersion: estimate.recordVersion, note: "QA estimate approval" });
    const part = await addMaintenanceWorkEntry(caseId, { recordVersion: estimateReview.recordVersion, entryType: "part", description: "Replacement brake hardware", partNumber: "QA-BRAKE-01", quantity: 1, costCents: 48_000, laborMinutes: 0, vendorName: "QA Parts Vendor" });
    workEntryIds.push(part.id);
    const [qaAttachment] = await db.insert(attachments).values({ uploadedByUserId: (await db.select({ id: users.id }).from(users).where(eq(users.email, getEnvironment().DEV_ACTOR_EMAIL!)).limit(1))[0]!.id, storageKey: `qa/${caseId}.jpg`, originalName: "qa-repair-evidence.jpg", mimeType: "image/jpeg", byteSize: 4, sha256: "0".repeat(64) }).returning({ id: attachments.id });
    attachmentId = qaAttachment!.id;
    const evidence = await linkSafetyCaseEvidence(caseId, { recordVersion: part.recordVersion, attachmentId, category: "after_repair", caption: "Synthetic evidence-link QA" });
    await transitionSafetyCase(caseId, { action: "assign_maintenance", recordVersion: evidence.recordVersion, assignedTechnicianUserId: technician.id, note: "QA assignment" });
    await transitionSafetyCase(caseId, { action: "start_repair", recordVersion: evidence.recordVersion + 1, note: "QA repair started" });
    await transitionSafetyCase(caseId, { action: "complete_repair", recordVersion: evidence.recordVersion + 2, note: "QA brake condition repaired and independently checked." });

    const definition = await getTemplateDefinition(template.id);
    if (!definition) throw new Error("QA template definition was not found.");
    const reinspection = await submitInspection({
      vehicleId,
      templateId: template.id,
      odometer: 1,
      answers: definition.sections.flatMap((section) => section.items.map((item) => ({ itemId: item.id, response: responseFor(item) }))),
    });
    reinspectionId = reinspection.inspectionId;
    const [awaitingRelease] = await db.select({ status: safetyCases.status, recordVersion: safetyCases.recordVersion }).from(safetyCases).where(eq(safetyCases.id, caseId)).limit(1);
    if (awaitingRelease?.status !== "awaiting_release") throw new Error(`Expected awaiting_release after clean reinspection, received ${awaitingRelease?.status ?? "missing"}.`);
    await transitionSafetyCase(caseId, { action: "approve_release", recordVersion: awaitingRelease.recordVersion, note: "QA clean reinspection verified; vehicle release approved." });

    const [[finalCase], [finalVehicle], openDefects, workEntries, evidenceRows] = await Promise.all([
      db.select({ status: safetyCases.status, priority: safetyCases.priority, serviceProvider: safetyCases.serviceProvider }).from(safetyCases).where(eq(safetyCases.id, caseId)).limit(1),
      db.select({ disposition: vehicles.disposition }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1),
      db.select({ id: defects.id }).from(defects).where(and(eq(defects.vehicleId, vehicleId), or(eq(defects.status, "reported"), eq(defects.status, "under_review"), eq(defects.status, "assigned"), eq(defects.status, "repair_in_progress"), eq(defects.status, "repair_completed"), eq(defects.status, "verification_required")))),
      db.select({ costCents: maintenanceWorkEntries.costCents, laborMinutes: maintenanceWorkEntries.laborMinutes }).from(maintenanceWorkEntries).where(eq(maintenanceWorkEntries.safetyCaseId, caseId)),
      db.select({ attachmentId: safetyCaseAttachments.attachmentId }).from(safetyCaseAttachments).where(eq(safetyCaseAttachments.safetyCaseId, caseId)),
    ]);
    const totalCostCents = workEntries.reduce((total, entry) => total + entry.costCents, 0);
    const totalLaborMinutes = workEntries.reduce((total, entry) => total + entry.laborMinutes, 0);
    if (finalCase?.status !== "released" || finalCase.priority !== "critical" || finalCase.serviceProvider !== "Harvey Public Works Garage" || finalVehicle?.disposition !== "cleared" || openDefects.length || totalCostCents !== 60_500 || totalLaborMinutes !== 60 || evidenceRows.length !== 1) {
      throw new Error("Safety-cycle QA did not reach a clean released terminal state.");
    }
    return { caseId, reinspectionId: reinspection.inspectionId, status: finalCase.status, disposition: finalVehicle.disposition, totalCostCents, totalLaborMinutes };
  } finally {
    if (vehicleId) {
      const cleanupVehicleId = vehicleId;
      const cleanupCaseId = caseId;
      const cleanupReinspectionId = reinspectionId;
      await db.transaction(async (transaction) => {
        if (cleanupCaseId) {
          await transaction.delete(notificationOutbox).where(like(notificationOutbox.eventKey, `safety-case:${cleanupCaseId}:%`));
          await transaction.delete(userNotifications).where(like(userNotifications.eventKey, `safety-case:${cleanupCaseId}:%`));
          await transaction.delete(auditEvents).where(and(eq(auditEvents.entityType, "safety_case"), eq(auditEvents.entityId, cleanupCaseId)));
          if (workEntryIds.length) await transaction.delete(auditEvents).where(and(eq(auditEvents.entityType, "maintenance_work_entry"), inArray(auditEvents.entityId, workEntryIds)));
          if (attachmentId) await transaction.delete(auditEvents).where(and(eq(auditEvents.entityType, "attachment"), eq(auditEvents.entityId, attachmentId)));
          await transaction.delete(safetyCases).where(eq(safetyCases.id, cleanupCaseId));
          if (attachmentId) await transaction.delete(attachments).where(eq(attachments.id, attachmentId));
        }
        if (cleanupReinspectionId) {
          await transaction.delete(notificationOutbox).where(eq(notificationOutbox.eventKey, `inspection:${cleanupReinspectionId}`));
          await transaction.delete(userNotifications).where(eq(userNotifications.eventKey, `inspection:${cleanupReinspectionId}`));
        }
        await transaction.delete(defects).where(eq(defects.vehicleId, cleanupVehicleId));
        const submissions = await transaction.select({ id: inspectionSubmissions.id }).from(inspectionSubmissions).where(eq(inspectionSubmissions.vehicleId, cleanupVehicleId));
        const submissionIds = submissions.map((submission) => submission.id);
        if (submissionIds.length) {
          await transaction.delete(auditEvents).where(and(eq(auditEvents.entityType, "inspection_submission"), inArray(auditEvents.entityId, submissionIds)));
          await transaction.delete(inspectionSubmissions).where(inArray(inspectionSubmissions.id, submissionIds));
        }
        await transaction.delete(vehicleInspectionAssignments).where(eq(vehicleInspectionAssignments.vehicleId, cleanupVehicleId));
        await transaction.delete(vehicles).where(eq(vehicles.id, cleanupVehicleId));
      });
    }
    if (template.ruleSetStatus !== "approved") await db.update(inspectionTemplates).set({ ruleSetStatus: template.ruleSetStatus, rulesApprovedAt: template.rulesApprovedAt, rulesApprovedByUserId: template.rulesApprovedByUserId }).where(eq(inspectionTemplates.id, template.id));
  }
}

try {
  const result = await runSafetyCycle();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unknown safety-cycle QA error"}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
