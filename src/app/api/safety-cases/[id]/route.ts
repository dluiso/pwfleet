import { readAdministrativeJson } from "@/lib/admin-api";
import { maintenanceWorkflowErrorResponse } from "@/modules/maintenance/api";
import { transitionSafetyCase } from "@/modules/maintenance/service";

export async function POST(
  request: Request,
  context: RouteContext<"/api/safety-cases/[id]">,
) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await transitionSafetyCase(id, body));
  } catch (error) {
    return maintenanceWorkflowErrorResponse(error);
  }
}
