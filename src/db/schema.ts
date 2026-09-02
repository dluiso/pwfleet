import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "driver",
  "supervisor",
  "fleet_manager",
  "maintenance_technician",
  "administrator",
  "auditor",
]);

export const vehicleLifecycleStatusEnum = pgEnum("vehicle_lifecycle_status", [
  "active",
  "inactive",
  "disposed",
]);

export const vehicleDispositionEnum = pgEnum("vehicle_disposition", [
  "inspection_required",
  "cleared",
  "cleared_with_advisory",
  "hold_for_review",
  "out_of_service",
  "maintenance_in_progress",
  "ready_for_reinspection",
]);

export const qrStatusEnum = pgEnum("qr_status", [
  "active",
  "damaged",
  "replaced",
  "revoked",
]);

export const templateStatusEnum = pgEnum("template_status", [
  "draft",
  "published",
  "retired",
]);

export const ruleSetStatusEnum = pgEnum("rule_set_status", ["draft", "approved"]);
export const templateReviewStatusEnum = pgEnum("template_review_status", [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
]);
export const templateReviewLaneEnum = pgEnum("template_review_lane", ["operations", "governance"]);
export const templateReviewDecisionEnum = pgEnum("template_review_decision", ["approved", "changes_requested"]);

export const inspectionFieldTypeEnum = pgEnum("inspection_field_type", [
  "pass_defect_na",
  "text",
  "textarea",
  "number",
  "odometer",
  "fuel_level",
  "photo",
  "attestation",
  "damage_map",
  "select",
]);

export const severityEnum = pgEnum("defect_severity", [
  "none",
  "advisory",
  "minor",
  "major",
  "critical",
]);

export const submissionStatusEnum = pgEnum("inspection_submission_status", [
  "draft",
  "submitted",
  "pending_review",
  "closed",
]);

export const defectStatusEnum = pgEnum("defect_status", [
  "reported",
  "under_review",
  "assigned",
  "repair_in_progress",
  "repair_completed",
  "verification_required",
  "closed",
]);

export const safetyCaseStatusEnum = pgEnum("safety_case_status", [
  "pending_supervisor_review",
  "acknowledged",
  "held",
  "maintenance_assigned",
  "repair_in_progress",
  "awaiting_reinspection",
  "awaiting_release",
  "released",
]);

export const safetyCaseActionEnum = pgEnum("safety_case_action", [
  "created",
  "acknowledged",
  "held",
  "maintenance_assigned",
  "repair_started",
  "repair_completed",
  "reinspection_submitted",
  "release_approved",
  "release_denied",
  "maintenance_reassigned",
  "estimate_submitted",
  "estimate_approved",
  "estimate_rejected",
  "escalated",
]);
export const safetyCasePriorityEnum = pgEnum("safety_case_priority", ["routine", "urgent", "critical"]);
export const maintenanceWorkEntryTypeEnum = pgEnum("maintenance_work_entry_type", ["labor", "part", "external_service", "note"]);
export const safetyCaseEvidenceCategoryEnum = pgEnum("safety_case_evidence_category", ["before_repair", "after_repair", "invoice", "receipt", "other"]);
export const maintenanceEstimateStatusEnum = pgEnum("maintenance_estimate_status", ["not_required", "pending", "approved", "rejected"]);
export const userNotificationKindEnum = pgEnum("user_notification_kind", ["inspection", "safety_case", "maintenance", "report", "system"]);
export const reportFrequencyEnum = pgEnum("report_frequency", ["daily", "weekly", "monthly", "annual"]);
export const reportFormatEnum = pgEnum("report_format", ["pdf", "csv"]);
export const reportDeliveryStatusEnum = pgEnum("report_delivery_status", ["pending", "captured", "sent", "failed", "dead_letter"]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "captured",
  "sent",
  "failed",
  "dead_letter",
]);

export const notificationUrgencyEnum = pgEnum("notification_urgency", [
  "normal",
  "critical",
]);

export const attachmentStatusEnum = pgEnum("attachment_status", [
  "pending",
  "linked",
  "quarantined",
  "purging",
]);

export const vehicleDocumentCategoryEnum = pgEnum("vehicle_document_category", [
  "profile_photo",
  "registration",
  "insurance",
  "title",
  "warranty",
  "service_record",
  "other",
]);

