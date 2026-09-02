export type InspectionResponseValue =
  | "pass"
  | "defect"
  | "not_applicable"
  | string
  | number
  | boolean
  | Array<{ view: string; x: number; y: number; damageType: string }>
  | null;

export type RuleSeverity = "none" | "advisory" | "minor" | "major" | "critical";

export type OperationalDisposition =
  | "inspection_required"
  | "cleared"
  | "cleared_with_advisory"
  | "hold_for_review"
  | "out_of_service"
  | "maintenance_in_progress"
  | "ready_for_reinspection";

export type RuleInput = {
  id: string;
  itemId: string;
  whenResponse: string;
  severity: RuleSeverity;
  disposition: OperationalDisposition;
  blockDeparture: boolean;
  requireComment: boolean;
  requirePhoto: boolean;
  createDefect: boolean;
  notifyDriver: boolean;
  notifySupervisor: boolean;
  notifyMaintenance: boolean;
  driverMessage: string | null;
  priority: number;
};

export type AnswerInput = {
  itemId: string;
  itemKey: string;
  label: string;
  required: boolean;
  fieldType?: string;
  response: InspectionResponseValue;
  comment?: string | null;
  photoReferences?: string[];
};

export type EvaluatedAnswer = AnswerInput & {
  severity: RuleSeverity;
  appliedRuleId: string | null;
  createsDefect: boolean;
  blocksDeparture: boolean;
};

export type EvaluationIssue = {
  itemId: string;
  code: "required" | "comment_required" | "photo_required";
  message: string;
};

export type InspectionEvaluation = {
  severity: RuleSeverity;
  disposition: OperationalDisposition;
  blockDeparture: boolean;
  requiresSupervisorReview: boolean;
  notifyDriver: boolean;
  notifySupervisor: boolean;
  notifyMaintenance: boolean;
  driverMessages: string[];
  answers: EvaluatedAnswer[];
  issues: EvaluationIssue[];
  usedFailSafeRule: boolean;
};

const severityRank: Record<RuleSeverity, number> = {
  none: 0,
  advisory: 1,
  minor: 2,
  major: 3,
  critical: 4,
};

const dispositionRank: Record<OperationalDisposition, number> = {
  cleared: 0,
  cleared_with_advisory: 1,
  inspection_required: 2,
  hold_for_review: 3,
  ready_for_reinspection: 4,
  maintenance_in_progress: 5,
  out_of_service: 6,
};

function normalizedResponse(response: InspectionResponseValue): string {
  if (typeof response === "string") return response.trim().toLowerCase();
  if (typeof response === "boolean") return response ? "true" : "false";
  if (typeof response === "number") return String(response);
  return "";
}

function isMissing(response: InspectionResponseValue): boolean {
  return response === null || (typeof response === "string" && response.trim() === "");
}

function maxSeverity(current: RuleSeverity, next: RuleSeverity): RuleSeverity {
  return severityRank[next] > severityRank[current] ? next : current;
}

function maxDisposition(
  current: OperationalDisposition,
  next: OperationalDisposition,
): OperationalDisposition {
  return dispositionRank[next] > dispositionRank[current] ? next : current;
}

const failSafeDefectRule: Omit<RuleInput, "id" | "itemId"> = {
  whenResponse: "defect",
  severity: "major",
  disposition: "hold_for_review",
  blockDeparture: true,
  requireComment: true,
  requirePhoto: false,
  createDefect: true,
  notifyDriver: true,
  notifySupervisor: true,
  notifyMaintenance: false,
  driverMessage:
    "This defect does not have an approved rule. Do not operate the vehicle until a supervisor reviews it.",
  priority: Number.MAX_SAFE_INTEGER,
};

export function evaluateInspection(input: {
  answers: AnswerInput[];
  rules: RuleInput[];
  ruleSetStatus: "draft" | "approved";
}): InspectionEvaluation {
  let severity: RuleSeverity = "none";
  let disposition: OperationalDisposition = "cleared";
  let blockDeparture = false;
  let notifyDriver = false;
  let notifySupervisor = false;
  let notifyMaintenance = false;
  let usedFailSafeRule = false;
  const driverMessages = new Set<string>();
  const issues: EvaluationIssue[] = [];
  const rulesByItem = new Map<string, RuleInput[]>();
  for (const rule of input.rules) {
    const itemRules = rulesByItem.get(rule.itemId) ?? [];
    itemRules.push(rule);
    rulesByItem.set(rule.itemId, itemRules);
  }

  const answers = input.answers.map<EvaluatedAnswer>((answer) => {
    const response = normalizedResponse(answer.response);

    if (
      answer.required &&
      (isMissing(answer.response) ||
        (answer.fieldType === "attestation" && answer.response !== true))
    ) {
      issues.push({
        itemId: answer.itemId,
        code: "required",
        message: `${answer.label} is required.`,
      });
    }

    let rule = (rulesByItem.get(answer.itemId) ?? [])
      .filter((candidate) => candidate.whenResponse.toLowerCase() === response)
      .sort((left, right) => right.priority - left.priority)[0];

    if (response === "defect" && !rule) {
      usedFailSafeRule = true;
      rule = {
        id: `fail-safe:${answer.itemId}`,
        itemId: answer.itemId,
        ...failSafeDefectRule,
      };
    }

    if (!rule) {
      return {
        ...answer,
        severity: "none",
        appliedRuleId: null,
        createsDefect: false,
        blocksDeparture: false,
      };
    }

    if (rule.requireComment && !answer.comment?.trim()) {
      issues.push({
        itemId: answer.itemId,
        code: "comment_required",
        message: `A comment is required for ${answer.label}.`,
      });
    }

    if (rule.requirePhoto && !answer.photoReferences?.length) {
      issues.push({
        itemId: answer.itemId,
        code: "photo_required",
        message: `A photo is required for ${answer.label}.`,
      });
    }

    severity = maxSeverity(severity, rule.severity);
    disposition = maxDisposition(disposition, rule.disposition);
    blockDeparture ||= rule.blockDeparture;
    notifyDriver ||= rule.notifyDriver;
    notifySupervisor ||= rule.notifySupervisor;
    notifyMaintenance ||= rule.notifyMaintenance;
    if (rule.driverMessage) driverMessages.add(rule.driverMessage);

    return {
      ...answer,
      severity: rule.severity,
      appliedRuleId: rule.id.startsWith("fail-safe:") ? null : rule.id,
      createsDefect: rule.createDefect,
      blocksDeparture: rule.blockDeparture,
    };
  });

  if (input.ruleSetStatus !== "approved") {
    disposition = maxDisposition(disposition, "hold_for_review");
    blockDeparture = true;
    notifyDriver = true;
    notifySupervisor = true;
    driverMessages.add(
      "The safety rule set is awaiting Public Works approval. Wait for supervisor review before operating this vehicle.",
    );
  }

  return {
    severity,
    disposition,
    blockDeparture,
    requiresSupervisorReview:
      blockDeparture || disposition === "hold_for_review" || disposition === "out_of_service" || disposition === "maintenance_in_progress",
    notifyDriver,
    notifySupervisor,
    notifyMaintenance,
    driverMessages: [...driverMessages],
    answers,
    issues,
    usedFailSafeRule,
  };
}
