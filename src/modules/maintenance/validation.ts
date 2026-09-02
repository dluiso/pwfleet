import { z } from "zod";

const version = z.number().int().positive();
const optionalNote = z.string().trim().max(2000).optional();
const requiredNote = z.string().trim().min(3).max(2000);

export const safetyCaseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acknowledge"), recordVersion: version, note: optionalNote }),
  z.object({ action: z.literal("hold"), recordVersion: version, note: requiredNote }),
  z.object({
    action: z.literal("assign_maintenance"),
    recordVersion: version,
    assignedTechnicianUserId: z.uuid(),
    note: optionalNote,
  }),
  z.object({ action: z.literal("start_repair"), recordVersion: version, note: optionalNote }),
  z.object({ action: z.literal("complete_repair"), recordVersion: version, note: requiredNote }),
  z.object({ action: z.literal("approve_release"), recordVersion: version, note: requiredNote }),
  z.object({ action: z.literal("deny_release"), recordVersion: version, note: requiredNote }),
]);

export type SafetyCaseActionInput = z.infer<typeof safetyCaseActionSchema>;

const nullableTrimmed = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(maximum).nullable(),
);

export const safetyCaseDetailsSchema = z.object({
  recordVersion: version,
  priority: z.enum(["routine", "urgent", "critical"]),
  targetResolutionAt: z.iso.datetime({ offset: true }).nullable(),
  serviceProvider: nullableTrimmed(180),
  externalReference: nullableTrimmed(120),
});

export const maintenanceWorkEntrySchema = z.object({
  recordVersion: version,
  entryType: z.enum(["labor", "part", "external_service", "note"]),
  description: z.string().trim().min(2).max(500),
  partNumber: nullableTrimmed(120),
  quantity: z.number().int().min(1).max(100_000),
  costCents: z.number().int().min(0).max(100_000_000),
  laborMinutes: z.number().int().min(0).max(100_000),
  vendorName: nullableTrimmed(180),
}).superRefine((entry, context) => {
  if (entry.entryType === "labor" && entry.laborMinutes < 1) {
    context.addIssue({ code: "custom", path: ["laborMinutes"], message: "Labor entries require at least one minute." });
  }
  if (entry.entryType === "part" && !entry.partNumber) {
    context.addIssue({ code: "custom", path: ["partNumber"], message: "Part entries require a part number." });
  }
});

export const deleteWorkEntrySchema = z.object({ recordVersion: version });

export const safetyCaseEvidenceSchema = z.object({
  recordVersion: version,
  attachmentId: z.uuid(),
  category: z.enum(["before_repair", "after_repair", "invoice", "receipt", "other"]),
  caption: nullableTrimmed(500),
});

export const maintenanceEstimateSchema = z.object({
  recordVersion: version,
  estimatedCostCents: z.number().int().min(0).max(100_000_000),
  note: z.string().trim().min(3).max(1000),
});

export const maintenanceEstimateReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  recordVersion: version,
  note: z.string().trim().min(3).max(1000),
});

export const maintenanceReassignmentSchema = z.object({
  recordVersion: version,
  assignedTechnicianUserId: z.uuid(),
  note: z.string().trim().min(3).max(1000),
});
