import "server-only";

import crypto from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  authSessions,
  auditEvents,
  inspectionItemRules,
  inspectionItems,
  inspectionSections,
  inspectionSubmissions,
  inspectionTemplateReviews,
  inspectionTemplates,
  users,
  vehicleClasses,
  vehicleInspectionAssignments,
  vehicleQrCodes,
  vehicles,
} from "@/db/schema";
import { AuthorizationError, can, getCurrentActor, requirePermission } from "@/lib/auth";
import { hashLocalPassword, verifyLocalPassword } from "@/lib/password";
import { getRuntimeIntegrationModes } from "@/modules/integrations/settings";
import {
  assignmentInputSchema,
  createTemplateInputSchema,
  createTemplateVersionInputSchema,
  deleteDraftTemplateInputSchema,
  deleteUserSchema,
  draftTemplateDefinitionSchema,
  endAssignmentInputSchema,
  rotateQrInputSchema,
  publishableTemplateDefinitionSchema,
  resetIdentityBindingSchema,
  resetLocalPasswordSchema,
  templateWorkflowInputSchema,
  userInputSchema,
  userUpdateSchema,
  vehicleInputSchema,
  vehicleImportSchema,
  vehicleClassInputSchema,
  vehicleClassUpdateSchema,
  vehicleUpdateSchema,
} from "./validation";

export class AdministrationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdministrationError";
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AdministrationError(
      "The submitted administrative data is invalid.",
      400,
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasDatabaseErrorCode(error.cause, code);
}

function isUniqueViolation(error: unknown): boolean {
  return hasDatabaseErrorCode(error, "23505");
}

function isForeignKeyViolation(error: unknown): boolean {
  return hasDatabaseErrorCode(error, "23503");
}

function assertUserRoleAuthority(actor: typeof users.$inferSelect, role: typeof users.$inferSelect.role) {
  if (actor.role === "administrator") return;
  if (actor.role === "fleet_manager" && role !== "administrator" && role !== "fleet_manager") return;
  throw new AdministrationError("Fleet managers cannot manage administrator or fleet manager accounts.", 403);
}

async function requireFormGovernanceAccess() {
  const actor = await getCurrentActor();
  const eligibleReviewer = actor.role === "supervisor" || actor.role === "fleet_manager";
  if (!eligibleReviewer && !can(actor, "configuration:manage")) {
    throw new AuthorizationError("inspection:review");
  }
  return actor;
}

export async function listAdministrationVehicles() {
  await requirePermission("fleet:write");
  return db
    .select({
      id: vehicles.id,
      unitNumber: vehicles.unitNumber,
      displayCode: vehicles.displayCode,
      vehicleClassId: vehicles.vehicleClassId,
      classCode: vehicleClasses.code,
      className: vehicleClasses.name,
      vin: vehicles.vin,
      licensePlate: vehicles.licensePlate,
      licenseState: vehicles.licenseState,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
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
      recordVersion: vehicles.recordVersion,
      qrPublicId: vehicleQrCodes.publicId,
      qrStatus: vehicleQrCodes.status,
    })
    .from(vehicles)
    .innerJoin(vehicleClasses, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .leftJoin(
      vehicleQrCodes,
      and(eq(vehicleQrCodes.vehicleId, vehicles.id), eq(vehicleQrCodes.status, "active")),
    )
    .orderBy(asc(vehicles.unitNumber));
}

export async function listAdministrationVehicleClasses() {
  await requirePermission("fleet:write");
  return db
    .select({
      id: vehicleClasses.id,
      code: vehicleClasses.code,
      name: vehicleClasses.name,
      description: vehicleClasses.description,
      active: vehicleClasses.active,
      recordVersion: vehicleClasses.recordVersion,
      vehicleCount: sql<number>`count(${vehicles.id})::int`,
    })
    .from(vehicleClasses)
    .leftJoin(vehicles, eq(vehicles.vehicleClassId, vehicleClasses.id))
    .groupBy(vehicleClasses.id)
    .orderBy(asc(vehicleClasses.code));
}

export async function createVehicleClass(rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const input = parseOrThrow(vehicleClassInputSchema, rawInput);
  try {
    const [created] = await db.insert(vehicleClasses).values({ ...input, description: input.description ?? null }).returning({ id: vehicleClasses.id });
    await db.insert(auditEvents).values({ actorUserId: actor.id, eventType: "vehicle_class.created", entityType: "vehicle_class", entityId: created!.id, metadata: { code: input.code } });
    return created!;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdministrationError("That vehicle class code is already in use.", 409);
    throw error;
  }
}

export async function updateVehicleClass(id: string, rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const input = parseOrThrow(vehicleClassUpdateSchema, rawInput);
  try {
    const [updated] = await db.update(vehicleClasses).set({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      active: input.active,
      recordVersion: input.recordVersion + 1,
      updatedAt: new Date(),
    }).where(and(eq(vehicleClasses.id, id), eq(vehicleClasses.recordVersion, input.recordVersion))).returning({ id: vehicleClasses.id });
    if (!updated) {
      const [exists] = await db.select({ id: vehicleClasses.id }).from(vehicleClasses).where(eq(vehicleClasses.id, id));
      throw new AdministrationError(exists ? "This vehicle class changed in another session. Refresh and try again." : "Vehicle class not found.", exists ? 409 : 404);
    }
    await db.insert(auditEvents).values({ actorUserId: actor.id, eventType: "vehicle_class.updated", entityType: "vehicle_class", entityId: id, metadata: { code: input.code, active: input.active } });
    return { id };
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdministrationError("That vehicle class code is already in use.", 409);
    throw error;
  }
}

export async function listAdministrationUsers() {
  await requirePermission("users:manage");
  return db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      active: users.active,
      recordVersion: users.recordVersion,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      identityBound: sql<boolean>`${users.oidcSubject} is not null`,
      passwordSet: sql<boolean>`${users.localPasswordHash} is not null`,
    })
    .from(users)
    .orderBy(asc(users.displayName));
}

export async function listAuditTrail(filters: { eventType?: string; entityType?: string } = {}) {
  await requirePermission("audit:read");
  const conditions = [];
  if (filters.eventType?.trim()) conditions.push(eq(auditEvents.eventType, filters.eventType.trim().slice(0, 120)));
  if (filters.entityType?.trim()) conditions.push(eq(auditEvents.entityType, filters.entityType.trim().slice(0, 80)));
  return db
    .select({
      id: auditEvents.id,
      eventType: auditEvents.eventType,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      actorName: users.displayName,
      actorEmail: users.email,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorUserId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditEvents.createdAt))
    .limit(250);
}

