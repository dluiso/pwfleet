import { z } from "zod";

const optionalTrimmed = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maximum).nullable().optional(),
  );

const optionalUppercase = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maximum).transform((value) => value.toUpperCase()).nullable().optional(),
  );

const optionalDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.iso.date().nullable().optional(),
);

export const vehicleInputSchema = z.object({
  unitNumber: z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9-]+$/),
  displayCode: optionalUppercase(40),
  vehicleClassId: z.uuid(),
  vin: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/).nullable().optional(),
  ),
  licensePlate: optionalUppercase(32),
  licenseState: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/).nullable().optional(),
  ),
  year: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  ),
  make: optionalTrimmed(80),
  model: optionalTrimmed(120),
  currentOdometer: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().nonnegative().optional(),
  ),
  assetTag: optionalUppercase(64),
  acquisitionDate: optionalDate,
  purchaseCostCents: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().nonnegative().max(2_147_483_647).optional(),
  ),
  inServiceDate: optionalDate,
  fuelType: optionalTrimmed(40),
  ownershipType: optionalTrimmed(40),
  primaryLocation: optionalTrimmed(160),
  notes: optionalTrimmed(4000),
  lifecycleStatus: z.enum(["active", "inactive", "disposed"]).default("active"),
}).superRefine((vehicle, context) => {
  if (vehicle.acquisitionDate && vehicle.inServiceDate && vehicle.inServiceDate < vehicle.acquisitionDate) {
    context.addIssue({
      code: "custom",
      path: ["inServiceDate"],
      message: "The in-service date cannot precede the acquisition date.",
    });
  }
});

export const vehicleUpdateSchema = vehicleInputSchema.safeExtend({
  recordVersion: z.number().int().positive(),
});

export const vehicleDocumentMetadataSchema = z
  .object({
    category: z.enum(["profile_photo", "registration", "insurance", "title", "warranty", "service_record", "other"]),
    caption: optionalTrimmed(500),
    effectiveDate: optionalDate,
    expiresOn: optionalDate,
    isPrimary: z.preprocess((value) => value === true || value === "true", z.boolean()).default(false),
  })
  .superRefine((document, context) => {
    if (document.isPrimary && document.category !== "profile_photo") {
      context.addIssue({ code: "custom", path: ["isPrimary"], message: "Only a profile photo can be the primary vehicle image." });
    }
    if (document.effectiveDate && document.expiresOn && document.expiresOn < document.effectiveDate) {
      context.addIssue({ code: "custom", path: ["expiresOn"], message: "The expiration date cannot precede the effective date." });
    }
  });

export const retireVehicleDocumentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const userInputSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  displayName: z.string().trim().min(2).max(160),
  role: z.enum([
    "driver",
    "supervisor",
    "fleet_manager",
    "maintenance_technician",
    "administrator",
    "auditor",
  ]),
  active: z.boolean().default(true),
});

export const userUpdateSchema = userInputSchema.extend({
  recordVersion: z.number().int().positive(),
});

export const resetIdentityBindingSchema = z.object({
  action: z.literal("reset_identity_binding"),
  reason: z.string().trim().min(8).max(500),
});

export const assignmentInputSchema = z.object({
  templateId: z.uuid(),
  frequency: z.enum([
    "before_first_departure",
    "end_of_shift",
    "daily",
    "per_handover",
    "on_demand",
  ]),
  autoLaunch: z.boolean().default(false),
});

export const endAssignmentInputSchema = z.object({
  action: z.literal("end"),
});

export const createTemplateVersionInputSchema = z.object({
  action: z.literal("create_draft_version"),
});

export const createTemplateInputSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(64).regex(/^[A-Z0-9_]+$/, "Use only letters, numbers, and underscores."),
  name: z.string().trim().min(3).max(180),
  description: optionalTrimmed(1200),
});

export const deleteDraftTemplateInputSchema = z.object({
  recordVersion: z.number().int().positive(),
  confirmationCode: z.string().trim().toUpperCase().min(2).max(64),
  reason: z.string().trim().min(3).max(500),
});

