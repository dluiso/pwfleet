import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, authSessions, reportArtifacts } from "@/db/schema";
import { getEnvironment } from "./env";

function resolveStoredFile(storageKey: string): string | null {
  const root = path.resolve(getEnvironment().FILE_STORAGE_ROOT);
  const target = path.resolve(root, storageKey);
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

export async function enforceStorageRetention(now = new Date()) {
  await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
  const orphanCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [expiredReports, orphanedUploads] = await Promise.all([
    db.select({ id: reportArtifacts.id, storageKey: reportArtifacts.storageKey }).from(reportArtifacts).where(and(lt(reportArtifacts.expiresAt, now), isNull(reportArtifacts.purgedAt))).limit(500),
    db.select({ id: attachments.id, storageKey: attachments.storageKey, status: attachments.status }).from(attachments).where(and(inArray(attachments.status, ["pending", "purging"]), lt(attachments.createdAt, orphanCutoff))).limit(500),
  ]);
  let reportFilesPurged = 0;
  for (const artifact of expiredReports) {
    const target = resolveStoredFile(artifact.storageKey);
    if (!target) continue;
    await fs.unlink(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await db.update(reportArtifacts).set({ purgedAt: now }).where(and(eq(reportArtifacts.id, artifact.id), isNull(reportArtifacts.purgedAt)));
    reportFilesPurged += 1;
  }
  let orphanedUploadsPurged = 0;
  for (const attachment of orphanedUploads) {
    if (attachment.status === "pending") {
      const [claimed] = await db.update(attachments).set({ status: "purging" }).where(and(eq(attachments.id, attachment.id), eq(attachments.status, "pending"))).returning({ id: attachments.id });
      if (!claimed) continue;
    }
    const target = resolveStoredFile(attachment.storageKey);
    if (!target) continue;
    await fs.unlink(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await db.delete(attachments).where(and(eq(attachments.id, attachment.id), eq(attachments.status, "purging")));
    orphanedUploadsPurged += 1;
  }
  return { reportFilesPurged, orphanedUploadsPurged };
}
