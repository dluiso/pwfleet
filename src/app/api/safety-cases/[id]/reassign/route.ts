import { readAdministrativeJson } from "@/lib/admin-api";
import { maintenanceWorkflowErrorResponse } from "@/modules/maintenance/api";
import { reassignMaintenanceCase } from "@/modules/maintenance/service";

export async function POST(request: Request, context: RouteContext<"/api/safety-cases/[id]/reassign">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await reassignMaintenanceCase(id, body));
  } catch (error) {
    return maintenanceWorkflowErrorResponse(error);
  }
}