export async function getPilotReadiness() {
  await requirePermission("configuration:manage");
  const today = new Date().toISOString().slice(0, 10);
  const [[vehicleSummary], [templateSummary], [assignmentSummary], roleRows, integrations] = await Promise.all([
    db.select({
      total: count(),
      active: sql<number>`count(*) filter (where ${vehicles.lifecycleStatus} = 'active')::int`,
      activeQr: sql<number>`count(*) filter (where ${vehicleQrCodes.status} = 'active')::int`,
    }).from(vehicles).leftJoin(vehicleQrCodes, and(eq(vehicleQrCodes.vehicleId, vehicles.id), eq(vehicleQrCodes.status, "active"))),
    db.select({
      assignable: sql<number>`count(*) filter (where ${inspectionTemplates.status} = 'published' and ${inspectionTemplates.ruleSetStatus} = 'approved' and ${inspectionTemplates.reviewStatus} = 'approved')::int`,
      pendingReview: sql<number>`count(*) filter (where ${inspectionTemplates.reviewStatus} = 'in_review')::int`,
      draftOrChanges: sql<number>`count(*) filter (where ${inspectionTemplates.status} = 'draft' or ${inspectionTemplates.reviewStatus} = 'changes_requested')::int`,
    }).from(inspectionTemplates),
    db.select({
      activeAssignments: count(),
      assignedVehicles: sql<number>`count(distinct ${vehicleInspectionAssignments.vehicleId})::int`,
    }).from(vehicleInspectionAssignments)
      .innerJoin(inspectionTemplates, eq(vehicleInspectionAssignments.templateId, inspectionTemplates.id))
      .innerJoin(vehicles, eq(vehicleInspectionAssignments.vehicleId, vehicles.id))
      .where(and(
        eq(vehicles.lifecycleStatus, "active"),
        eq(inspectionTemplates.status, "published"),
        eq(inspectionTemplates.ruleSetStatus, "approved"),
        eq(inspectionTemplates.reviewStatus, "approved"),
        lte(vehicleInspectionAssignments.effectiveFrom, today),
        or(isNull(vehicleInspectionAssignments.effectiveUntil), sql`${vehicleInspectionAssignments.effectiveUntil} >= ${today}`),
      )),
    db.select({ role: users.role, count: count() }).from(users).where(eq(users.active, true)).groupBy(users.role),
    getRuntimeIntegrationModes(),
  ]);
  const roles = Object.fromEntries(roleRows.map((row) => [row.role, row.count])) as Partial<Record<typeof users.$inferSelect.role, number>>;
  const activeVehicles = vehicleSummary?.active ?? 0;
  const assignedVehicles = assignmentSummary?.assignedVehicles ?? 0;
  return {
    vehicles: { total: vehicleSummary?.total ?? 0, active: activeVehicles, activeQr: vehicleSummary?.activeQr ?? 0, assigned: assignedVehicles, unassigned: Math.max(0, activeVehicles - assignedVehicles) },
    forms: { assignable: templateSummary?.assignable ?? 0, pendingReview: templateSummary?.pendingReview ?? 0, draftOrChanges: templateSummary?.draftOrChanges ?? 0, activeAssignments: assignmentSummary?.activeAssignments ?? 0 },
    roles: { drivers: roles.driver ?? 0, supervisors: roles.supervisor ?? 0, fleetManagers: roles.fleet_manager ?? 0, maintenanceTechnicians: roles.maintenance_technician ?? 0, administrators: roles.administrator ?? 0 },
    integrations,
  };
}

