import { administrativeErrorResponse } from "@/lib/admin-api";
import { hasSameOrigin, sameOriginError } from "@/lib/http-security";
import { uploadVehicleDocument } from "@/modules/fleet/vehicle-documents";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { enforceActorRateLimit } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";
import { acquireUploadProcessingLease } from "@/lib/upload-admission";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) return sameOriginError();
  try {
    const actor = await requirePermission("fleet:write");
    const rateLimit = await enforceRateLimit(request, "vehicle_document.upload", 20, 600);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const actorLimit = await enforceActorRateLimit(actor.id, "upload.actor.daily", getEnvironment().UPLOAD_USER_DAILY_LIMIT, 86_400);
    if (!actorLimit.allowed) return rateLimitResponse(actorLimit);
    const { id } = await context.params;
    const releaseUploadSlot = await acquireUploadProcessingLease();
    try {
      return Response.json(await uploadVehicleDocument(id, await request.formData()), { status: 201 });
    } finally {
      releaseUploadSlot();
    }
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
