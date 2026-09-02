import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attachments,
  defects,
  inspectionItems,
  inspectionItemRules,
  inspectionSections,
  inspectionSubmissions,
  inspectionTemplates,
  maintenanceWorkEntries,
  safetyCases,
  users,
  vehicleClasses,
  vehicleAttachments,
  vehicleInspectionAssignments,
  vehicleQrCodes,
  vehicles,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { mayViewVehicleDocuments } from "./vehicle-documents";

export async function getFleetDashboard() {
  const [vehicleRows, activeDefectRows, recentSubmissionRows] = await Promise.all([
    db
      .select({
        id: vehicles.id,
        unitNumber: vehicles.unitNumber,
        displayCode: vehicles.displayCode,
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
        disposition: vehicles.disposition,
        lifecycleStatus: vehicles.lifecycleStatus,
        classCode: vehicleClasses.code,
        className: vehicleClasses.name,
      })
      .from(vehicles)
      .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
      .where(eq(vehicles.lifecycleStatus, "active"))
      .orderBy(asc(vehicles.displayCode), asc(vehicles.unitNumber)),
    db
      .select({
        vehicleId: defects.vehicleId,
        count: sql<number>`count(*)::int`,
        criticalCount: sql<number>`count(*) filter (where ${defects.severity} = 'critical')::int`,
      })
      .from(defects)
      .where(sql`${defects.status} <> 'closed'`)
      .groupBy(defects.vehicleId),
    db
      .select({
        id: inspectionSubmissions.id,
        vehicleId: inspectionSubmissions.vehicleId,
        status: inspectionSubmissions.status,
        disposition: inspectionSubmissions.calculatedDisposition,
        severity: inspectionSubmissions.calculatedSeverity,
        submittedAt: inspectionSubmissions.submittedAt,
      })
      .from(inspectionSubmissions)
      .where(sql`${inspectionSubmissions.submittedAt} is not null`)
      .orderBy(desc(inspectionSubmissions.submittedAt))
      .limit(8),
  ]);

  const defectsByVehicle = new Map(activeDefectRows.map((row) => [row.vehicleId, row]));
  const fleet = vehicleRows.map((vehicle) => ({
    ...vehicle,
    openDefects: defectsByVehicle.get(vehicle.id)?.count ?? 0,
    criticalDefects: defectsByVehicle.get(vehicle.id)?.criticalCount ?? 0,
  }));

  return {
    fleet,
    recentSubmissions: recentSubmissionRows,
    metrics: {
      totalActive: fleet.length,
      cleared: fleet.filter((vehicle) =>
        ["cleared", "cleared_with_advisory"].includes(vehicle.disposition),
      ).length,
      review: fleet.filter((vehicle) => vehicle.disposition === "hold_for_review").length,
      outOfService: fleet.filter((vehicle) => vehicle.disposition === "out_of_service").length,
      inspectionRequired: fleet.filter(
        (vehicle) => vehicle.disposition === "inspection_required",
      ).length,
      openDefects: activeDefectRows.reduce((total, row) => total + row.count, 0),
    },
  };
}

export async function listVehicles() {
  return db
    .select({
      id: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      currentOdometer: vehicles.currentOdometer,
      lifecycleStatus: vehicles.lifecycleStatus,
      disposition: vehicles.disposition,
      classCode: vehicleClasses.code,
      className: vehicleClasses.name,
      qrPublicId: vehicleQrCodes.publicId,
    })
    .from(vehicles)
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .leftJoin(
      vehicleQrCodes,
      and(eq(vehicleQrCodes.vehicleId, vehicles.id), eq(vehicleQrCodes.status, "active")),
    )
    .orderBy(asc(vehicles.displayCode), asc(vehicles.unitNumber));
}

