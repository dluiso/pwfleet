import { describe, expect, it } from "vitest";
import { maintenanceWorkEntrySchema, safetyCaseActionSchema, safetyCaseDetailsSchema } from "./validation";

describe("safety case action validation", () => {
  it("requires explanatory notes for consequential decisions", () => {
    expect(safetyCaseActionSchema.safeParse({ action: "hold", recordVersion: 1, note: "" }).success).toBe(false);
    expect(safetyCaseActionSchema.safeParse({ action: "complete_repair", recordVersion: 1, note: "Replaced damaged hose." }).success).toBe(true);
    expect(safetyCaseActionSchema.safeParse({ action: "approve_release", recordVersion: 1, note: "Clean reinspection verified." }).success).toBe(true);
  });

  it("requires a valid technician assignment", () => {
    expect(safetyCaseActionSchema.safeParse({ action: "assign_maintenance", recordVersion: 1, assignedTechnicianUserId: "invalid" }).success).toBe(false);
  });

  it("validates work-entry semantics and cost bounds", () => {
    expect(maintenanceWorkEntrySchema.safeParse({ recordVersion: 1, entryType: "labor", description: "Brake inspection", quantity: 1, costCents: 12000, laborMinutes: 0, partNumber: null, vendorName: null }).success).toBe(false);
    expect(maintenanceWorkEntrySchema.safeParse({ recordVersion: 1, entryType: "part", description: "Brake hose", quantity: 1, costCents: 8900, laborMinutes: 0, partNumber: "BH-100", vendorName: "Approved Vendor" }).success).toBe(true);
  });

  it("accepts an explicit SLA target and nullable provider metadata", () => {
    expect(safetyCaseDetailsSchema.safeParse({ recordVersion: 1, priority: "critical", targetResolutionAt: "2026-09-01T14:00:00-05:00", serviceProvider: "", externalReference: null }).success).toBe(true);
  });
});
