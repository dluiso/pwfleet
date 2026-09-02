import { and, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  attachments,
  auditEvents,
  defects,
  inspectionAnswerAttachments,
  inspectionAnswers,
  inspectionSubmissions,
  notificationOutbox,
  userNotifications,
  safetyCaseEvents,
  safetyCases,
  users,
  vehicleInspectionAssignments,
  vehicleQrCodes,
  vehicles,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { getTemplateDefinition } from "@/modules/fleet/repository";
import {
  evaluateInspection,
  type AnswerInput,
  type OperationalDisposition,
  type RuleInput,
} from "./rules";
import { visibilityConditionMatches } from "./visibility";

const responseSchema = z.union([
  z.string().max(10_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(
    z.object({
      view: z.string().max(40),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      damageType: z.string().max(80),
    }),
  ),
]);

export const submissionRequestSchema = z.object({
  vehicleId: z.uuid(),
  templateId: z.uuid(),
  qrCodeId: z.uuid().optional(),
  odometer: z.number().int().nonnegative().optional(),
  answers: z
    .array(
      z.object({
        itemId: z.uuid(),
        response: responseSchema,
        comment: z.string().trim().max(4_000).optional(),
        photoReferences: z.array(z.uuid()).max(5).optional(),
      }),
    )
    .min(1)
    .max(250),
});

export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

export class InspectionSubmissionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "InspectionSubmissionError";
  }
}

const dispositionRank: Record<OperationalDisposition, number> = {
  cleared: 0,
  cleared_with_advisory: 1,
  inspection_required: 2,
  hold_for_review: 3,
  ready_for_reinspection: 4,
  maintenance_in_progress: 5,
  out_of_service: 6,
};

function moreRestrictiveDisposition(
  current: OperationalDisposition,
  calculated: OperationalDisposition,
): OperationalDisposition {
  return dispositionRank[current] > dispositionRank[calculated] ? current : calculated;
}

function safetyTarget(severity: "none" | "advisory" | "minor" | "major" | "critical") {
  const hours = severity === "critical" ? 4 : severity === "major" || severity === "minor" ? 24 : 72;
  return {
    priority: severity === "critical" ? "critical" as const : severity === "major" || severity === "minor" ? "urgent" as const : "routine" as const,
    targetResolutionAt: new Date(Date.now() + hours * 60 * 60 * 1000),
  };
}