const definitionKeySchema = z.string().trim().min(2).max(100).regex(/^[a-z][a-z0-9_]*$/);
const fieldTypeSchema = z.enum([
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
const dispositionSchema = z.enum([
  "inspection_required",
  "cleared",
  "cleared_with_advisory",
  "hold_for_review",
  "out_of_service",
  "maintenance_in_progress",
  "ready_for_reinspection",
]);

export const visibilityConditionSchema = z
  .object({
    sourceItemKey: definitionKeySchema,
    operator: z.enum(["equals", "not_equals", "is_truthy"]),
    value: optionalTrimmed(240),
  })
  .superRefine((condition, context) => {
    if (condition.operator !== "is_truthy" && !condition.value) {
      context.addIssue({ code: "custom", path: ["value"], message: "Equals and not-equals conditions require a comparison value." });
    }
  });

export const draftRuleSchema = z
  .object({
    whenResponse: z.string().trim().min(1).max(80),
    severity: z.enum(["none", "advisory", "minor", "major", "critical"]),
    disposition: dispositionSchema,
    blockDeparture: z.boolean(),
    requireComment: z.boolean(),
    requirePhoto: z.boolean(),
    createDefect: z.boolean(),
    notifyDriver: z.boolean(),
    notifySupervisor: z.boolean(),
    notifyMaintenance: z.boolean(),
    driverMessage: optionalTrimmed(500),
  })
  .superRefine((rule, context) => {
    const blockingDisposition = ["hold_for_review", "out_of_service", "maintenance_in_progress"].includes(rule.disposition);
    if (blockingDisposition !== rule.blockDeparture) {
      context.addIssue({ code: "custom", path: ["blockDeparture"], message: "Blocking dispositions must block departure; release dispositions cannot block departure." });
    }
    if (rule.severity === "critical" && (rule.disposition !== "out_of_service" || !rule.blockDeparture || !rule.createDefect || !rule.notifyDriver || !rule.notifySupervisor)) {
      context.addIssue({ code: "custom", path: ["severity"], message: "Critical rules must set Out of Service, block departure, create a defect, and notify the driver and supervisor." });
    }
    if (rule.severity === "none" && (rule.disposition !== "cleared" || rule.blockDeparture || rule.createDefect)) {
      context.addIssue({ code: "custom", path: ["severity"], message: "A rule with no severity must clear the vehicle and cannot block or create a defect." });
    }
    if (rule.blockDeparture && !rule.driverMessage) {
      context.addIssue({ code: "custom", path: ["driverMessage"], message: "A blocking rule requires a driver instruction." });
    }
    if (rule.blockDeparture && (!rule.createDefect || !rule.notifyDriver || !rule.notifySupervisor)) {
      context.addIssue({ code: "custom", path: ["blockDeparture"], message: "A blocking rule must create a defect and notify the driver and supervisor." });
    }
  });

const draftItemSchema = z
  .object({
    itemKey: definitionKeySchema,
    label: z.string().trim().min(2).max(240),
    helpText: optionalTrimmed(500),
    fieldType: fieldTypeSchema,
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(120)).max(50),
    visibilityCondition: visibilityConditionSchema.nullable().default(null),
    rules: z.array(draftRuleSchema).max(10),
  })
  .superRefine((item, context) => {
    const optionField = item.fieldType === "select" || item.fieldType === "fuel_level";
    if (optionField && item.options.length < 1) {
      context.addIssue({ code: "custom", path: ["options"], message: "Select and fuel-level fields require at least one option." });
    }
    if (!optionField && item.options.length > 0) {
      context.addIssue({ code: "custom", path: ["options"], message: "Only select and fuel-level fields may define options." });
    }
    const responses = item.rules.map((rule) => rule.whenResponse.toLowerCase());
    if (new Set(responses).size !== responses.length) {
      context.addIssue({ code: "custom", path: ["rules"], message: "Rule response conditions must be unique within a field." });
    }
  });

const draftSectionSchema = z.object({
  sectionKey: definitionKeySchema,
  title: z.string().trim().min(2).max(180),
  description: optionalTrimmed(800),
  items: z.array(draftItemSchema).max(80),
});

export const draftTemplateDefinitionSchema = z
  .object({
    recordVersion: z.number().int().positive(),
    name: z.string().trim().min(3).max(180),
    description: optionalTrimmed(1200),
    sections: z.array(draftSectionSchema).max(30),
  })
  .superRefine((definition, context) => {
    const sectionKeys = definition.sections.map((section) => section.sectionKey);
    if (new Set(sectionKeys).size !== sectionKeys.length) {
      context.addIssue({ code: "custom", path: ["sections"], message: "Section keys must be unique." });
    }
    const items = definition.sections.flatMap((section) => section.items);
    if (items.length > 200) {
      context.addIssue({ code: "custom", path: ["sections"], message: "A form cannot contain more than 200 fields." });
    }
    const itemKeys = items.map((item) => item.itemKey);
    if (new Set(itemKeys).size !== itemKeys.length) {
      context.addIssue({ code: "custom", path: ["sections"], message: "Field keys must be unique across the form." });
    }
    const priorKeys = new Set<string>();
    for (const [sectionIndex, section] of definition.sections.entries()) {
      for (const [itemIndex, item] of section.items.entries()) {
        if (item.visibilityCondition && !priorKeys.has(item.visibilityCondition.sourceItemKey)) {
          context.addIssue({
            code: "custom",
            path: ["sections", sectionIndex, "items", itemIndex, "visibilityCondition", "sourceItemKey"],
            message: "A visibility condition must reference an earlier field to prevent cycles.",
          });
        }
        priorKeys.add(item.itemKey);
      }
    }
  });

export const publishableTemplateDefinitionSchema = draftTemplateDefinitionSchema.superRefine((definition, context) => {
  const items = definition.sections.flatMap((section) => section.items);
  if (definition.sections.length === 0) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Add at least one section before requesting review." });
  }
  if (items.length === 0) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Add at least one field before requesting review." });
  }
  if (!items.some((item) => item.fieldType === "attestation" && item.required)) {
    context.addIssue({ code: "custom", path: ["sections"], message: "Every inspection form requires a mandatory attestation field before review." });
  }
});

export const templateWorkflowInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request_review") }),
  z.object({
    action: z.literal("review"),
    decision: z.enum(["approve", "request_changes"]),
    comment: z.string().trim().max(1200).optional(),
  }).superRefine((input, context) => {
    if (input.decision === "request_changes" && (!input.comment || input.comment.length < 3)) {
      context.addIssue({ code: "custom", path: ["comment"], message: "A change request requires an explanatory comment." });
    }
  }),
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("retire"), reason: z.string().trim().min(3).max(500) }),
]);

export const rotateQrInputSchema = z.object({
  reason: z.string().trim().min(3).max(240),
});
