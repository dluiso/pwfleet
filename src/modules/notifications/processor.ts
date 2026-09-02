import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, lt, lte, or } from "drizzle-orm";
import type { Transporter } from "nodemailer";
import { db, pool } from "@/db/client";
import { notificationOutbox, reportArtifacts, reportDeliveries } from "@/db/schema";
import { getEnvironment } from "@/lib/env";
import { buildInspectionEmail, createSmtpTransport } from "./email";

const workerLockKey = 1_938_220_419;

function safeFailureCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return `Delivery failed (${String(error.code).slice(0, 40)}).`;
  }
  return "Delivery failed. Review the mail service logs.";
}

async function deliverOne(
  item: typeof notificationOutbox.$inferSelect,
  transporter: Transporter | null,
) {
  const env = getEnvironment();
  async function updateReportDelivery(status: "captured" | "sent" | "failed" | "dead_letter", lastError: string | null, sentAt: Date | null) {
    await db.update(reportDeliveries).set({ status, lastError, sentAt, updatedAt: new Date() }).where(eq(reportDeliveries.notificationOutboxId, item.id));
  }
  async function recordFailure(lastError: string) {
    const attemptCount = item.attemptCount + 1;
    const deadLetter = attemptCount >= env.EMAIL_MAX_ATTEMPTS;
    const now = new Date();
    const nextAttemptAt = new Date(now.getTime() + env.EMAIL_RETRY_BASE_MINUTES * (2 ** Math.max(0, attemptCount - 1)) * 60_000);
    await db.update(notificationOutbox).set({ status: deadLetter ? "dead_letter" : "failed", attemptCount, lastError, nextAttemptAt, deadLetteredAt: deadLetter ? now : null }).where(eq(notificationOutbox.id, item.id));
    await updateReportDelivery(deadLetter ? "dead_letter" : "failed", lastError, null);
    return deadLetter ? "deadLetter" as const : "failed" as const;
  }
  if (!item.recipientEmail) {
    return recordFailure("Recipient email is missing.");
  }

  const content = buildInspectionEmail({
    templateKey: item.templateKey,
    subject: item.subject,
    payload: item.payload,
  });

  let reportAttachment: { filename: string; content: Buffer; contentType: string } | undefined;
  const reportArtifactId = typeof item.payload.reportArtifactId === "string" ? item.payload.reportArtifactId : null;
  if (reportArtifactId) {
    try {
      const [artifact] = await db.select().from(reportArtifacts).where(eq(reportArtifacts.id, reportArtifactId)).limit(1);
      if (!artifact) throw new Error("Report artifact metadata is unavailable.");
      const root = path.resolve(env.FILE_STORAGE_ROOT);
      const artifactPath = path.resolve(root, artifact.storageKey);
      if (!artifactPath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid report artifact path.");
      reportAttachment = { filename: artifact.filename, content: await fs.readFile(artifactPath), contentType: artifact.mimeType };
    } catch {
      const lastError = "Report artifact is unavailable.";
      return recordFailure(lastError);
    }
  }

  if (env.EMAIL_MODE === "capture") {
    const sentAt = new Date();
    await db
      .update(notificationOutbox)
      .set({
        status: "captured",
        attemptCount: item.attemptCount + 1,
        lastError: null,
        sentAt,
        deadLetteredAt: null,
      })
      .where(eq(notificationOutbox.id, item.id));
    await updateReportDelivery("captured", null, sentAt);
    return "captured" as const;
  }

  if (!transporter || !env.EMAIL_FROM) {
    throw new Error("SMTP transport is unavailable despite SMTP mode.");
  }

  try {
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: item.recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
      messageId: `<${item.id}@${os.hostname().replace(/[^a-zA-Z0-9.-]/g, "-")}>`,
      headers: {
        "X-Harvey-PW-Event": item.eventKey,
        ...(item.urgency === "critical" ? { "X-Priority": "1", Importance: "high" } : {}),
      },
      ...(reportAttachment ? { attachments: [reportAttachment] } : {}),
    });
    const sentAt = new Date();
    await db
      .update(notificationOutbox)
      .set({ status: "sent", attemptCount: item.attemptCount + 1, lastError: null, sentAt, deadLetteredAt: null })
      .where(eq(notificationOutbox.id, item.id));
    await updateReportDelivery("sent", null, sentAt);
    return "sent" as const;
  } catch (error) {
    const lastError = safeFailureCode(error);
    return recordFailure(lastError);
  }
}

export async function processPendingNotifications(limit = 50) {
  const lockClient = await pool.connect();
  const result = { processed: 0, captured: 0, sent: 0, failed: 0, deadLetter: 0, skipped: false };
  try {
    const lock = await lockClient.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock($1) as acquired",
      [workerLockKey],
    );
    if (!lock.rows[0]?.acquired) return { ...result, skipped: true };

    const pending = await db
      .select()
      .from(notificationOutbox)
      .where(or(
        eq(notificationOutbox.status, "pending"),
        and(eq(notificationOutbox.status, "failed"), lt(notificationOutbox.attemptCount, getEnvironment().EMAIL_MAX_ATTEMPTS), lte(notificationOutbox.nextAttemptAt, new Date())),
      ))
      .orderBy(asc(notificationOutbox.createdAt))
      .limit(Math.min(Math.max(limit, 1), 250));
    const transporter = createSmtpTransport();

    for (const item of pending) {
      const status = await deliverOne(item, transporter);
      result.processed += 1;
      result[status] += 1;
    }
    return result;
  } finally {
    await lockClient.query("select pg_advisory_unlock($1)", [workerLockKey]).catch(() => undefined);
    lockClient.release();
  }
}