export async function resetUserIdentityBinding(userId: string, rawInput: unknown) {
  const actor = await requirePermission("users:manage");
  const input = parseOrThrow(resetIdentityBindingSchema, rawInput);
  if (actor.id === userId) throw new AdministrationError("You cannot reset your own active identity binding.", 409);
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new AdministrationError("User not found.", 404);
  assertUserRoleAuthority(actor, target.role);
  const [updated] = await db
    .update(users)
    .set({ oidcIssuer: null, oidcSubject: null, identityBoundAt: null, recordVersion: sql`${users.recordVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (!updated) throw new AdministrationError("User not found.", 404);
  await db.insert(auditEvents).values({ actorUserId: actor.id, eventType: "user.identity_binding_reset", entityType: "user", entityId: userId, metadata: { reason: input.reason } });
  return { id: userId, identityBound: false };
}

export async function getAdministrationReferences() {
  await requirePermission("forms:assign");
  const [classes, templates] = await Promise.all([
    db
      .select({ id: vehicleClasses.id, code: vehicleClasses.code, name: vehicleClasses.name, active: vehicleClasses.active })
      .from(vehicleClasses)
      .orderBy(asc(vehicleClasses.code)),
    db
      .select({
        id: inspectionTemplates.id,
        code: inspectionTemplates.code,
        name: inspectionTemplates.name,
        version: inspectionTemplates.version,
        ruleSetStatus: inspectionTemplates.ruleSetStatus,
      })
      .from(inspectionTemplates)
      .where(and(eq(inspectionTemplates.status, "published"), eq(inspectionTemplates.ruleSetStatus, "approved"), eq(inspectionTemplates.reviewStatus, "approved")))
      .orderBy(asc(inspectionTemplates.name)),
  ]);
  return { classes, templates };
}

export async function listAdministrationAssignments() {
  await requirePermission("forms:assign");
  return db
    .select({
      id: vehicleInspectionAssignments.id,
      vehicleId: vehicleInspectionAssignments.vehicleId,
      templateId: vehicleInspectionAssignments.templateId,
      templateName: inspectionTemplates.name,
      templateVersion: inspectionTemplates.version,
      frequency: vehicleInspectionAssignments.frequency,
      autoLaunch: vehicleInspectionAssignments.autoLaunch,
      effectiveFrom: vehicleInspectionAssignments.effectiveFrom,
      effectiveUntil: vehicleInspectionAssignments.effectiveUntil,
    })
    .from(vehicleInspectionAssignments)
    .innerJoin(
      inspectionTemplates,
      eq(vehicleInspectionAssignments.templateId, inspectionTemplates.id),
    )
    .where(isNull(vehicleInspectionAssignments.effectiveUntil))
    .orderBy(asc(inspectionTemplates.name));
}

export async function listAdministrationTemplates() {
  await requireFormGovernanceAccess();
  return db
    .select({
      id: inspectionTemplates.id,
      code: inspectionTemplates.code,
      name: inspectionTemplates.name,
      version: inspectionTemplates.version,
      status: inspectionTemplates.status,
      ruleSetStatus: inspectionTemplates.ruleSetStatus,
      reviewStatus: inspectionTemplates.reviewStatus,
      itemCount: sql<number>`count(${inspectionItems.id})::int`,
    })
    .from(inspectionTemplates)
    .leftJoin(inspectionItems, eq(inspectionTemplates.id, inspectionItems.templateId))
    .groupBy(inspectionTemplates.id)
    .orderBy(asc(inspectionTemplates.name));
}

export async function createInspectionTemplate(rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const input = parseOrThrow(createTemplateInputSchema, rawInput);
  try {
    return await db.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: inspectionTemplates.id })
        .from(inspectionTemplates)
        .where(eq(inspectionTemplates.code, input.code))
        .limit(1);
      if (existing) {
        throw new AdministrationError("That form code already identifies an existing form family.", 409);
      }
      const [template] = await transaction
        .insert(inspectionTemplates)
        .values({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          version: 1,
          status: "draft",
          ruleSetStatus: "draft",
        })
        .returning({ id: inspectionTemplates.id, code: inspectionTemplates.code, version: inspectionTemplates.version });
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "inspection_template.created",
        entityType: "inspection_template",
        entityId: template!.id,
        metadata: { code: template!.code, version: template!.version },
      });
      return template!;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdministrationError("That form code already identifies an existing form family.", 409);
    }
    throw error;
  }
}

export async function getAdministrationTemplate(id: string) {
  const actor = await requireFormGovernanceAccess();
  const [template] = await db
    .select()
    .from(inspectionTemplates)
    .where(eq(inspectionTemplates.id, id))
    .limit(1);
  if (!template) return null;
  const [sections, items, rules, versions, reviews] = await Promise.all([
    db
      .select()
      .from(inspectionSections)
      .where(eq(inspectionSections.templateId, id))
      .orderBy(asc(inspectionSections.sortOrder)),
    db
      .select()
      .from(inspectionItems)
      .where(eq(inspectionItems.templateId, id))
      .orderBy(asc(inspectionItems.sortOrder)),
    db
      .select({
        id: inspectionItemRules.id,
        inspectionItemId: inspectionItemRules.inspectionItemId,
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
      })
      .from(inspectionItemRules)
      .innerJoin(inspectionItems, eq(inspectionItemRules.inspectionItemId, inspectionItems.id))
      .where(eq(inspectionItems.templateId, id))
      .orderBy(asc(inspectionItemRules.priority)),
    db
      .select({ id: inspectionTemplates.id, version: inspectionTemplates.version, status: inspectionTemplates.status })
      .from(inspectionTemplates)
      .where(eq(inspectionTemplates.code, template.code))
      .orderBy(asc(inspectionTemplates.version)),
    db
      .select({
        id: inspectionTemplateReviews.id,
        reviewRound: inspectionTemplateReviews.reviewRound,
        reviewLane: inspectionTemplateReviews.reviewLane,
        decision: inspectionTemplateReviews.decision,
        comment: inspectionTemplateReviews.comment,
        reviewerUserId: inspectionTemplateReviews.reviewerUserId,
        reviewerName: users.displayName,
        reviewerRole: users.role,
        createdAt: inspectionTemplateReviews.createdAt,
      })
      .from(inspectionTemplateReviews)
      .innerJoin(users, eq(inspectionTemplateReviews.reviewerUserId, users.id))
      .where(eq(inspectionTemplateReviews.templateId, id))
      .orderBy(desc(inspectionTemplateReviews.createdAt)),
  ]);
  return { template, sections, items, rules, versions, reviews, actor: { id: actor.id, role: actor.role } };
}

async function getValidatedDefinitionSnapshot(templateId: string) {
  const [template] = await db.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, templateId)).limit(1);
  if (!template) throw new AdministrationError("Inspection template not found.", 404);
  const [sections, items, rules] = await Promise.all([
    db.select().from(inspectionSections).where(eq(inspectionSections.templateId, templateId)).orderBy(asc(inspectionSections.sortOrder)),
    db.select().from(inspectionItems).where(eq(inspectionItems.templateId, templateId)).orderBy(asc(inspectionItems.sortOrder)),
    db
      .select()
      .from(inspectionItemRules)
      .innerJoin(inspectionItems, eq(inspectionItemRules.inspectionItemId, inspectionItems.id))
      .where(eq(inspectionItems.templateId, templateId))
      .orderBy(asc(inspectionItemRules.priority)),
  ]);
  const candidate = {
    recordVersion: template.recordVersion,
    name: template.name,
    description: template.description,
    sections: sections.map((section) => ({
      sectionKey: section.sectionKey,
      title: section.title,
      description: section.description,
      items: items.filter((item) => item.sectionId === section.id).map((item) => ({
        itemKey: item.itemKey,
        label: item.label,
        helpText: item.helpText,
        fieldType: item.fieldType,
        required: item.required,
        options: item.options ?? [],
        visibilityCondition: item.visibilityCondition ?? null,
        rules: rules.filter((row) => row.inspection_item_rules.inspectionItemId === item.id).map((row) => ({
          whenResponse: row.inspection_item_rules.whenResponse,
          severity: row.inspection_item_rules.severity,
          disposition: row.inspection_item_rules.disposition,
          blockDeparture: row.inspection_item_rules.blockDeparture,
          requireComment: row.inspection_item_rules.requireComment,
          requirePhoto: row.inspection_item_rules.requirePhoto,
          createDefect: row.inspection_item_rules.createDefect,
          notifyDriver: row.inspection_item_rules.notifyDriver,
          notifySupervisor: row.inspection_item_rules.notifySupervisor,
          notifyMaintenance: row.inspection_item_rules.notifyMaintenance,
          driverMessage: row.inspection_item_rules.driverMessage,
        })),
      })),
    })),
  };
  const parsed = publishableTemplateDefinitionSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AdministrationError("The draft definition is not ready for review.", 409, parsed.error.flatten());
  }
  const missingDefectRules = parsed.data.sections.flatMap((section) =>
    section.items
      .filter((item) => item.fieldType === "pass_defect_na" && !item.rules.some((rule) => rule.whenResponse === "defect"))
      .map((item) => item.label),
  );
  if (missingDefectRules.length) {
    throw new AdministrationError(
      "Every Pass/Defect/N/A field requires an explicit defect rule before review.",
      409,
      { fields: missingDefectRules.slice(0, 25) },
    );
  }
  const hashPayload = {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    sections: parsed.data.sections,
  };
  return {
    template,
    definition: parsed.data,
    hash: crypto.createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex"),
  };
}

export async function deleteDraftInspectionTemplate(templateId: string, rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const input = parseOrThrow(deleteDraftTemplateInputSchema, rawInput);
  return db.transaction(async (transaction) => {
    const [template] = await transaction
      .select({
        id: inspectionTemplates.id,
        code: inspectionTemplates.code,
        name: inspectionTemplates.name,
        version: inspectionTemplates.version,
        status: inspectionTemplates.status,
        reviewStatus: inspectionTemplates.reviewStatus,
        recordVersion: inspectionTemplates.recordVersion,
      })
      .from(inspectionTemplates)
      .where(eq(inspectionTemplates.id, templateId))
      .for("update")
      .limit(1);
    if (!template) throw new AdministrationError("Inspection template not found.", 404);
    if (template.status !== "draft") {
      throw new AdministrationError("Published and retired form versions cannot be deleted. Retire a published version instead.", 409);
    }
    if (template.reviewStatus === "in_review" || template.reviewStatus === "approved") {
      throw new AdministrationError("A draft under review or approved for publication cannot be deleted.", 409);
    }
    if (template.recordVersion !== input.recordVersion) {
      throw new AdministrationError("This draft changed in another session. Refresh before deleting it.", 409);
    }
    if (input.confirmationCode !== template.code) {
      throw new AdministrationError(`Type ${template.code} exactly to confirm deletion.`, 400);
    }
    const [[assignment], [submission]] = await Promise.all([
      transaction.select({ count: count() }).from(vehicleInspectionAssignments).where(eq(vehicleInspectionAssignments.templateId, templateId)),
      transaction.select({ count: count() }).from(inspectionSubmissions).where(eq(inspectionSubmissions.templateId, templateId)),
    ]);
    if ((assignment?.count ?? 0) > 0 || (submission?.count ?? 0) > 0) {
      throw new AdministrationError("A form version with assignments or inspections cannot be deleted.", 409);
    }
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "inspection_template.draft_deleted",
      entityType: "inspection_template",
      entityId: templateId,
      metadata: { code: template.code, name: template.name, version: template.version, reason: input.reason },
    });
    await transaction.delete(inspectionTemplates).where(eq(inspectionTemplates.id, templateId));
    return { id: templateId, deleted: true };
  });
}

function reviewLaneForRole(role: typeof users.$inferSelect.role): "operations" | "governance" | null {
  if (role === "supervisor" || role === "fleet_manager") return "operations";
  if (role === "administrator") return "governance";
  return null;
}

export async function createDraftTemplateVersion(sourceTemplateId: string, rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  parseOrThrow(createTemplateVersionInputSchema, rawInput);
  try {
    return await db.transaction(async (transaction) => {
      const [source] = await transaction
        .select()
        .from(inspectionTemplates)
        .where(eq(inspectionTemplates.id, sourceTemplateId))
        .for("update")
        .limit(1);
      if (!source) throw new AdministrationError("Inspection template not found.", 404);
      if (source.status !== "published") {
        throw new AdministrationError("Only a published version can be used as the source of a new draft.", 409);
      }
      const [existingDraft] = await transaction
        .select({ id: inspectionTemplates.id, version: inspectionTemplates.version })
        .from(inspectionTemplates)
        .where(and(eq(inspectionTemplates.code, source.code), eq(inspectionTemplates.status, "draft")))
        .limit(1);
      if (existingDraft) {
        throw new AdministrationError(
          `Draft version ${existingDraft.version} already exists for this form.`,
          409,
        );
      }
      const [latest] = await transaction
        .select({ version: max(inspectionTemplates.version) })
        .from(inspectionTemplates)
        .where(eq(inspectionTemplates.code, source.code));
      const nextVersion = (latest?.version ?? source.version) + 1;
      const [draft] = await transaction
        .insert(inspectionTemplates)
        .values({
          code: source.code,
          name: source.name,
          description: source.description,
          version: nextVersion,
          status: "draft",
          ruleSetStatus: "draft",
        })
        .returning({ id: inspectionTemplates.id, version: inspectionTemplates.version });

      const sourceSections = await transaction
        .select()
        .from(inspectionSections)
        .where(eq(inspectionSections.templateId, sourceTemplateId))
        .orderBy(asc(inspectionSections.sortOrder));
      const sectionIds = new Map<string, string>();
      for (const section of sourceSections) {
        const [copy] = await transaction
          .insert(inspectionSections)
          .values({
            templateId: draft!.id,
            sectionKey: section.sectionKey,
            title: section.title,
            description: section.description,
            sortOrder: section.sortOrder,
          })
          .returning({ id: inspectionSections.id });
        sectionIds.set(section.id, copy!.id);
      }

      const sourceItems = await transaction
        .select()
        .from(inspectionItems)
        .where(eq(inspectionItems.templateId, sourceTemplateId))
        .orderBy(asc(inspectionItems.sortOrder));
      const itemIds = new Map<string, string>();
      for (const item of sourceItems) {
        const sectionId = sectionIds.get(item.sectionId);
        if (!sectionId) throw new AdministrationError("The source form contains an invalid section reference.", 500);
        const [copy] = await transaction
          .insert(inspectionItems)
          .values({
            templateId: draft!.id,
            sectionId,
            itemKey: item.itemKey,
            label: item.label,
            helpText: item.helpText,
            fieldType: item.fieldType,
            required: item.required,
            sortOrder: item.sortOrder,
            options: item.options,
            visibilityCondition: item.visibilityCondition,
          })
          .returning({ id: inspectionItems.id });
        itemIds.set(item.id, copy!.id);
      }

      const sourceRules = sourceItems.length
        ? await transaction
            .select()
            .from(inspectionItemRules)
            .where(inArray(inspectionItemRules.inspectionItemId, sourceItems.map((item) => item.id)))
            .orderBy(asc(inspectionItemRules.priority))
        : [];
      for (const rule of sourceRules) {
        const inspectionItemId = itemIds.get(rule.inspectionItemId);
        if (!inspectionItemId) throw new AdministrationError("The source form contains an invalid rule reference.", 500);
        await transaction.insert(inspectionItemRules).values({
          inspectionItemId,
          whenResponse: rule.whenResponse,
          severity: rule.severity,
          disposition: rule.disposition,
          blockDeparture: rule.blockDeparture,
          requireComment: rule.requireComment,
          requirePhoto: rule.requirePhoto,
          createDefect: rule.createDefect,
          notifyDriver: rule.notifyDriver,
          notifySupervisor: rule.notifySupervisor,
          notifyMaintenance: rule.notifyMaintenance,
          driverMessage: rule.driverMessage,
          priority: rule.priority,
        });
      }
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "inspection_template.draft_version_created",
        entityType: "inspection_template",
        entityId: draft!.id,
        metadata: { sourceTemplateId, sourceVersion: source.version, version: nextVersion },
      });
      return { id: draft!.id, version: draft!.version };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdministrationError("A newer form version was created in another session. Refresh and try again.", 409);
    }
    throw error;
  }
}

export async function saveDraftTemplateDefinition(templateId: string, rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const input = parseOrThrow(draftTemplateDefinitionSchema, rawInput);
  return db.transaction(async (transaction) => {
    const [template] = await transaction
      .select({
        id: inspectionTemplates.id,
        status: inspectionTemplates.status,
        recordVersion: inspectionTemplates.recordVersion,
        reviewStatus: inspectionTemplates.reviewStatus,
      })
      .from(inspectionTemplates)
      .where(eq(inspectionTemplates.id, templateId))
      .for("update")
      .limit(1);
    if (!template) throw new AdministrationError("Inspection template not found.", 404);
    if (template.status !== "draft") {
      throw new AdministrationError("Published and retired form versions are immutable. Create or open a draft version to make changes.", 409);
    }
    if (template.reviewStatus === "in_review" || template.reviewStatus === "approved") {
      throw new AdministrationError("This draft is locked for review. A reviewer must request changes before editing can resume.", 409);
    }
    if (template.recordVersion !== input.recordVersion) {
      throw new AdministrationError("This draft changed in another session. Refresh before making additional changes.", 409);
    }
    const [[assignment], [submission]] = await Promise.all([
      transaction
        .select({ count: count() })
        .from(vehicleInspectionAssignments)
        .where(eq(vehicleInspectionAssignments.templateId, templateId)),
      transaction
        .select({ count: count() })
        .from(inspectionSubmissions)
        .where(eq(inspectionSubmissions.templateId, templateId)),
    ]);
    if ((assignment?.count ?? 0) > 0 || (submission?.count ?? 0) > 0) {
      throw new AdministrationError("A form version with assignments or inspections cannot be structurally edited.", 409);
    }

    await transaction.delete(inspectionSections).where(eq(inspectionSections.templateId, templateId));
    let fieldCount = 0;
    let ruleCount = 0;
    for (const [sectionIndex, section] of input.sections.entries()) {
      const [createdSection] = await transaction
        .insert(inspectionSections)
        .values({
          templateId,
          sectionKey: section.sectionKey,
          title: section.title,
          description: section.description ?? null,
          sortOrder: sectionIndex,
        })
        .returning({ id: inspectionSections.id });
      for (const [itemIndex, item] of section.items.entries()) {
        const [createdItem] = await transaction
          .insert(inspectionItems)
          .values({
            templateId,
            sectionId: createdSection!.id,
            itemKey: item.itemKey,
            label: item.label,
            helpText: item.helpText ?? null,
            fieldType: item.fieldType,
            required: item.required,
            sortOrder: itemIndex,
            options: item.fieldType === "select" || item.fieldType === "fuel_level" ? item.options : null,
            visibilityCondition: item.visibilityCondition,
          })
          .returning({ id: inspectionItems.id });
        fieldCount += 1;
        for (const [ruleIndex, rule] of item.rules.entries()) {
          await transaction.insert(inspectionItemRules).values({
            inspectionItemId: createdItem!.id,
            whenResponse: rule.whenResponse,
            severity: rule.severity,
            disposition: rule.disposition,
            blockDeparture: rule.blockDeparture,
            requireComment: rule.requireComment,
            requirePhoto: rule.requirePhoto,
            createDefect: rule.createDefect,
            notifyDriver: rule.notifyDriver,
            notifySupervisor: rule.notifySupervisor,
            notifyMaintenance: rule.notifyMaintenance,
            driverMessage: rule.driverMessage ?? null,
            priority: ruleIndex,
          });
          ruleCount += 1;
        }
      }
    }
    const nextRecordVersion = input.recordVersion + 1;
    await transaction
      .update(inspectionTemplates)
      .set({
        name: input.name,
        description: input.description ?? null,
        ruleSetStatus: "draft",
        reviewStatus: "draft",
        reviewRequestedAt: null,
        reviewRequestedByUserId: null,
        reviewDefinitionHash: null,
        rulesApprovedAt: null,
        rulesApprovedByUserId: null,
        recordVersion: nextRecordVersion,
        updatedAt: new Date(),
      })
      .where(eq(inspectionTemplates.id, templateId));
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "inspection_template.draft_definition_saved",
      entityType: "inspection_template",
      entityId: templateId,
      metadata: {
        recordVersion: nextRecordVersion,
        sections: input.sections.length,
        fields: fieldCount,
        rules: ruleCount,
      },
    });
    return { id: templateId, recordVersion: nextRecordVersion, fieldCount, ruleCount };
  });
}

export async function transitionTemplateWorkflow(templateId: string, rawInput: unknown) {
  const input = parseOrThrow(templateWorkflowInputSchema, rawInput);

  if (input.action === "request_review") {
    const actor = await requirePermission("configuration:manage");
    return db.transaction(async (transaction) => {
      const [template] = await transaction.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, templateId)).for("update").limit(1);
      if (!template) throw new AdministrationError("Inspection template not found.", 404);
      if (template.status !== "draft") throw new AdministrationError("Only a draft version can be submitted for review.", 409);
      if (!(["draft", "changes_requested"] as const).includes(template.reviewStatus as "draft" | "changes_requested")) {
        throw new AdministrationError("This draft is already in review or approved for publication.", 409);
      }
      const snapshot = await getValidatedDefinitionSnapshot(templateId);
      if (snapshot.template.recordVersion !== template.recordVersion) {
        throw new AdministrationError("The draft changed while review was being prepared. Refresh and try again.", 409);
      }
      const reviewRound = template.reviewRound + 1;
      await transaction
        .update(inspectionTemplates)
        .set({
          reviewStatus: "in_review",
          reviewRound,
          reviewRequestedAt: new Date(),
          reviewRequestedByUserId: actor.id,
          reviewDefinitionHash: snapshot.hash,
          recordVersion: template.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(inspectionTemplates.id, templateId));
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "inspection_template.review_requested",
        entityType: "inspection_template",
        entityId: templateId,
        metadata: { reviewRound, definitionHash: snapshot.hash },
      });
      return { id: templateId, reviewStatus: "in_review" as const, reviewRound };
    });
  }

  if (input.action === "review") {
    const actor = await requirePermission("inspection:review");
    const reviewLane = reviewLaneForRole(actor.role);
    if (!reviewLane) throw new AdministrationError("Your role is not eligible for form-definition approval.", 403);
    return db.transaction(async (transaction) => {
      const [template] = await transaction.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, templateId)).for("update").limit(1);
      if (!template) throw new AdministrationError("Inspection template not found.", 404);
      if (template.status !== "draft" || template.reviewStatus !== "in_review" || !template.reviewDefinitionHash) {
        throw new AdministrationError("This form is not awaiting review.", 409);
      }
      if (template.reviewRequestedByUserId === actor.id) {
        throw new AdministrationError("The person who requested review cannot approve or reject the same review round.", 409);
      }
      const snapshot = await getValidatedDefinitionSnapshot(templateId);
      if (snapshot.hash !== template.reviewDefinitionHash) {
        throw new AdministrationError("The form definition changed after review was requested. Start a new review round.", 409);
      }
      const [existingLaneDecision] = await transaction
        .select({ id: inspectionTemplateReviews.id })
        .from(inspectionTemplateReviews)
        .where(and(
          eq(inspectionTemplateReviews.templateId, templateId),
          eq(inspectionTemplateReviews.reviewRound, template.reviewRound),
          eq(inspectionTemplateReviews.reviewLane, reviewLane),
        ))
        .limit(1);
      if (existingLaneDecision) throw new AdministrationError(`The ${reviewLane} review lane already recorded a decision for this round.`, 409);

      const decision = input.decision === "approve" ? "approved" : "changes_requested";
      await transaction.insert(inspectionTemplateReviews).values({
        templateId,
        reviewRound: template.reviewRound,
        definitionHash: template.reviewDefinitionHash,
        reviewLane,
        decision,
        reviewerUserId: actor.id,
        comment: input.comment?.trim() || null,
      });
      let reviewStatus: "in_review" | "changes_requested" | "approved" = "in_review";
      if (decision === "changes_requested") {
        reviewStatus = "changes_requested";
      } else {
        const approved = await transaction
          .select({ lane: inspectionTemplateReviews.reviewLane })
          .from(inspectionTemplateReviews)
          .where(and(
            eq(inspectionTemplateReviews.templateId, templateId),
            eq(inspectionTemplateReviews.reviewRound, template.reviewRound),
            eq(inspectionTemplateReviews.definitionHash, template.reviewDefinitionHash),
            eq(inspectionTemplateReviews.decision, "approved"),
          ));
        if (new Set(approved.map((row) => row.lane)).size === 2) reviewStatus = "approved";
      }
      await transaction
        .update(inspectionTemplates)
        .set({ reviewStatus, recordVersion: template.recordVersion + 1, updatedAt: new Date() })
        .where(eq(inspectionTemplates.id, templateId));
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: decision === "approved" ? "inspection_template.review_approved" : "inspection_template.changes_requested",
        entityType: "inspection_template",
        entityId: templateId,
        metadata: { reviewRound: template.reviewRound, reviewLane, decision, reviewStatus },
      });
      return { id: templateId, reviewStatus, reviewLane, decision };
    });
  }

  if (input.action === "publish") {
    const actor = await requirePermission("configuration:manage");
    if (actor.role !== "administrator") throw new AdministrationError("Only an administrator can publish an approved form version.", 403);
    return db.transaction(async (transaction) => {
      const [template] = await transaction.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, templateId)).for("update").limit(1);
      if (!template) throw new AdministrationError("Inspection template not found.", 404);
      if (template.status !== "draft" || template.reviewStatus !== "approved" || !template.reviewDefinitionHash) {
        throw new AdministrationError("The draft requires both current approvals before publication.", 409);
      }
      const snapshot = await getValidatedDefinitionSnapshot(templateId);
      if (snapshot.hash !== template.reviewDefinitionHash) throw new AdministrationError("The approved definition hash no longer matches the draft.", 409);
      const approvals = await transaction
        .select({ lane: inspectionTemplateReviews.reviewLane })
        .from(inspectionTemplateReviews)
        .where(and(
          eq(inspectionTemplateReviews.templateId, templateId),
          eq(inspectionTemplateReviews.reviewRound, template.reviewRound),
          eq(inspectionTemplateReviews.definitionHash, template.reviewDefinitionHash),
          eq(inspectionTemplateReviews.decision, "approved"),
        ));
      if (new Set(approvals.map((row) => row.lane)).size !== 2) {
        throw new AdministrationError("Both operations and governance approvals are required for publication.", 409);
      }
      const now = new Date();
      await transaction
        .update(inspectionTemplates)
        .set({
          status: "published",
          publishedAt: now,
          publishedByUserId: actor.id,
          effectiveFrom: now.toISOString().slice(0, 10),
          ruleSetStatus: "approved",
          rulesApprovedAt: now,
          rulesApprovedByUserId: actor.id,
          recordVersion: template.recordVersion + 1,
          updatedAt: now,
        })
        .where(eq(inspectionTemplates.id, templateId));
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "inspection_template.published",
        entityType: "inspection_template",
        entityId: templateId,
        metadata: { reviewRound: template.reviewRound, definitionHash: template.reviewDefinitionHash },
      });
      return { id: templateId, status: "published" as const };
    });
  }

  const actor = await requirePermission("configuration:manage");
  if (actor.role !== "administrator") throw new AdministrationError("Only an administrator can retire a published form version.", 403);
  return db.transaction(async (transaction) => {
    const [template] = await transaction.select().from(inspectionTemplates).where(eq(inspectionTemplates.id, templateId)).for("update").limit(1);
    if (!template) throw new AdministrationError("Inspection template not found.", 404);
    if (template.status !== "published") throw new AdministrationError("Only a published form version can be retired.", 409);
    const [activeAssignment] = await transaction
      .select({ count: count() })
      .from(vehicleInspectionAssignments)
      .where(and(eq(vehicleInspectionAssignments.templateId, templateId), isNull(vehicleInspectionAssignments.effectiveUntil)));
    if ((activeAssignment?.count ?? 0) > 0) {
      throw new AdministrationError("End or migrate every active vehicle assignment before retiring this form version.", 409);
    }
    const now = new Date();
    await transaction
      .update(inspectionTemplates)
      .set({ status: "retired", retiredAt: now, retiredByUserId: actor.id, recordVersion: template.recordVersion + 1, updatedAt: now })
      .where(eq(inspectionTemplates.id, templateId));
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "inspection_template.retired",
      entityType: "inspection_template",
      entityId: templateId,
      metadata: { reason: input.reason },
    });
    return { id: templateId, status: "retired" as const };
  });
}

export async function createVehicle(rawInput: unknown) {
  const actor = await requirePermission("fleet:write");
  const input = parseOrThrow(vehicleInputSchema, rawInput);
  try {
    return await db.transaction(async (transaction) => {
      const [vehicleClass] = await transaction.select({ id: vehicleClasses.id }).from(vehicleClasses).where(and(eq(vehicleClasses.id, input.vehicleClassId), eq(vehicleClasses.active, true))).limit(1);
      if (!vehicleClass) throw new AdministrationError("Select an active vehicle class.", 409);
      const [vehicle] = await transaction
        .insert(vehicles)
        .values({
          ...input,
          displayCode: input.displayCode ?? null,
          vin: input.vin ?? null,
          licensePlate: input.licensePlate ?? null,
          licenseState: input.licenseState ?? null,
          make: input.make ?? null,
          model: input.model ?? null,
          assetTag: input.assetTag ?? null,
          acquisitionDate: input.acquisitionDate ?? null,
          purchaseCostCents: input.purchaseCostCents ?? null,
          inServiceDate: input.inServiceDate ?? null,
          fuelType: input.fuelType ?? null,
          ownershipType: input.ownershipType ?? null,
          primaryLocation: input.primaryLocation ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: vehicles.id, unitNumber: vehicles.unitNumber });
      const [qr] = await transaction
        .insert(vehicleQrCodes)
        .values({ vehicleId: vehicle!.id, issuedByUserId: actor.id })
        .returning({ publicId: vehicleQrCodes.publicId });
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "vehicle.created",
        entityType: "vehicle",
        entityId: vehicle!.id,
        metadata: { unitNumber: vehicle!.unitNumber, qrIssued: true },
      });
      return { id: vehicle!.id, qrPublicId: qr!.publicId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdministrationError("Unit number, display code, asset tag, or VIN is already in use.", 409);
    }
    throw error;
  }
}

export async function importVehicles(rawInput: unknown) {
  const actor = await requirePermission("fleet:write");
  const input = parseOrThrow(vehicleImportSchema, rawInput);
  try {
    return await db.transaction(async (transaction) => {
      const classIds = [...new Set(input.vehicles.map((vehicle) => vehicle.vehicleClassId))];
      const activeClasses = await transaction.select({ id: vehicleClasses.id }).from(vehicleClasses).where(and(eq(vehicleClasses.active, true), inArray(vehicleClasses.id, classIds)));
      if (activeClasses.length !== classIds.length) throw new AdministrationError("Every imported vehicle must use an active vehicle class.", 409);
      const created: Array<{ id: string; unitNumber: string }> = [];
      for (const vehicleInput of input.vehicles) {
        const [vehicle] = await transaction.insert(vehicles).values({
          ...vehicleInput,
          displayCode: vehicleInput.displayCode ?? null,
          vin: vehicleInput.vin ?? null,
          licensePlate: vehicleInput.licensePlate ?? null,
          licenseState: vehicleInput.licenseState ?? null,
          make: vehicleInput.make ?? null,
          model: vehicleInput.model ?? null,
          assetTag: vehicleInput.assetTag ?? null,
          acquisitionDate: vehicleInput.acquisitionDate ?? null,
          purchaseCostCents: vehicleInput.purchaseCostCents ?? null,
          inServiceDate: vehicleInput.inServiceDate ?? null,
          fuelType: vehicleInput.fuelType ?? null,
          ownershipType: vehicleInput.ownershipType ?? null,
          primaryLocation: vehicleInput.primaryLocation ?? null,
          notes: vehicleInput.notes ?? null,
        }).returning({ id: vehicles.id, unitNumber: vehicles.unitNumber });
        await transaction.insert(vehicleQrCodes).values({ vehicleId: vehicle!.id, issuedByUserId: actor.id });
        created.push(vehicle!);
        await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "vehicle.created", entityType: "vehicle", entityId: vehicle!.id, metadata: { unitNumber: vehicle!.unitNumber, qrIssued: true, source: "csv_import" } });
      }
      await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "vehicle.import_completed", entityType: "vehicle_import", metadata: { count: created.length } });
      return { imported: created.length, vehicles: created };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdministrationError("The import contains a unit number, display code, asset tag, or VIN that is already in use.", 409);
    if (isForeignKeyViolation(error)) throw new AdministrationError("The import references an unavailable vehicle class.", 409);
    throw error;
  }
}

export async function updateVehicle(id: string, rawInput: unknown) {
  const actor = await requirePermission("fleet:write");
  const input = parseOrThrow(vehicleUpdateSchema, rawInput);
  const nextOdometer = input.currentOdometer ?? null;
  try {
    const [[current], [selectedClass]] = await Promise.all([
      db.select({ vehicleClassId: vehicles.vehicleClassId }).from(vehicles).where(eq(vehicles.id, id)).limit(1),
      db.select({ active: vehicleClasses.active }).from(vehicleClasses).where(eq(vehicleClasses.id, input.vehicleClassId)).limit(1),
    ]);
    if (!current) throw new AdministrationError("Vehicle not found.", 404);
    if (!selectedClass || (!selectedClass.active && current.vehicleClassId !== input.vehicleClassId)) throw new AdministrationError("Select an active vehicle class.", 409);
    const [updated] = await db
      .update(vehicles)
      .set({
        unitNumber: input.unitNumber,
        displayCode: input.displayCode ?? null,
        vehicleClassId: input.vehicleClassId,
        vin: input.vin ?? null,
        licensePlate: input.licensePlate ?? null,
        licenseState: input.licenseState ?? null,
        year: input.year,
        make: input.make ?? null,
        model: input.model ?? null,
        currentOdometer: nextOdometer,
        assetTag: input.assetTag ?? null,
        acquisitionDate: input.acquisitionDate ?? null,
        purchaseCostCents: input.purchaseCostCents ?? null,
        inServiceDate: input.inServiceDate ?? null,
        fuelType: input.fuelType ?? null,
        ownershipType: input.ownershipType ?? null,
        primaryLocation: input.primaryLocation ?? null,
        notes: input.notes ?? null,
        lifecycleStatus: input.lifecycleStatus,
        recordVersion: input.recordVersion + 1,
        updatedAt: new Date(),
      })
      .where(and(
        eq(vehicles.id, id),
        eq(vehicles.recordVersion, input.recordVersion),
        nextOdometer === null
          ? isNull(vehicles.currentOdometer)
          : or(isNull(vehicles.currentOdometer), lte(vehicles.currentOdometer, nextOdometer)),
      ))
      .returning({ id: vehicles.id });
    if (!updated) {
      const [exists] = await db.select({ id: vehicles.id, currentOdometer: vehicles.currentOdometer }).from(vehicles).where(eq(vehicles.id, id));
      if (exists && (nextOdometer === null ? exists.currentOdometer !== null : exists.currentOdometer !== null && nextOdometer < exists.currentOdometer)) {
        throw new AdministrationError(`The odometer cannot be lower than the recorded value of ${exists.currentOdometer!.toLocaleString()}.`, 422);
      }
      throw new AdministrationError(
        exists ? "This vehicle changed in another session. Refresh and try again." : "Vehicle not found.",
        exists ? 409 : 404,
      );
    }
    await db.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "vehicle.updated",
      entityType: "vehicle",
      entityId: id,
      metadata: { recordVersion: input.recordVersion + 1 },
    });
    return { id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdministrationError("Unit number, display code, asset tag, or VIN is already in use.", 409);
    }
    throw error;
  }
}

export async function rotateVehicleQr(vehicleId: string, rawInput: unknown) {
  const actor = await requirePermission("fleet:write");
  const input = parseOrThrow(rotateQrInputSchema, rawInput);
  return db.transaction(async (transaction) => {
    const [vehicle] = await transaction
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .for("update")
      .limit(1);
    if (!vehicle) throw new AdministrationError("Vehicle not found.", 404);

    const [currentQr] = await transaction
      .select({ id: vehicleQrCodes.id })
      .from(vehicleQrCodes)
      .where(and(eq(vehicleQrCodes.vehicleId, vehicleId), eq(vehicleQrCodes.status, "active")))
      .for("update")
      .limit(1);
    if (currentQr) {
      await transaction
        .update(vehicleQrCodes)
        .set({ status: "replaced", revokedAt: new Date(), revokeReason: input.reason, updatedAt: new Date() })
        .where(eq(vehicleQrCodes.id, currentQr.id));
    }
    const [replacement] = await transaction
      .insert(vehicleQrCodes)
      .values({ vehicleId, issuedByUserId: actor.id })
      .returning({ id: vehicleQrCodes.id, publicId: vehicleQrCodes.publicId });
    if (currentQr) {
      await transaction
        .update(vehicleQrCodes)
        .set({ replacedByQrCodeId: replacement!.id })
        .where(eq(vehicleQrCodes.id, currentQr.id));
    }
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "vehicle.qr_replaced",
      entityType: "vehicle",
      entityId: vehicleId,
      metadata: { reason: input.reason, previousQrExisted: Boolean(currentQr) },
    });
    return { publicId: replacement!.publicId };
  });
}

export async function assignInspectionTemplate(vehicleId: string, rawInput: unknown) {
  const actor = await requirePermission("forms:assign");
  const input = parseOrThrow(assignmentInputSchema, rawInput);
  const today = new Date().toISOString().slice(0, 10);
  const [vehicle, template, duplicate] = await Promise.all([
    db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1),
    db
      .select({ id: inspectionTemplates.id })
      .from(inspectionTemplates)
      .where(and(eq(inspectionTemplates.id, input.templateId), eq(inspectionTemplates.status, "published"), eq(inspectionTemplates.ruleSetStatus, "approved"), eq(inspectionTemplates.reviewStatus, "approved")))
      .limit(1),
    db
      .select({ id: vehicleInspectionAssignments.id })
      .from(vehicleInspectionAssignments)
      .where(
        and(
          eq(vehicleInspectionAssignments.vehicleId, vehicleId),
          eq(vehicleInspectionAssignments.templateId, input.templateId),
          sql`${vehicleInspectionAssignments.effectiveUntil} is null`,
        ),
      )
      .limit(1),
  ]);
  if (!vehicle[0]) throw new AdministrationError("Vehicle not found.", 404);
  if (!template[0]) throw new AdministrationError("Only a published form with an approved rule set can be assigned.", 409);
  if (duplicate[0]) throw new AdministrationError("This form is already active for the vehicle.", 409);

  const [assignment] = await db
    .insert(vehicleInspectionAssignments)
    .values({ vehicleId, templateId: input.templateId, frequency: input.frequency, autoLaunch: input.autoLaunch, effectiveFrom: today })
    .returning({ id: vehicleInspectionAssignments.id });
  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    eventType: "vehicle.form_assigned",
    entityType: "vehicle",
    entityId: vehicleId,
    metadata: { templateId: input.templateId, frequency: input.frequency, autoLaunch: input.autoLaunch },
  });
  return { id: assignment!.id };
}

export async function endInspectionAssignment(assignmentId: string, rawInput: unknown) {
  const actor = await requirePermission("forms:assign");
  parseOrThrow(endAssignmentInputSchema, rawInput);
  const today = new Date().toISOString().slice(0, 10);
  const [ended] = await db
    .update(vehicleInspectionAssignments)
    .set({ effectiveUntil: today, updatedAt: new Date() })
    .where(
      and(
        eq(vehicleInspectionAssignments.id, assignmentId),
        isNull(vehicleInspectionAssignments.effectiveUntil),
      ),
    )
    .returning({
      id: vehicleInspectionAssignments.id,
      vehicleId: vehicleInspectionAssignments.vehicleId,
      templateId: vehicleInspectionAssignments.templateId,
    });
  if (!ended) {
    throw new AdministrationError("The active form assignment was not found or was already ended.", 409);
  }
  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    eventType: "vehicle.form_assignment_ended",
    entityType: "vehicle_inspection_assignment",
    entityId: assignmentId,
    metadata: { vehicleId: ended.vehicleId, templateId: ended.templateId, effectiveUntil: today },
  });
  return { id: ended.id, effectiveUntil: today };
}

export async function createUser(rawInput: unknown) {
  const actor = await requirePermission("users:manage");
  const input = parseOrThrow(userInputSchema, rawInput);
  assertUserRoleAuthority(actor, input.role);
  const { authenticationMode } = await getRuntimeIntegrationModes();
  if (authenticationMode === "local" && !input.password) {
    throw new AdministrationError("A password is required while local authentication is active.", 400);
  }
  if (authenticationMode === "oidc" && input.password) {
    throw new AdministrationError("Passwords are not stored while Microsoft Entra authentication is active.", 400);
  }
  const passwordHash = input.password ? await hashLocalPassword(input.password) : null;
  try {
    const [created] = await db.insert(users).values({
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      active: input.active,
      localPasswordHash: passwordHash,
      localPasswordChangedAt: passwordHash ? new Date() : null,
    }).returning({ id: users.id });
    await db.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "user.created",
      entityType: "user",
      entityId: created!.id,
      metadata: { role: input.role, active: input.active },
    });
    return { id: created!.id };
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdministrationError("That email address is already registered.", 409);
    throw error;
  }
}

export async function updateUser(id: string, rawInput: unknown) {
  const actor = await requirePermission("users:manage");
  const input = parseOrThrow(userUpdateSchema, rawInput);
  try {
    return await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(93284117)`);
      const [target] = await transaction.select().from(users).where(eq(users.id, id)).for("update").limit(1);
      if (!target) throw new AdministrationError("User not found.", 404);
      assertUserRoleAuthority(actor, target.role);
      assertUserRoleAuthority(actor, input.role);
      if (target.id === actor.id && (!input.active || input.role !== target.role || input.email.toLowerCase() !== target.email.toLowerCase())) {
        throw new AdministrationError("You cannot deactivate, change the role, or change the email of the identity currently in use.", 409);
      }
      if (target.role === "administrator" && target.active && (!input.active || input.role !== "administrator")) {
        const [administratorCount] = await transaction
          .select({ count: count() })
          .from(users)
          .where(and(eq(users.role, "administrator"), eq(users.active, true), ne(users.id, id)));
        if ((administratorCount?.count ?? 0) === 0) throw new AdministrationError("At least one active administrator must remain.", 409);
      }
      const [updated] = await transaction
        .update(users)
        .set({ email: input.email, displayName: input.displayName, role: input.role, active: input.active, recordVersion: input.recordVersion + 1, updatedAt: new Date() })
        .where(and(eq(users.id, id), eq(users.recordVersion, input.recordVersion)))
        .returning({ id: users.id });
      if (!updated) throw new AdministrationError("This user changed in another session. Refresh and try again.", 409);
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "user.updated",
        entityType: "user",
        entityId: id,
        metadata: { role: input.role, active: input.active, recordVersion: input.recordVersion + 1 },
      });
      return { id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdministrationError("That email address is already registered.", 409);
    throw error;
  }
}