export const assignmentFrequencyEnum = pgEnum("assignment_frequency", [
  "before_first_departure",
  "end_of_shift",
  "daily",
  "per_handover",
  "on_demand",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    role: userRoleEnum("role").notNull(),
    active: boolean("active").notNull().default(true),
    oidcIssuer: varchar("oidc_issuer", { length: 500 }),
    oidcSubject: varchar("oidc_subject", { length: 500 }),
    identityBoundAt: timestamp("identity_bound_at", { withTimezone: true }),
    localPasswordHash: varchar("local_password_hash", { length: 512 }),
    localPasswordChangedAt: timestamp("local_password_changed_at", { withTimezone: true }),
    recordVersion: integer("record_version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_oidc_identity_unique")
      .on(table.oidcIssuer, table.oidcSubject)
      .where(sql`${table.oidcIssuer} is not null and ${table.oidcSubject} is not null`),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const vehicleClasses = pgTable(
  "vehicle_classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 12 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicle_classes_code_unique").on(sql`upper(${table.code})`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitNumber: varchar("unit_number", { length: 24 }).notNull(),
    displayCode: varchar("display_code", { length: 40 }),
    vehicleClassId: uuid("vehicle_class_id")
      .notNull()
      .references(() => vehicleClasses.id, { onDelete: "restrict" }),
    vin: varchar("vin", { length: 17 }),
    licensePlate: varchar("license_plate", { length: 32 }),
    licenseState: varchar("license_state", { length: 3 }),
    year: integer("year"),
    make: varchar("make", { length: 80 }),
    model: varchar("model", { length: 120 }),
    currentOdometer: integer("current_odometer"),
    assetTag: varchar("asset_tag", { length: 64 }),
    acquisitionDate: date("acquisition_date"),
    purchaseCostCents: integer("purchase_cost_cents"),
    inServiceDate: date("in_service_date"),
    fuelType: varchar("fuel_type", { length: 40 }),
    ownershipType: varchar("ownership_type", { length: 40 }),
    primaryLocation: varchar("primary_location", { length: 160 }),
    notes: text("notes"),
    lifecycleStatus: vehicleLifecycleStatusEnum("lifecycle_status")
      .notNull()
      .default("active"),
    disposition: vehicleDispositionEnum("disposition")
      .notNull()
      .default("inspection_required"),
    recordVersion: integer("record_version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicles_unit_number_unique").on(table.unitNumber),
    uniqueIndex("vehicles_display_code_unique")
      .on(table.displayCode)
      .where(sql`${table.displayCode} is not null`),
    uniqueIndex("vehicles_vin_unique")
      .on(table.vin)
      .where(sql`${table.vin} is not null`),
    uniqueIndex("vehicles_asset_tag_unique")
      .on(sql`upper(${table.assetTag})`)
      .where(sql`${table.assetTag} is not null`),
    index("vehicles_class_idx").on(table.vehicleClassId),
    index("vehicles_disposition_idx").on(table.disposition),
  ],
);

export const vehicleQrCodes = pgTable(
  "vehicle_qr_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    publicId: uuid("public_id").notNull().defaultRandom(),
    status: qrStatusEnum("status").notNull().default("active"),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    replacedByQrCodeId: uuid("replaced_by_qr_code_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicle_qr_codes_public_id_unique").on(table.publicId),
    uniqueIndex("vehicle_qr_codes_one_active_per_vehicle")
      .on(table.vehicleId)
      .where(sql`${table.status} = 'active'`),
    index("vehicle_qr_codes_vehicle_idx").on(table.vehicleId),
  ],
);

export const inspectionTemplates = pgTable(
  "inspection_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    version: integer("version").notNull(),
    status: templateStatusEnum("status").notNull().default("draft"),
    effectiveFrom: date("effective_from"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ruleSetStatus: ruleSetStatusEnum("rule_set_status").notNull().default("draft"),
    rulesApprovedAt: timestamp("rules_approved_at", { withTimezone: true }),
    rulesApprovedByUserId: uuid("rules_approved_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    recordVersion: integer("record_version").notNull().default(1),
    reviewStatus: templateReviewStatusEnum("review_status").notNull().default("draft"),
    reviewRound: integer("review_round").notNull().default(0),
    reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),
    reviewRequestedByUserId: uuid("review_requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewDefinitionHash: varchar("review_definition_hash", { length: 64 }),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: uuid("retired_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inspection_templates_code_version_unique").on(
      table.code,
      table.version,
    ),
    index("inspection_templates_status_idx").on(table.status),
  ],
);

