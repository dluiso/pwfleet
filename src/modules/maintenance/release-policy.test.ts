import { describe, expect, it } from "vitest";
import { isInspectionEligibleForRelease } from "./release-policy";

describe("vehicle release policy", () => {
  it("rejects a passing inspection evaluated by an unapproved rule set", () => {
    expect(isInspectionEligibleForRelease({ ruleSetStatus: "draft", disposition: "hold_for_review", blockingDefectCount: 0 })).toBe(false);
  });

  it("rejects any authoritative blocking disposition or open blocking defect", () => {
    expect(isInspectionEligibleForRelease({ ruleSetStatus: "approved", disposition: "out_of_service", blockingDefectCount: 0 })).toBe(false);
    expect(isInspectionEligibleForRelease({ ruleSetStatus: "approved", disposition: "cleared", blockingDefectCount: 1 })).toBe(false);
  });

  it("preserves release for approved, clean verification", () => {
    expect(isInspectionEligibleForRelease({ ruleSetStatus: "approved", disposition: "cleared", blockingDefectCount: 0 })).toBe(true);
  });
});