export async function resetLocalUserPassword(id: string, rawInput: unknown) {
  const actor = await getCurrentActor();
  if (actor.id !== id && !can(actor, "users:manage")) throw new AuthorizationError("users:manage");
  const input = parseOrThrow(resetLocalPasswordSchema, rawInput);
  const { authenticationMode } = await getRuntimeIntegrationModes();
  if (authenticationMode !== "local") {
    throw new AdministrationError("Local passwords cannot be changed while Microsoft Entra authentication is active.", 409);
  }
  const passwordHash = await hashLocalPassword(input.password);
  return db.transaction(async (transaction) => {
    const [target] = await transaction.select().from(users).where(eq(users.id, id)).for("update").limit(1);
    if (!target) throw new AdministrationError("User not found.", 404);
    if (actor.id === id) {
      if (!target.localPasswordHash || !input.currentPassword || !await verifyLocalPassword(input.currentPassword, target.localPasswordHash)) {
        throw new AdministrationError("The current password is incorrect.", 400);
      }
    } else {
      assertUserRoleAuthority(actor, target.role);
    }
    const [updated] = await transaction
      .update(users)
      .set({ localPasswordHash: passwordHash, localPasswordChangedAt: new Date(), recordVersion: target.recordVersion + 1, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.recordVersion, input.recordVersion)))
      .returning({ id: users.id });
    if (!updated) throw new AdministrationError("This user changed in another session. Refresh and try again.", 409);
    await transaction.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.userId, id), isNull(authSessions.revokedAt)));
    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "authentication.local_password_reset",
      entityType: "user",
      entityId: id,
      metadata: { sessionsRevoked: true, selfService: actor.id === id },
    });
    return { id };
  });
}

