export type ReleaseVerification = {
  ruleSetStatus: "draft" | "approved";
  disposition: string;
  blockingDefectCount: number;
};

const blockedDispositions = new Set(["hold_for_review", "out_of_service", "maintenance_in_progress"]);

export function isInspectionEligibleForRelease(input: ReleaseVerification): boolean {
  return input.ruleSetStatus === "approved" && !blockedDispositions.has(input.disposition) && input.blockingDefectCount === 0;
}
