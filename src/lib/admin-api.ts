import { AuthenticationRequiredError, AuthorizationError } from "@/lib/auth";
import { hasSameOrigin, sameOriginError } from "@/lib/http-security";
import { UploadCapacityError } from "@/lib/upload-admission";
import { AdministrationError } from "@/modules/administration/service";
import { VehicleDocumentError } from "@/modules/fleet/vehicle-documents";

const maximumJsonBytes = 128 * 1024;

export async function readAdministrativeJson(request: Request): Promise<unknown | Response> {
  if (!hasSameOrigin(request)) return sameOriginError();
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > maximumJsonBytes) {
    return Response.json({ error: "The request payload is too large." }, { status: 413 });
  }
  try {
    return await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }
}

export function administrativeErrorResponse(error: unknown): Response {
  if (error instanceof UploadCapacityError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AdministrationError || error instanceof VehicleDocumentError) {
    return Response.json({ error: error.message, details: error.details }, { status: error.status });
  }
  if (error instanceof AuthenticationRequiredError) {
    return Response.json({ error: "Authentication is required." }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: "You are not authorized to perform this operation." }, { status: 403 });
  }
  return Response.json({ error: "The administrative operation could not be completed." }, { status: 500 });
}