export async function deleteUser(id: string, rawInput: unknown) {
  const actor = await requirePermission("users:manage");
  const input = parseOrThrow(deleteUserSchema, rawInput);
  if (actor.id === id) throw new AdministrationError("You cannot delete your own administrative identity.", 409);
  try {
    return await db.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(93284117)`);
      const [target] = await transaction.select().from(users).where(eq(users.id, id)).for("update").limit(1);
      if (!target) throw new AdministrationError("User not found.", 404);
      assertUserRoleAuthority(actor, target.role);
      if (target.email.toLowerCase() !== input.confirmationEmail) {
        throw new AdministrationError("The confirmation email does not match this user.", 400);
      }
      if (target.recordVersion !== input.recordVersion) {
        throw new AdministrationError("This user changed in another session. Refresh and try again.", 409);
      }
      if (target.role === "administrator" && target.active) {
        const [administratorCount] = await transaction
          .select({ count: count() })
          .from(users)
          .where(and(eq(users.role, "administrator"), eq(users.active, true), ne(users.id, id)));
        if ((administratorCount?.count ?? 0) === 0) throw new AdministrationError("At least one active administrator must remain.", 409);
      }
      await transaction.delete(users).where(eq(users.id, id));
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        eventType: "user.deleted",
        entityType: "user",
        entityId: id,
        metadata: { email: target.email, role: target.role, reason: input.reason },
      });
      return { id, deleted: true as const };
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new AdministrationError("This user has operational history and cannot be deleted. Deactivate the account to preserve the audit record.", 409);
    }
    throw error;
  }
}