export const inspectionSections = pgTable(
  "inspection_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => inspectionTemplates.id, { onDelete: "cascade" }),
    sectionKey: varchar("section_key", { length: 80 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inspection_sections_key_unique").on(
      table.templateId,
      table.sectionKey,
    ),
    index("inspection_sections_template_idx").on(table.templateId),
  ],
);

export const inspectionItems = pgTable(
  "inspection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => inspectionTemplates.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => inspectionSections.id, { onDelete: "cascade" }),
    itemKey: varchar("item_key", { length: 100 }).notNull(),
    label: varchar("label", { length: 240 }).notNull(),
    helpText: text("help_text"),
    fieldType: inspectionFieldTypeEnum("field_type").notNull(),
    required: boolean("required").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    options: jsonb("options").$type<string[]>(),
    visibilityCondition: jsonb("visibility_condition").$type<{
      sourceItemKey: string;
      operator: "equals" | "not_equals" | "is_truthy";
      value?: string | null;
    }>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inspection_items_key_unique").on(
      table.templateId,
      table.itemKey,
    ),
    index("inspection_items_section_idx").on(table.sectionId),
  ],
);

export const inspectionItemRules = pgTable(
  "inspection_item_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionItemId: uuid("inspection_item_id")
      .notNull()
      .references(() => inspectionItems.id, { onDelete: "cascade" }),
    whenResponse: varchar("when_response", { length: 80 }).notNull(),
    severity: severityEnum("severity").notNull(),
    disposition: vehicleDispositionEnum("disposition").notNull(),
    blockDeparture: boolean("block_departure").notNull().default(false),
    requireComment: boolean("require_comment").notNull().default(false),
    requirePhoto: boolean("require_photo").notNull().default(false),
    createDefect: boolean("create_defect").notNull().default(false),
    notifyDriver: boolean("notify_driver").notNull().default(false),
    notifySupervisor: boolean("notify_supervisor").notNull().default(false),
    notifyMaintenance: boolean("notify_maintenance").notNull().default(false),
    driverMessage: text("driver_message"),
    priority: integer("priority").notNull().default(100),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inspection_item_rules_response_unique").on(
      table.inspectionItemId,
      table.whenResponse,
    ),
    index("inspection_item_rules_item_idx").on(table.inspectionItemId),
  ],
);

export const inspectionTemplateReviews = pgTable(
  "inspection_template_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => inspectionTemplates.id, { onDelete: "cascade" }),
    reviewRound: integer("review_round").notNull(),
    definitionHash: varchar("definition_hash", { length: 64 }).notNull(),
    reviewLane: templateReviewLaneEnum("review_lane").notNull(),
    decision: templateReviewDecisionEnum("decision").notNull(),
    reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inspection_template_reviews_lane_unique").on(table.templateId, table.reviewRound, table.reviewLane),
    index("inspection_template_reviews_template_idx").on(table.templateId, table.reviewRound),
  ],
);

export const vehicleInspectionAssignments = pgTable(
  "vehicle_inspection_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => inspectionTemplates.id, { onDelete: "restrict" }),
    frequency: assignmentFrequencyEnum("frequency").notNull(),
    autoLaunch: boolean("auto_launch").notNull().default(false),
    effectiveFrom: date("effective_from").notNull().defaultNow(),
    effectiveUntil: date("effective_until"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vehicle_inspection_assignments_unique").on(
      table.vehicleId,
      table.templateId,
      table.effectiveFrom,
    ),
    index("vehicle_inspection_assignments_vehicle_idx").on(table.vehicleId),
  ],
);

export const inspectionSubmissions = pgTable(
  "inspection_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => inspectionTemplates.id, { onDelete: "restrict" }),
    templateVersion: integer("template_version").notNull(),
    inspectorUserId: uuid("inspector_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    qrCodeId: uuid("qr_code_id").references(() => vehicleQrCodes.id, {
      onDelete: "set null",
    }),
    status: submissionStatusEnum("status").notNull().default("draft"),
    calculatedSeverity: severityEnum("calculated_severity")
      .notNull()
      .default("none"),
    calculatedDisposition: vehicleDispositionEnum("calculated_disposition")
      .notNull()
      .default("inspection_required"),
    odometer: integer("odometer"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("inspection_submissions_vehicle_idx").on(table.vehicleId),
    index("inspection_submissions_status_idx").on(table.status),
    index("inspection_submissions_submitted_idx").on(table.submittedAt),
  ],
);

