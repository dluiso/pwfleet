import { and, eq, inArray, ne } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { auditEvents, inspectionSubmissions, maintenanceEscalationPolicies, notificationOutbox, safetyCaseEvents, safetyCases, userNotifications, users, vehicles } from "@/db/schema";
import { classifySafetyCaseEscalations } from "./escalation-rules";

const escalationLockKey = 1_938_220_420;

export async function processSafetyEscalations(now = new Date()) {
  const lockClient = await pool.connect();
  const result = { casesReviewed: 0, escalationsCreated: 0, skipped: false };
  try {
    const lock = await lockClient.query<{ acquired: boolean }>("select pg_try_advisory_lock($1) as acquired", [escalationLockKey]);
    if (!lock.rows[0]?.acquired) return { ...result, skipped: true };
    const [caseRows, policies, supervisors] = await Promise.all([
      db.select({
        id: safetyCases.id,
        status: safetyCases.status,
        priority: safetyCases.priority,
        createdAt: safetyCases.createdAt,
        acknowledgedAt: safetyCases.acknowledgedAt,
        targetResolutionAt: safetyCases.targetResolutionAt,
        estimateStatus: safetyCases.estimateStatus,
        estimateSubmittedAt: safetyCases.estimateSubmittedAt,
        assignedTechnicianUserId: safetyCases.assignedTechnicianUserId,
        inspectorUserId: inspectionSubmissions.inspectorUserId,
        unitNumber: vehicles.unitNumber,
        displayCode: vehicles.displayCode,
      }).from(safetyCases).innerJoin(inspectionSubmissions, eq(safetyCases.sourceSubmissionId, inspectionSubmissions.id)).innerJoin(vehicles, eq(safetyCases.vehicleId, vehicles.id)).where(ne(safetyCases.status, "released")),
      db.select().from(maintenanceEscalationPolicies),
      db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.active, true), inArray(users.role, ["supervisor", "fleet_manager", "administrator"]))),
    ]);
    const policyByPriority = new Map(policies.map((policy) => [policy.priority, policy]));
    for (const caseRecord of caseRows) {
      result.casesReviewed += 1;
      const policy = policyByPriority.get(caseRecord.priority);
      if (!policy) continue;
      const due = classifySafetyCaseEscalations(caseRecord, policy, now);
      if (!due.length) continue;
      const extraIds = [caseRecord.assignedTechnicianUserId, caseRecord.inspectorUserId].filter((id): id is string => Boolean(id));
      const extraRecipients = extraIds.length ? await db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.active, true), inArray(users.id, extraIds))) : [];
      const recipientMap = new Map([...supervisors, ...extraRecipients].map((recipient) => [recipient.id, recipient]));
      const vehicleCode = caseRecord.displayCode ?? `Unit ${caseRecord.unitNumber}`;
      for (const escalation of due) {
        const suffix = escalation.repeatBucket === undefined ? escalation.key : `${escalation.key}:${escalation.repeatBucket}`;
        const eventKey = `safety-case:${caseRecord.id}:escalation:${suffix}`;
        let createdForCase = false;
        for (const recipient of recipientMap.values()) {
          const inserted = await db.insert(userNotifications).values({ eventKey, userId: recipient.id, kind: "safety_case", urgency: "critical", title: `${escalation.title} - ${vehicleCode}`, body: escalation.body, href: `/maintenance/${caseRecord.id}`, requiresAcknowledgment: true }).onConflictDoNothing().returning({ id: userNotifications.id });
          if (!inserted.length) continue;
          createdForCase = true;
          result.escalationsCreated += 1;
          await db.insert(notificationOutbox).values({ eventKey, recipientUserId: recipient.id, recipientEmail: recipient.email, urgency: "critical", subject: `${escalation.title} - ${vehicleCode}`, templateKey: "safety_case_escalation", payload: { safetyCaseId: caseRecord.id, vehicleCode, caseStatus: caseRecord.status, action: "escalated", actionBy: "System", note: escalation.body, notificationBody: escalation.body } }).onConflictDoNothing();
        }
        if (createdForCase) {
          await db.insert(safetyCaseEvents).values({ safetyCaseId: caseRecord.id, action: "escalated", fromStatus: caseRecord.status, toStatus: caseRecord.status, note: escalation.body, metadata: { escalation: escalation.key, repeatBucket: escalation.repeatBucket ?? null, policyPriority: policy.priority } });
          await db.insert(auditEvents).values({ eventType: "safety_case.escalated", entityType: "safety_case", entityId: caseRecord.id, metadata: { escalation: escalation.key, eventKey, recipients: recipientMap.size } });
        }
      }
    }
    return result;
  } finally {
    await lockClient.query("select pg_advisory_unlock($1)", [escalationLockKey]).catch(() => undefined);
    lockClient.release();
  }
}