export async function getVehicleById(id: string) {
  const actor = await requirePermission("fleet:read");
  const rows = await db
    .select({
      id: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      vin: vehicles.vin,
      licensePlate: vehicles.licensePlate,
      licenseState: vehicles.licenseState,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      currentOdometer: vehicles.currentOdometer,
      assetTag: vehicles.assetTag,
      acquisitionDate: vehicles.acquisitionDate,
      purchaseCostCents: vehicles.purchaseCostCents,
      inServiceDate: vehicles.inServiceDate,
      fuelType: vehicles.fuelType,
      ownershipType: vehicles.ownershipType,
      primaryLocation: vehicles.primaryLocation,
      notes: vehicles.notes,
      lifecycleStatus: vehicles.lifecycleStatus,
      disposition: vehicles.disposition,
      createdAt: vehicles.createdAt,
      updatedAt: vehicles.updatedAt,
      classCode: vehicleClasses.code,
      className: vehicleClasses.name,
      qrId: vehicleQrCodes.id,
      qrPublicId: vehicleQrCodes.publicId,
      qrStatus: vehicleQrCodes.status,
      qrActivatedAt: vehicleQrCodes.activatedAt,
      qrLastScannedAt: vehicleQrCodes.lastScannedAt,
    })
    .from(vehicles)
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .leftJoin(
      vehicleQrCodes,
      and(eq(vehicleQrCodes.vehicleId, vehicles.id), eq(vehicleQrCodes.status, "active")),
    )
    .where(eq(vehicles.id, id))
    .limit(1);

  if (!rows[0]) return null;

  const [assignments, openDefects, recentInspections, caseRows, workTotals, documents] = await Promise.all([
    getVehicleAssignments(id),
    db.select().from(defects).where(and(eq(defects.vehicleId, id), sql`${defects.status} <> 'closed'`)).orderBy(desc(defects.createdAt)),
    db
      .select({
        id: inspectionSubmissions.id,
        submittedAt: inspectionSubmissions.submittedAt,
        disposition: inspectionSubmissions.calculatedDisposition,
        severity: inspectionSubmissions.calculatedSeverity,
        templateName: inspectionTemplates.name,
        templateVersion: inspectionTemplates.version,
        driverName: users.displayName,
      })
      .from(inspectionSubmissions)
      .innerJoin(inspectionTemplates, eq(inspectionSubmissions.templateId, inspectionTemplates.id))
      .innerJoin(users, eq(inspectionSubmissions.inspectorUserId, users.id))
      .where(and(eq(inspectionSubmissions.vehicleId, id), sql`${inspectionSubmissions.submittedAt} is not null`))
      .orderBy(desc(inspectionSubmissions.submittedAt))
      .limit(20),
    db
      .select({
        id: safetyCases.id,
        status: safetyCases.status,
        priority: safetyCases.priority,
        summary: safetyCases.summary,
        estimatedCostCents: safetyCases.estimatedCostCents,
        estimateStatus: safetyCases.estimateStatus,
        createdAt: safetyCases.createdAt,
        releasedAt: safetyCases.releasedAt,
      })
      .from(safetyCases)
      .where(eq(safetyCases.vehicleId, id))
      .orderBy(desc(safetyCases.createdAt))
      .limit(20),
    db
      .select({
        safetyCaseId: maintenanceWorkEntries.safetyCaseId,
        totalCostCents: sql<number>`coalesce(sum(${maintenanceWorkEntries.costCents}), 0)::int`,
        totalLaborMinutes: sql<number>`coalesce(sum(${maintenanceWorkEntries.laborMinutes}), 0)::int`,
      })
      .from(maintenanceWorkEntries)
      .innerJoin(safetyCases, eq(maintenanceWorkEntries.safetyCaseId, safetyCases.id))
      .where(eq(safetyCases.vehicleId, id))
      .groupBy(maintenanceWorkEntries.safetyCaseId),
    mayViewVehicleDocuments(actor.role)
      ? db
          .select({
            id: attachments.id,
            originalName: attachments.originalName,
            mimeType: attachments.mimeType,
            byteSize: attachments.byteSize,
            category: vehicleAttachments.category,
            caption: vehicleAttachments.caption,
            effectiveDate: vehicleAttachments.effectiveDate,
            expiresOn: vehicleAttachments.expiresOn,
            isPrimary: vehicleAttachments.isPrimary,
            createdAt: vehicleAttachments.createdAt,
          })
          .from(vehicleAttachments)
          .innerJoin(attachments, eq(vehicleAttachments.attachmentId, attachments.id))
          .where(and(eq(vehicleAttachments.vehicleId, id), isNull(vehicleAttachments.retiredAt)))
          .orderBy(desc(vehicleAttachments.isPrimary), desc(vehicleAttachments.createdAt))
      : Promise.resolve([]),
  ]);

  const workByCase = new Map(workTotals.map((row) => [row.safetyCaseId, row]));
  return {
    ...rows[0],
    assignments,
    openDefects,
    recentInspections,
    safetyHistory: caseRows.map((item) => ({ ...item, ...(workByCase.get(item.id) ?? { totalCostCents: 0, totalLaborMinutes: 0 }) })),
    documents,
    mayViewDocuments: mayViewVehicleDocuments(actor.role),
    mayManageDocuments: actor.role === "fleet_manager" || actor.role === "administrator",
  };
}

