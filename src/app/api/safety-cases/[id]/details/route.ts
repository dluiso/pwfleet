import { readAdministrativeJson } from "@/lib/admin-api";
import { maintenanceWorkflowErrorResponse } from "@/modules/maintenance/api";
import { updateSafetyCaseDetails } from "@/modules/maintenance/service";

export async function PATCH(request: Request, context: RouteContext<"/api/safety-cases/[id]/details">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await updateSafetyCaseDetails(id, body));
  } catch (error) {
    return maintenanceWorkflowErrorResponse(error);
  }
}
