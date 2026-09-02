import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { retireVehicleDocument } from "@/modules/fleet/vehicle-documents";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  try {
    const { id, attachmentId } = await context.params;
    return Response.json(await retireVehicleDocument(id, attachmentId, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