export async function getVehicleByQrPublicId(publicId: string) {
  const rows = await db
    .select({
      id: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      lifecycleStatus: vehicles.lifecycleStatus,
      disposition: vehicles.disposition,
      classCode: vehicleClasses.code,
      className: vehicleClasses.name,
      qrId: vehicleQrCodes.id,
      qrPublicId: vehicleQrCodes.publicId,
      qrStatus: vehicleQrCodes.status,
    })
    .from(vehicleQrCodes)
    .innerJoin(vehicles, eq(vehicleQrCodes.vehicleId, vehicles.id))
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .where(and(eq(vehicleQrCodes.publicId, publicId), eq(vehicleQrCodes.status, "active"), eq(vehicles.lifecycleStatus, "active")))
    .limit(1);

  if (!rows[0]) return null;

  await db
    .update(vehicleQrCodes)
    .set({ lastScannedAt: new Date() })
    .where(eq(vehicleQrCodes.id, rows[0].qrId));

  const [assignments, openDefects, activeSafetyCaseRows] = await Promise.all([
    getVehicleAssignments(rows[0].id),
    db
      .select({ id: defects.id, title: defects.title, severity: defects.severity })
      .from(defects)
      .where(and(eq(defects.vehicleId, rows[0].id), sql`${defects.status} <> 'closed'`)),
    db
      .select({ id: safetyCases.id, status: safetyCases.status })
      .from(safetyCases)
      .where(and(eq(safetyCases.vehicleId, rows[0].id), sql`${safetyCases.status} <> 'released'`))
      .orderBy(desc(safetyCases.createdAt))
      .limit(1),
  ]);

  return { ...rows[0], assignments, openDefects, activeSafetyCase: activeSafetyCaseRows[0] ?? null };
}

export async function getQrLabel(publicId: string) {
  const rows = await db
    .select({
      publicId: vehicleQrCodes.publicId,
      qrStatus: vehicleQrCodes.status,
      vehicleId: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      classCode: vehicleClasses.code,
      className: vehicleClasses.name,
    })
    .from(vehicleQrCodes)
    .innerJoin(vehicles, eq(vehicleQrCodes.vehicleId, vehicles.id))
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .where(and(eq(vehicleQrCodes.publicId, publicId), eq(vehicleQrCodes.status, "active"), eq(vehicles.lifecycleStatus, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function getVehicleAssignments(vehicleId: string) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select({
      id: vehicleInspectionAssignments.id,
      frequency: vehicleInspectionAssignments.frequency,
      autoLaunch: vehicleInspectionAssignments.autoLaunch,
      templateId: inspectionTemplates.id,
      templateCode: inspectionTemplates.code,
      templateName: inspectionTemplates.name,
      templateDescription: inspectionTemplates.description,
      templateVersion: inspectionTemplates.version,
      templateStatus: inspectionTemplates.status,
      ruleSetStatus: inspectionTemplates.ruleSetStatus,
    })
    .from(vehicleInspectionAssignments)
    .innerJoin(
      inspectionTemplates,
      eq(vehicleInspectionAssignments.templateId, inspectionTemplates.id),
    )
    .where(
      and(
        eq(vehicleInspectionAssignments.vehicleId, vehicleId),
        eq(inspectionTemplates.status, "published"),
        lte(vehicleInspectionAssignments.effectiveFrom, today),
        or(
          isNull(vehicleInspectionAssignments.effectiveUntil),
          gt(vehicleInspectionAssignments.effectiveUntil, today),
        ),
      ),
    )
    .orderBy(desc(vehicleInspectionAssignments.autoLaunch), asc(inspectionTemplates.name));
}

export async function getTemplateDefinition(templateId: string) {
  const templates = await db
    .select()
    .from(inspectionTemplates)
    .where(eq(inspectionTemplates.id, templateId))
    .limit(1);
  if (!templates[0]) return null;

  const [sectionRows, itemRows, ruleRows] = await Promise.all([
    db
      .select()
      .from(inspectionSections)
      .where(eq(inspectionSections.templateId, templateId))
      .orderBy(asc(inspectionSections.sortOrder)),
    db
      .select()
      .from(inspectionItems)
      .where(eq(inspectionItems.templateId, templateId))
      .orderBy(asc(inspectionItems.sortOrder)),
    db
      .select({
        id: inspectionItemRules.id,
        itemId: inspectionItemRules.inspectionItemId,
        whenResponse: inspectionItemRules.whenResponse,
        severity: inspectionItemRules.severity,
        disposition: inspectionItemRules.disposition,
        blockDeparture: inspectionItemRules.blockDeparture,
        requireComment: inspectionItemRules.requireComment,
        requirePhoto: inspectionItemRules.requirePhoto,
        createDefect: inspectionItemRules.createDefect,
        notifyDriver: inspectionItemRules.notifyDriver,
        notifySupervisor: inspectionItemRules.notifySupervisor,
        notifyMaintenance: inspectionItemRules.notifyMaintenance,
        driverMessage: inspectionItemRules.driverMessage,
        priority: inspectionItemRules.priority,
      })
      .from(inspectionItemRules)
      .innerJoin(inspectionItems, eq(inspectionItemRules.inspectionItemId, inspectionItems.id))
      .where(eq(inspectionItems.templateId, templateId)),
  ]);

  return {
    ...templates[0],
    sections: sectionRows.map((section) => ({
      ...section,
      items: itemRows.filter((item) => item.sectionId === section.id),
    })),
    rules: ruleRows,
  };
}
