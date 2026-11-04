import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attachments,
  inspectionAnswerAttachments,
  inspectionAnswers,
  inspectionSubmissions,
  safetyCaseAttachments,
  safetyCases,
} from "@/db/schema";
import { can, getCurrentActor } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";

async function fileResponse(record: { storageKey: string; mimeType: string }) {
  const root = path.resolve(getEnvironment().FILE_STORAGE_ROOT);
  const filePath = path.resolve(root, record.storageKey);
  if (!filePath.startsWith(`${root}${path.sep}`)) return Response.json({ error: "Attachment not found." }, { status: 404 });

  try {
    const bytes = await fs.readFile(filePath);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": record.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Attachment file is unavailable." }, { status: 404 });
  }
}

export async function GET(_request: Request, context: RouteContext<"/api/attachments/[id]">) {
  const actor = await getCurrentActor();
  const { id } = await context.params;
  const [inspectionRecord] = await db
    .select({
      storageKey: attachments.storageKey,
      mimeType: attachments.mimeType,
      inspectorUserId: inspectionSubmissions.inspectorUserId,
    })
    .from(attachments)
    .innerJoin(inspectionAnswerAttachments, eq(attachments.id, inspectionAnswerAttachments.attachmentId))
    .innerJoin(inspectionAnswers, eq(inspectionAnswerAttachments.inspectionAnswerId, inspectionAnswers.id))
    .innerJoin(inspectionSubmissions, eq(inspectionAnswers.submissionId, inspectionSubmissions.id))
    .where(eq(attachments.id, id))
    .limit(1);

  if (inspectionRecord) {
    if (!can(actor, "reports:read") && inspectionRecord.inspectorUserId !== actor.id) {
      return Response.json({ error: "Attachment not found." }, { status: 404 });
    }
    return fileResponse(inspectionRecord);
  }

  const [record] = await db
    .select({
      storageKey: attachments.storageKey,
      mimeType: attachments.mimeType,
      assignedTechnicianUserId: safetyCases.assignedTechnicianUserId,
    })
    .from(attachments)
    .innerJoin(safetyCaseAttachments, eq(attachments.id, safetyCaseAttachments.attachmentId))
    .innerJoin(safetyCases, eq(safetyCaseAttachments.safetyCaseId, safetyCases.id))
    .where(eq(attachments.id, id))
    .limit(1);

  if (!record) return Response.json({ error: "Attachment not found." }, { status: 404 });
  const mayReview = actor.role === "supervisor" || actor.role === "fleet_manager" || actor.role === "administrator";
  const isAssignedTechnician = actor.role === "maintenance_technician" && record.assignedTechnicianUserId === actor.id;
  if (!mayReview && !isAssignedTechnician) return Response.json({ error: "Attachment not found." }, { status: 404 });
  return fileResponse(record);
}