export const inspectionAnswers = pgTable(
  "inspection_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => inspectionSubmissions.id, { onDelete: "cascade" }),
    inspectionItemId: uuid("inspection_item_id")
      .notNull()
      .references(() => inspectionItems.id, { onDelete: "restrict" }),
    response: jsonb("response").notNull().$type<unknown>(),
    comment: text("comment"),
    calculatedSeverity: severityEnum("calculated_severity")
      .notNull()
      .default("none"),
    appliedRuleId: uuid("applied_rule_id").references(
      () => inspectionItemRules.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inspection_answers_item_unique").on(
      table.submissionId,
      table.inspectionItemId,
    ),
    index("inspection_answers_submission_idx").on(table.submissionId),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    status: attachmentStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attachments_storage_key_unique").on(table.storageKey),
    index("attachments_uploader_idx").on(table.uploadedByUserId),
    index("attachments_status_idx").on(table.status),
  ],
);

export const inspectionAnswerAttachments = pgTable(
  "inspection_answer_attachments",
  {
    inspectionAnswerId: uuid("inspection_answer_id")
      .notNull()
      .references(() => inspectionAnswers.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inspection_answer_attachments_unique").on(
      table.inspectionAnswerId,
      table.attachmentId,
    ),
    index("inspection_answer_attachments_attachment_idx").on(table.attachmentId),
  ],
);

export const vehicleAttachments = pgTable(
  "vehicle_attachments",
  {
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "restrict" }),
    category: vehicleDocumentCategoryEnum("category").notNull(),
    caption: varchar("caption", { length: 500 }),
    effectiveDate: date("effective_date"),
    expiresOn: date("expires_on"),
    isPrimary: boolean("is_primary").notNull().default(false),
    linkedByUserId: uuid("linked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    retiredByUserId: uuid("retired_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    retirementReason: varchar("retirement_reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vehicle_attachments_unique").on(table.vehicleId, table.attachmentId),
    uniqueIndex("vehicle_attachments_attachment_unique").on(table.attachmentId),
    uniqueIndex("vehicle_attachments_one_primary_photo")
      .on(table.vehicleId)
      .where(sql`${table.isPrimary} = true and ${table.retiredAt} is null`),
    index("vehicle_attachments_vehicle_category_idx").on(table.vehicleId, table.category, table.createdAt),
    index("vehicle_attachments_expiry_idx").on(table.expiresOn),
  ],
);

export const defects = pgTable(
  "defects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => inspectionSubmissions.id, { onDelete: "restrict" }),
    answerId: uuid("answer_id").references(() => inspectionAnswers.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    severity: severityEnum("severity").notNull(),
    status: defectStatusEnum("status").notNull().default("reported"),
    blocksDeparture: boolean("blocks_departure").notNull().default(false),
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("defects_vehicle_idx").on(table.vehicleId),
    index("defects_status_idx").on(table.status),
    index("defects_severity_idx").on(table.severity),
  ],
);

