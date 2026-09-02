export type EscalationCaseInput = {
  status: "pending_supervisor_review" | "acknowledged" | "held" | "maintenance_assigned" | "repair_in_progress" | "awaiting_reinspection" | "awaiting_release" | "released";
  priority: "routine" | "urgent" | "critical";
  createdAt: Date;
  acknowledgedAt: Date | null;
  targetResolutionAt: Date | null;
  estimateStatus: "not_required" | "pending" | "approved" | "rejected";
  estimateSubmittedAt: Date | null;
};

export type EscalationPolicyInput = {
  priority: "routine" | "urgent" | "critical";
  acknowledgmentMinutes: number;
  assignmentMinutes: number;
  overdueRepeatMinutes: number;
  active: boolean;
};

export type EscalationDue = { key: string; title: string; body: string; repeatBucket?: number };

export function classifySafetyCaseEscalations(caseRecord: EscalationCaseInput, policy: EscalationPolicyInput, now: Date): EscalationDue[] {
  if (!policy.active || caseRecord.status === "released") return [];
  const due: EscalationDue[] = [];
  const elapsedMinutes = (from: Date) => Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (caseRecord.status === "pending_supervisor_review" && elapsedMinutes(caseRecord.createdAt) >= policy.acknowledgmentMinutes) {
    due.push({ key: "acknowledgment", title: "Supervisor acknowledgment overdue", body: `This ${caseRecord.priority} safety case has not been acknowledged within ${policy.acknowledgmentMinutes} minutes.` });
  }
  if ((caseRecord.status === "acknowledged" || caseRecord.status === "held") && elapsedMinutes(caseRecord.acknowledgedAt ?? caseRecord.createdAt) >= policy.assignmentMinutes) {
    due.push({ key: "assignment", title: "Maintenance assignment overdue", body: `This safety case has not been assigned within ${policy.assignmentMinutes} minutes.` });
  }
  if (caseRecord.estimateStatus === "pending" && caseRecord.estimateSubmittedAt && elapsedMinutes(caseRecord.estimateSubmittedAt) >= policy.assignmentMinutes) {
    due.push({ key: "estimate", title: "Estimate approval overdue", body: "A submitted maintenance estimate is still awaiting an authorized decision." });
  }
  if (caseRecord.targetResolutionAt && now > caseRecord.targetResolutionAt) {
    const repeatBucket = Math.floor(elapsedMinutes(caseRecord.targetResolutionAt) / policy.overdueRepeatMinutes);
    due.push({ key: "resolution", title: "Safety case is overdue", body: `The target resolution time has passed for this ${caseRecord.priority} case.`, repeatBucket });
  }
  return due;
}
