import { describe, expect, it } from "vitest";
import { visibilityConditionMatches } from "./visibility";

describe("conditional field visibility", () => {
  it("compares values case-insensitively and supports truthy conditions", () => {
    const answers = new Map<string, unknown>([["damage_found", "Yes"], ["certified", true]]);
    expect(visibilityConditionMatches({ sourceItemKey: "damage_found", operator: "equals", value: "yes" }, answers)).toBe(true);
    expect(visibilityConditionMatches({ sourceItemKey: "damage_found", operator: "not_equals", value: "no" }, answers)).toBe(true);
    expect(visibilityConditionMatches({ sourceItemKey: "certified", operator: "is_truthy" }, answers)).toBe(true);
  });

  it("keeps unconditional fields visible and hides unmet conditions", () => {
    const answers = new Map<string, unknown>();
    expect(visibilityConditionMatches(null, answers)).toBe(true);
    expect(visibilityConditionMatches({ sourceItemKey: "missing", operator: "equals", value: "yes" }, answers)).toBe(false);
    expect(visibilityConditionMatches({ sourceItemKey: "missing", operator: "not_equals", value: "yes" }, answers)).toBe(false);
  });
});