export const safetyCases = pgTable(
  "safety_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "restrict" }),
    sourceSubmissionId: uuid("source_submission_id").notNull().references(() => inspectionSubmissions.id, { onDelete: "restrict" }),
    reinspectionSubmissionId: uuid("reinspection_submission_id").references(() => inspectionSubmissions.id, { onDelete: "restrict" }),
    status: safetyCaseStatusEnum("status").notNull().default("pending_supervisor_review"),
    priority: safetyCasePriorityEnum("priority").notNull().default("urgent"),
    targetResolutionAt: timestamp("target_resolution_at", { withTimezone: true }),
    serviceProvider: varchar("service_provider", { length: 180 }),
    externalReference: varchar("external_reference", { length: 120 }),
    estimatedCostCents: integer("estimated_cost_cents"),
    estimateStatus: maintenanceEstimateStatusEnum("estimate_status").notNull().default("not_required"),
    estimateNote: varchar("estimate_note", { length: 1000 }),
    estimateSubmittedAt: timestamp("estimate_submitted_at", { withTimezone: true }),
    estimateSubmittedByUserId: uuid("estimate_submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    estimateReviewedAt: timestamp("estimate_reviewed_at", { withTimezone: true }),
    estimateReviewedByUserId: uuid("estimate_reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    assignedTechnicianUserId: uuid("assigned_technician_user_id").references(() => users.id, { onDelete: "set null" }),
    summary: varchar("summary", { length: 240 }),
    supervisorNote: text("supervisor_note"),
    resolutionNote: text("resolution_note"),
    recordVersion: integer("record_version").notNull().default(1),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedByUserId: uuid("acknowledged_by_user_id").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    repairStartedAt: timestamp("repair_started_at", { withTimezone: true }),
    repairStartedByUserId: uuid("repair_started_by_user_id").references(() => users.id, { onDelete: "set null" }),
    repairCompletedAt: timestamp("repair_completed_at", { withTimezone: true }),
    repairCompletedByUserId: uuid("repair_completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedByUserId: uuid("released_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("safety_cases_source_submission_unique").on(table.sourceSubmissionId),
    uniqueIndex("safety_cases_reinspection_submission_unique").on(table.reinspectionSubmissionId).where(sql`${table.reinspectionSubmissionId} is not null`),
    uniqueIndex("safety_cases_one_active_per_vehicle").on(table.vehicleId).where(sql`${table.status} <> 'released'`),
    index("safety_cases_vehicle_status_idx").on(table.vehicleId, table.status),
    index("safety_cases_assigned_technician_idx").on(table.assignedTechnicianUserId, table.status),
  ],
);

export const maintenanceWorkEntries = pgTable(
  "maintenance_work_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    safetyCaseId: uuid("safety_case_id").notNull().references(() => safetyCases.id, { onDelete: "cascade" }),
    entryType: maintenanceWorkEntryTypeEnum("entry_type").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    partNumber: varchar("part_number", { length: 120 }),
    quantity: integer("quantity").notNull().default(1),
    costCents: integer("cost_cents").notNull().default(0),
    laborMinutes: integer("labor_minutes").notNull().default(0),
    vendorName: varchar("vendor_name", { length: 180 }),
    enteredByUserId: uuid("entered_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("maintenance_work_entries_case_idx").on(table.safetyCaseId, table.createdAt)],
);

export const safetyCaseAttachments = pgTable(
  "safety_case_attachments",
  {
    safetyCaseId: uuid("safety_case_id").notNull().references(() => safetyCases.id, { onDelete: "cascade" }),
    attachmentId: uuid("attachment_id").notNull().references(() => attachments.id, { onDelete: "restrict" }),
    category: safetyCaseEvidenceCategoryEnum("category").notNull(),
    caption: varchar("caption", { length: 500 }),
    linkedByUserId: uuid("linked_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("safety_case_attachments_unique").on(table.safetyCaseId, table.attachmentId),
    uniqueIndex("safety_case_attachments_attachment_unique").on(table.attachmentId),
    index("safety_case_attachments_attachment_idx").on(table.attachmentId),
  ],
);

export const safetyCaseEvents = pgTable(
  "safety_case_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    safetyCaseId: uuid("safety_case_id").notNull().references(() => safetyCases.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: safetyCaseActionEnum("action").notNull(),
    fromStatus: safetyCaseStatusEnum("from_status"),
    toStatus: safetyCaseStatusEnum("to_status").notNull(),
    note: text("note"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("safety_case_events_case_created_idx").on(table.safetyCaseId, table.createdAt)],
);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventKey: varchar("event_key", { length: 160 }).notNull(),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recipientEmail: varchar("recipient_email", { length: 320 }),
    urgency: notificationUrgencyEnum("urgency").notNull().default("normal"),
    subject: varchar("subject", { length: 240 }).notNull(),
    templateKey: varchar("template_key", { length: 120 }).notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    status: notificationStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notification_outbox_event_recipient_unique").on(
      table.eventKey,
      table.recipientEmail,
    ),
    index("notification_outbox_status_idx").on(table.status),
    index("notification_outbox_retry_idx").on(table.status, table.nextAttemptAt, table.createdAt),
  ],
);

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventKey: varchar("event_key", { length: 180 }).notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: userNotificationKindEnum("kind").notNull(),
    urgency: notificationUrgencyEnum("urgency").notNull().default("normal"),
    title: varchar("title", { length: 240 }).notNull(),
    body: varchar("body", { length: 1000 }).notNull(),
    href: varchar("href", { length: 500 }),
    requiresAcknowledgment: boolean("requires_acknowledgment").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_notifications_event_user_unique").on(table.eventKey, table.userId),
    index("user_notifications_user_unread_idx").on(table.userId, table.readAt, table.createdAt),
    index("user_notifications_user_ack_idx").on(table.userId, table.acknowledgedAt, table.createdAt).where(sql`${table.requiresAcknowledgment} = true`),
  ],
);

