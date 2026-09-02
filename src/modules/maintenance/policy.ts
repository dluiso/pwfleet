import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, maintenanceEscalationPolicies } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { MaintenanceWorkflowError } from "./service";

const prioritySchema = z.enum(["routine", "urgent", "critical"]);
const policySchema = z.object({
  recordVersion: z.number().int().positive(),
  acknowledgmentMinutes: z.number().int().min(1).max(43_200),
  assignmentMinutes: z.number().int().min(1).max(43_200),
  overdueRepeatMinutes: z.number().int().min(1).max(43_200),
  estimateApprovalThresholdCents: z.number().int().min(0).max(100_000_000),
  active: z.boolean(),
});

export async function listMaintenancePolicies() {
  await requirePermission("configuration:manage");
  return db.select().from(maintenanceEscalationPolicies).orderBy(asc(maintenanceEscalationPolicies.priority));
}

export async function updateMaintenancePolicy(rawPriority: string, rawInput: unknown) {
  const actor = await requirePermission("configuration:manage");
  const priority = prioritySchema.safeParse(rawPriority);
  const parsed = policySchema.safeParse(rawInput);
  if (!priority.success || !parsed.success) throw new MaintenanceWorkflowError("The escalation policy is invalid.", 400, parsed.success ? undefined : parsed.error.flatten());
  const input = parsed.data;
  return db.transaction(async (transaction) => {
    const [current] = await transaction.select().from(maintenanceEscalationPolicies).where(eq(maintenanceEscalationPolicies.priority, priority.data)).for("update").limit(1);
    if (!current) throw new MaintenanceWorkflowError("Escalation policy not found.", 404);
    if (current.recordVersion !== input.recordVersion) throw new MaintenanceWorkflowError("This escalation policy changed after it was opened. Refresh and try again.", 409);
    const [updated] = await transaction.update(maintenanceEscalationPolicies).set({ ...input, recordVersion: current.recordVersion + 1, updatedAt: new Date() }).where(and(eq(maintenanceEscalationPolicies.priority, priority.data), eq(maintenanceEscalationPolicies.recordVersion, input.recordVersion))).returning();
    if (!updated) throw new MaintenanceWorkflowError("This escalation policy was updated concurrently.", 409);
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "maintenance_policy.updated", entityType: "maintenance_escalation_policy", metadata: { priority: priority.data, acknowledgmentMinutes: input.acknowledgmentMinutes, assignmentMinutes: input.assignmentMinutes, overdueRepeatMinutes: input.overdueRepeatMinutes, estimateApprovalThresholdCents: input.estimateApprovalThresholdCents, active: input.active } });
    return updated;
  });
}
