import { readAdministrativeJson } from "@/lib/admin-api";
import { maintenanceWorkflowErrorResponse } from "@/modules/maintenance/api";
import { updateMaintenancePolicy } from "@/modules/maintenance/policy";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/maintenance-policies/[priority]">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { priority } = await context.params;
  try {
    return Response.json(await updateMaintenancePolicy(priority, body));
  } catch (error) {
    return maintenanceWorkflowErrorResponse(error);
  }
}