export async function submitInspection(rawInput: unknown) {
  const actor = await requirePermission("inspection:submit");
  const parsed = submissionRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InspectionSubmissionError("The inspection payload is invalid.", 400, parsed.error.flatten());
  }
  const input = parsed.data;

  const today = new Date().toISOString().slice(0, 10);
  const [assignment] = await db
    .select()
    .from(vehicleInspectionAssignments)
    .where(
      and(
        eq(vehicleInspectionAssignments.vehicleId, input.vehicleId),
        eq(vehicleInspectionAssignments.templateId, input.templateId),
        lte(vehicleInspectionAssignments.effectiveFrom, today),
        or(
          isNull(vehicleInspectionAssignments.effectiveUntil),
          gt(vehicleInspectionAssignments.effectiveUntil, today),
        ),
      ),
    )
    .limit(1);
  if (!assignment) {
    throw new InspectionSubmissionError("This inspection is not assigned to the selected vehicle.", 403);
  }

  const template = await getTemplateDefinition(input.templateId);
  if (!template || template.status !== "published") {
    throw new InspectionSubmissionError("The inspection template is not published.", 409);
  }

  const templateItems = template.sections.flatMap((section) => section.items);
  const itemById = new Map(templateItems.map((item) => [item.id, item]));
  const requestByItem = new Map(input.answers.map((answer) => [answer.itemId, answer]));

  const unexpectedItem = input.answers.find((answer) => !itemById.has(answer.itemId));
  if (unexpectedItem) {
    throw new InspectionSubmissionError("The submission contains an item from another template.", 400);
  }

  const responsesByItemKey = new Map<string, unknown>();
  const visibleItems = templateItems.filter((item) => {
    const visible = visibilityConditionMatches(item.visibilityCondition, responsesByItemKey);
    responsesByItemKey.set(item.itemKey, visible ? requestByItem.get(item.id)?.response ?? null : null);
    return visible;
  });
  const visibleItemIds = new Set(visibleItems.map((item) => item.id));
  if (input.answers.some((answer) => !visibleItemIds.has(answer.itemId))) {
    throw new InspectionSubmissionError("The submission contains an answer for a hidden conditional field.", 400);
  }

  const evaluationAnswers: AnswerInput[] = visibleItems.map((item) => {
    const provided = requestByItem.get(item.id);
    return {
      itemId: item.id,
      itemKey: item.itemKey,
      label: item.label,
      required: item.required,
      fieldType: item.fieldType,
      response: provided?.response ?? null,
      comment: provided?.comment,
      photoReferences: provided?.photoReferences,
    };
  });

  const evaluation = evaluateInspection({
    answers: evaluationAnswers,
    rules: template.rules satisfies RuleInput[],
    ruleSetStatus: template.ruleSetStatus,
  });
  if (evaluation.issues.length) {
    throw new InspectionSubmissionError(
      "Complete all required fields and evidence before submitting.",
      422,
      evaluation.issues,
    );
  }

  const attachmentIds = [...new Set(input.answers.flatMap((answer) => answer.photoReferences ?? []))];
  const recipientRoles: Array<typeof users.$inferSelect.role> = ["supervisor", "fleet_manager"];
  if (evaluation.notifyMaintenance) recipientRoles.push("maintenance_technician");
  const recipients = evaluation.notifySupervisor || evaluation.notifyMaintenance
    ? await db
        .select()
        .from(users)
        .where(and(eq(users.active, true), inArray(users.role, recipientRoles)))
    : [];

  return db.transaction(async (transaction) => {
    const [vehicle] = await transaction
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, input.vehicleId))
      .for("update")
      .limit(1);
    if (!vehicle || vehicle.lifecycleStatus !== "active") {
      throw new InspectionSubmissionError("The vehicle is not active or does not exist.", 404);
    }
    if (input.odometer !== undefined && vehicle.currentOdometer !== null && input.odometer < vehicle.currentOdometer) {
      throw new InspectionSubmissionError(`The odometer cannot be lower than the recorded value of ${vehicle.currentOdometer.toLocaleString()}.`, 422);
    }
    const [activeSafetyCase] = await transaction
      .select()
      .from(safetyCases)
      .where(and(eq(safetyCases.vehicleId, vehicle.id), ne(safetyCases.status, "released")))
      .for("update")
      .limit(1);
    if (activeSafetyCase && activeSafetyCase.status !== "awaiting_reinspection") {
      throw new InspectionSubmissionError("This vehicle already has an active safety case. A new inspection is allowed only after maintenance requests reinspection.", 409);
    }
    if (input.qrCodeId) {
      const [qr] = await transaction
        .select({ id: vehicleQrCodes.id })
        .from(vehicleQrCodes)
        .where(and(eq(vehicleQrCodes.id, input.qrCodeId), eq(vehicleQrCodes.vehicleId, vehicle.id), eq(vehicleQrCodes.status, "active")))
        .for("update")
        .limit(1);
      if (!qr) throw new InspectionSubmissionError("The scanned QR code is no longer active for this vehicle.", 422);
    }
    if (attachmentIds.length) {
      const claimed = await transaction
        .update(attachments)
        .set({ status: "linked" })
        .where(and(inArray(attachments.id, attachmentIds), eq(attachments.uploadedByUserId, actor.id), eq(attachments.status, "pending")))
        .returning({ id: attachments.id });
      if (claimed.length !== attachmentIds.length) {
        throw new InspectionSubmissionError("One or more photo references are invalid or already linked.", 422);
      }
    }
    let finalDisposition = moreRestrictiveDisposition(
      vehicle.disposition,
      evaluation.disposition,
    );
    const [submission] = await transaction
      .insert(inspectionSubmissions)
      .values({
        vehicleId: vehicle.id,
        templateId: template.id,
        templateVersion: template.version,
        inspectorUserId: actor.id,
        qrCodeId: input.qrCodeId,
        status: evaluation.requiresSupervisorReview ? "pending_review" : "submitted",
        calculatedSeverity: evaluation.severity,
        calculatedDisposition: finalDisposition,
        odometer: input.odometer,
        submittedAt: new Date(),
      })
      .returning();

    for (const answer of evaluation.answers) {
      const provided = requestByItem.get(answer.itemId);
      const [answerRecord] = await transaction
        .insert(inspectionAnswers)
        .values({
          submissionId: submission!.id,
          inspectionItemId: answer.itemId,
          response: answer.response,
          comment: answer.comment,
          calculatedSeverity: answer.severity,
          appliedRuleId: answer.appliedRuleId,
        })
        .returning({ id: inspectionAnswers.id });

      if (provided?.photoReferences?.length) {
        await transaction.insert(inspectionAnswerAttachments).values(
          provided.photoReferences.map((attachmentId) => ({
            inspectionAnswerId: answerRecord!.id,
            attachmentId,
          })),
        );
      }

      if (answer.createsDefect) {
        await transaction.insert(defects).values({
          vehicleId: vehicle.id,
          submissionId: submission!.id,
          answerId: answerRecord!.id,
          title: answer.label,
          description: answer.comment,
          severity: answer.severity,
          blocksDeparture: answer.blocksDeparture,
          reportedByUserId: actor.id,
        });
      }
    }

    const reinspectionCase = activeSafetyCase?.status === "awaiting_reinspection" ? activeSafetyCase : undefined;
    const hasBlockingDefect = evaluation.blockDeparture;
    if (reinspectionCase) {
      const nextCaseStatus = hasBlockingDefect ? "maintenance_assigned" : "awaiting_release";
      finalDisposition = hasBlockingDefect
        ? moreRestrictiveDisposition("maintenance_in_progress", evaluation.disposition)
        : "ready_for_reinspection";
      await transaction
        .update(safetyCases)
        .set({
          reinspectionSubmissionId: submission!.id,
          status: nextCaseStatus,
          recordVersion: reinspectionCase.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(safetyCases.id, reinspectionCase.id));
      await transaction.insert(safetyCaseEvents).values({
        safetyCaseId: reinspectionCase.id,
        actorUserId: actor.id,
        action: "reinspection_submitted",
        fromStatus: reinspectionCase.status,
        toStatus: nextCaseStatus,
        note: hasBlockingDefect
          ? "The reinspection reported another blocking condition and returned the case to maintenance."
          : "The reinspection reported no blocking defect and is awaiting supervisor release.",
        metadata: { reinspectionSubmissionId: submission!.id, hasBlockingDefect },
      });
    } else if (evaluation.requiresSupervisorReview) {
      const [safetyCase] = await transaction
        .insert(safetyCases)
        .values({
          vehicleId: vehicle.id,
          sourceSubmissionId: submission!.id,
          summary: `${template.name} requires supervisor review`,
          ...safetyTarget(evaluation.severity),
        })
        .returning({ id: safetyCases.id, status: safetyCases.status });
      await transaction.insert(safetyCaseEvents).values({
        safetyCaseId: safetyCase!.id,
        actorUserId: actor.id,
        action: "created",
        toStatus: safetyCase!.status,
        note: "Created automatically from an inspection requiring supervisor review.",
        metadata: { sourceSubmissionId: submission!.id, severity: evaluation.severity },
      });
    }

    await transaction
      .update(vehicles)
      .set({
        disposition: finalDisposition,
        ...(input.odometer !== undefined ? { currentOdometer: input.odometer } : {}),
        recordVersion: sql`${vehicles.recordVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicle.id));

    const displayCode = vehicle.displayCode ?? `Unit ${vehicle.unitNumber}`;
    const eventKey = `inspection:${submission!.id}`;
    const commonPayload = {
      inspectionId: submission!.id,
      vehicleId: vehicle.id,
      vehicleCode: displayCode,
      templateName: template.name,
      severity: evaluation.severity,
      disposition: finalDisposition,
      submittedBy: actor.displayName,
      submittedAt: new Date().toISOString(),
    };

    const notificationRecipients = evaluation.notifyDriver
      ? [actor, ...recipients.filter((recipient) => recipient.id !== actor.id)]
      : recipients;
    for (const recipient of notificationRecipients) {
      const critical = evaluation.severity === "critical";
      const subject = critical
        ? `CRITICAL VEHICLE ALERT - ${displayCode}`
        : `Vehicle inspection review - ${displayCode}`;
      await transaction
        .insert(notificationOutbox)
        .values({
          eventKey,
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          urgency: critical ? "critical" : "normal",
          subject,
          templateKey:
            evaluation.severity === "critical" ? "critical_vehicle_alert" : "inspection_review",
          payload: commonPayload,
        })
        .onConflictDoNothing();
      await transaction.insert(userNotifications).values({
        eventKey,
        userId: recipient.id,
        kind: "inspection",
        urgency: critical ? "critical" : "normal",
        title: subject,
        body: critical
          ? "Do not operate this vehicle. A responsible supervisor must review the inspection and disposition."
          : "An inspection requires operational review before the vehicle status is considered final.",
        href: "/inspections",
        requiresAcknowledgment: critical,
      }).onConflictDoNothing();
    }

    await transaction.insert(auditEvents).values({
      actorUserId: actor.id,
      eventType: "inspection.submitted",
      entityType: "inspection_submission",
      entityId: submission!.id,
      metadata: {
        vehicleId: vehicle.id,
        templateId: template.id,
        templateVersion: template.version,
        severity: evaluation.severity,
        disposition: finalDisposition,
        failSafeRuleUsed: evaluation.usedFailSafeRule,
      },
    });

    return {
      inspectionId: submission!.id,
      severity: evaluation.severity,
      disposition: finalDisposition,
      blockDeparture: evaluation.blockDeparture,
      requiresSupervisorReview: evaluation.requiresSupervisorReview,
      driverMessages: evaluation.driverMessages,
    };
  });
}
