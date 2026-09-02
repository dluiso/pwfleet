import { describe, expect, it } from "vitest";
import { evaluateInspection, type RuleInput } from "./rules";

const criticalBrakeRule: RuleInput = {
  id: "rule-brakes",
  itemId: "brakes",
  whenResponse: "defect",
  severity: "critical",
  disposition: "out_of_service",
  blockDeparture: true,
  requireComment: true,
  requirePhoto: true,
  createDefect: true,
  notifyDriver: true,
  notifySupervisor: true,
  notifyMaintenance: true,
  driverMessage: "Do not operate this vehicle.",
  priority: 1000,
};

describe("inspection rule evaluation", () => {
  it("places a vehicle out of service for a configured critical defect", () => {
    const result = evaluateInspection({
      ruleSetStatus: "approved",
      rules: [criticalBrakeRule],
      answers: [
        {
          itemId: "brakes",
          itemKey: "brakes",
          label: "Service brakes",
          required: true,
          response: "defect",
          comment: "Brake pedal travels to the floor.",
          photoReferences: ["attachment-1"],
        },
      ],
    });

    expect(result.severity).toBe("critical");
    expect(result.disposition).toBe("out_of_service");
    expect(result.blockDeparture).toBe(true);
    expect(result.notifyMaintenance).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails safe when a defect has no configured rule", () => {
    const result = evaluateInspection({
      ruleSetStatus: "approved",
      rules: [],
      answers: [
        {
          itemId: "unknown-item",
          itemKey: "unknown_item",
          label: "Unknown item",
          required: true,
          response: "defect",
          comment: "Observed a problem.",
        },
      ],
    });

    expect(result.usedFailSafeRule).toBe(true);
    expect(result.disposition).toBe("hold_for_review");
    expect(result.blockDeparture).toBe(true);
    expect(result.notifySupervisor).toBe(true);
  });

  it("prevents an unapproved rule set from clearing a vehicle", () => {
    const result = evaluateInspection({
      ruleSetStatus: "draft",
      rules: [],
      answers: [
        {
          itemId: "mirrors",
          itemKey: "mirrors",
          label: "Mirrors",
          required: true,
          response: "pass",
        },
      ],
    });

    expect(result.disposition).toBe("hold_for_review");
    expect(result.blockDeparture).toBe(true);
    expect(result.driverMessages[0]).toMatch(/awaiting Public Works approval/);
  });

  it("reports missing evidence required by a rule", () => {
    const result = evaluateInspection({
      ruleSetStatus: "approved",
      rules: [criticalBrakeRule],
      answers: [
        {
          itemId: "brakes",
          itemKey: "brakes",
          label: "Service brakes",
          required: true,
          response: "defect",
        },
      ],
    });

    expect(result.issues.map((issue) => issue.code)).toEqual([
      "comment_required",
      "photo_required",
    ]);
  });
});

