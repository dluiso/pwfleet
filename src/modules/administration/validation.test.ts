import { describe, expect, it } from "vitest";
import {
  assignmentInputSchema,
  createTemplateVersionInputSchema,
  createTemplateInputSchema,
  deleteDraftTemplateInputSchema,
  draftRuleSchema,
  draftTemplateDefinitionSchema,
  publishableTemplateDefinitionSchema,
  endAssignmentInputSchema,
  rotateQrInputSchema,
  userInputSchema,
  vehicleInputSchema,
  vehicleUpdateSchema,
  vehicleDocumentMetadataSchema,
  templateWorkflowInputSchema,
} from "./validation";

const classId = "4f9d9c6b-86ae-4b6e-9ae6-3b7d4994945f";

describe("administration validation", () => {
  it("preserves unit leading zeros and normalizes operational identifiers", () => {
    const parsed = vehicleInputSchema.parse({
      unitNumber: "03",
      displayCode: "dt-03",
      vehicleClassId: classId,
      vin: "1ftfw1et1efc12345",
      licensePlate: "pw 103",
      licenseState: "il",
      lifecycleStatus: "active",
    });
    expect(parsed.unitNumber).toBe("03");
    expect(parsed.displayCode).toBe("DT-03");
    expect(parsed.vin).toBe("1FTFW1ET1EFC12345");
    expect(parsed.licenseState).toBe("IL");
  });

  it("rejects invalid VIN characters and stale update versions", () => {
    expect(
      vehicleInputSchema.safeParse({
        unitNumber: "04",
        vehicleClassId: classId,
        vin: "1FTFW1ET1EFO12345",
      }).success,
    ).toBe(false);
    expect(
      vehicleUpdateSchema.safeParse({
        unitNumber: "04",
        vehicleClassId: classId,
        lifecycleStatus: "active",
        recordVersion: 0,
      }).success,
    ).toBe(false);
  });

  it("validates dossier dates, costs, and controlled document metadata", () => {
    expect(vehicleInputSchema.safeParse({ unitNumber: "05", vehicleClassId: classId, acquisitionDate: "2026-02-01", inServiceDate: "2026-02-10", purchaseCostCents: 1250000 }).success).toBe(true);
    expect(vehicleInputSchema.safeParse({ unitNumber: "05", vehicleClassId: classId, acquisitionDate: "2026-02-10", inServiceDate: "2026-02-01" }).success).toBe(false);
    expect(vehicleDocumentMetadataSchema.safeParse({ category: "profile_photo", isPrimary: true }).success).toBe(true);
    expect(vehicleDocumentMetadataSchema.safeParse({ category: "insurance", isPrimary: true }).success).toBe(false);
    expect(vehicleDocumentMetadataSchema.safeParse({ category: "warranty", effectiveDate: "2026-05-01", expiresOn: "2026-04-01", isPrimary: false }).success).toBe(false);
  });

  it("validates user roles, assignments, and QR replacement reasons", () => {
    expect(userInputSchema.safeParse({ email: "driver@example.gov", displayName: "Driver One", role: "driver", active: true }).success).toBe(true);
    expect(userInputSchema.safeParse({ email: "driver@example.gov", displayName: "Driver One", role: "owner", active: true }).success).toBe(false);
    expect(assignmentInputSchema.safeParse({ templateId: classId, frequency: "daily", autoLaunch: true }).success).toBe(true);
    expect(endAssignmentInputSchema.safeParse({ action: "end" }).success).toBe(true);
    expect(endAssignmentInputSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(createTemplateVersionInputSchema.safeParse({ action: "create_draft_version" }).success).toBe(true);
    expect(createTemplateInputSchema.safeParse({ code: "street_sweeper_pretrip", name: "Street Sweeper Pre-Trip Inspection", description: "Daily operating inspection." }).data?.code).toBe("STREET_SWEEPER_PRETRIP");
    expect(createTemplateInputSchema.safeParse({ code: "INVALID-CODE", name: "Invalid form" }).success).toBe(false);
    expect(deleteDraftTemplateInputSchema.safeParse({ recordVersion: 1, confirmationCode: "street_sweeper_pretrip", reason: "Created in error" }).data?.confirmationCode).toBe("STREET_SWEEPER_PRETRIP");
    expect(rotateQrInputSchema.safeParse({ reason: "x" }).success).toBe(false);
  });

  it("enforces fail-safe rule consistency", () => {
    const critical = {
      whenResponse: "defect",
      severity: "critical",
      disposition: "out_of_service",
      blockDeparture: true,
      requireComment: true,
      requirePhoto: false,
      createDefect: true,
      notifyDriver: true,
      notifySupervisor: true,
      notifyMaintenance: true,
      driverMessage: "Do not operate this vehicle.",
    };
    expect(draftRuleSchema.safeParse(critical).success).toBe(true);
    expect(draftRuleSchema.safeParse({ ...critical, blockDeparture: false }).success).toBe(false);
    expect(draftRuleSchema.safeParse({ ...critical, notifySupervisor: false }).success).toBe(false);
    expect(draftRuleSchema.safeParse({ ...critical, severity: "major", disposition: "hold_for_review", notifyDriver: false }).success).toBe(false);
  });

  it("saves incomplete drafts but requires an attestation before review", () => {
    const definition = {
      recordVersion: 1,
      name: "Draft inspection",
      description: "Draft",
      sections: [{
        sectionKey: "certification",
        title: "Certification",
        description: "",
        items: [{
          itemKey: "attestation",
          label: "I certify this inspection.",
          helpText: "",
          fieldType: "attestation",
          required: true,
          options: [],
          rules: [],
        }],
      }],
    };
    expect(draftTemplateDefinitionSchema.safeParse(definition).success).toBe(true);
    const incomplete = { ...definition, sections: [{ ...definition.sections[0], items: [{ ...definition.sections[0]!.items[0], fieldType: "text" }] }] };
    expect(draftTemplateDefinitionSchema.safeParse(incomplete).success).toBe(true);
    expect(publishableTemplateDefinitionSchema.safeParse(incomplete).success).toBe(false);
    expect(draftTemplateDefinitionSchema.safeParse({ ...definition, sections: [] }).success).toBe(true);
    expect(publishableTemplateDefinitionSchema.safeParse({ ...definition, sections: [] }).success).toBe(false);
  });

  it("prevents visibility cycles and validates workflow comments", () => {
    const conditionalDefinition = {
      recordVersion: 1,
      name: "Conditional inspection",
      description: "Draft",
      sections: [{ sectionKey: "main", title: "Main", description: "", items: [
        { itemKey: "trigger", label: "Trigger", helpText: "", fieldType: "select", required: true, options: ["Yes", "No"], visibilityCondition: null, rules: [] },
        { itemKey: "details", label: "Details", helpText: "", fieldType: "text", required: false, options: [], visibilityCondition: { sourceItemKey: "trigger", operator: "equals", value: "Yes" }, rules: [] },
        { itemKey: "certify", label: "I certify this inspection.", helpText: "", fieldType: "attestation", required: true, options: [], visibilityCondition: null, rules: [] },
      ] }],
    };
    expect(draftTemplateDefinitionSchema.safeParse(conditionalDefinition).success).toBe(true);
    const cycle = structuredClone(conditionalDefinition);
    cycle.sections[0]!.items[0]!.visibilityCondition = { sourceItemKey: "details", operator: "equals", value: "Yes" };
    expect(draftTemplateDefinitionSchema.safeParse(cycle).success).toBe(false);
    expect(templateWorkflowInputSchema.safeParse({ action: "review", decision: "request_changes", comment: "" }).success).toBe(false);
    expect(templateWorkflowInputSchema.safeParse({ action: "publish" }).success).toBe(true);
  });
});
