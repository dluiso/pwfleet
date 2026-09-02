import { describe, expect, it } from "vitest";
import { classifySafetyCaseEscalations } from "./escalation-rules";

const policy = { priority: "critical" as const, acknowledgmentMinutes: 15, assignmentMinutes: 60, overdueRepeatMinutes: 60, estimateApprovalThresholdCents: 50_000, active: true, recordVersion: 1, createdAt: new Date(0), updatedAt: new Date(0) };
const base = { id: "case", status: "pending_supervisor_review" as const, priority: "critical" as const, createdAt: new Date("2026-01-01T00:00:00Z"), acknowledgedAt: null, targetResolutionAt: new Date("2026-01-01T01:00:00Z"), estimateStatus: "not_required" as const, estimateSubmittedAt: null };

describe("safety-case escalation classification", () => {
  it("escalates missing acknowledgment and overdue resolution independently", () => {
    const due = classifySafetyCaseEscalations(base, policy, new Date("2026-01-01T02:05:00Z"));
    expect(due.map((item) => item.key)).toEqual(["acknowledgment", "resolution"]);
    expect(due[1]?.repeatBucket).toBe(1);
  });

  it("does not escalate released or inactive policies", () => {
    expect(classifySafetyCaseEscalations({ ...base, status: "released" }, policy, new Date("2026-01-02T00:00:00Z"))).toEqual([]);
    expect(classifySafetyCaseEscalations(base, { ...policy, active: false }, new Date("2026-01-02T00:00:00Z"))).toEqual([]);
  });
});