export const maintenanceEscalationPolicies = pgTable(
  "maintenance_escalation_policies",
  {
    priority: safetyCasePriorityEnum("priority").primaryKey(),
    acknowledgmentMinutes: integer("acknowledgment_minutes").notNull(),
    assignmentMinutes: integer("assignment_minutes").notNull(),
    overdueRepeatMinutes: integer("overdue_repeat_minutes").notNull(),
    estimateApprovalThresholdCents: integer("estimate_approval_threshold_cents").notNull(),
    active: boolean("active").notNull().default(true),
    recordVersion: integer("record_version").notNull().default(1),
    ...timestamps,
  },
);

export const reportSubscriptions = pgTable(
  "report_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    recipientUserId: uuid("recipient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    frequency: reportFrequencyEnum("frequency").notNull(),
    format: reportFormatEnum("format").notNull(),
    timeZone: varchar("time_zone", { length: 80 }).notNull(),
    deliveryHourLocal: integer("delivery_hour_local").notNull(),
    dayOfWeek: integer("day_of_week"),
    dayOfMonth: integer("day_of_month"),
    monthOfYear: integer("month_of_year"),
    filters: jsonb("filters").notNull().default(sql`'{}'::jsonb`).$type<Record<string, string>>(),
    active: boolean("active").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    recordVersion: integer("record_version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [index("report_subscriptions_due_idx").on(table.active, table.nextRunAt), index("report_subscriptions_recipient_idx").on(table.recipientUserId)],
);

export const reportArtifacts = pgTable(
  "report_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportKey: varchar("report_key", { length: 220 }).notNull(),
    format: reportFormatEnum("format").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    filters: jsonb("filters").notNull().$type<Record<string, string>>(),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("report_artifacts_report_key_unique").on(table.reportKey), uniqueIndex("report_artifacts_storage_key_unique").on(table.storageKey), index("report_artifacts_expiry_idx").on(table.expiresAt), index("report_artifacts_purge_idx").on(table.expiresAt)],
);

export const reportDeliveries = pgTable(
  "report_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").references(() => reportSubscriptions.id, { onDelete: "set null" }),
    artifactId: uuid("artifact_id").references(() => reportArtifacts.id, { onDelete: "restrict" }),
    notificationOutboxId: uuid("notification_outbox_id").references(() => notificationOutbox.id, { onDelete: "set null" }),
    deliveryKey: varchar("delivery_key", { length: 240 }).notNull(),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    status: reportDeliveryStatusEnum("status").notNull().default("pending"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("report_deliveries_key_unique").on(table.deliveryKey), index("report_deliveries_status_idx").on(table.status, table.createdAt), index("report_deliveries_subscription_idx").on(table.subscriptionId, table.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id"),
    requestId: uuid("request_id"),
    ipHash: varchar("ip_hash", { length: 128 }),
    metadata: jsonb("metadata").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);

export const requestRateLimits = pgTable(
  "request_rate_limits",
  {
    scope: varchar("scope", { length: 80 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.keyHash, table.windowStart],
      name: "request_rate_limits_pkey",
    }),
    index("request_rate_limits_cleanup_idx").on(table.windowStart),
  ],
);

export type User = typeof users.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type VehicleClass = typeof vehicleClasses.$inferSelect;
export type InspectionTemplate = typeof inspectionTemplates.$inferSelect;
export type InspectionItem = typeof inspectionItems.$inferSelect;
export type InspectionItemRule = typeof inspectionItemRules.$inferSelect;
export type SafetyCase = typeof safetyCases.$inferSelect;
