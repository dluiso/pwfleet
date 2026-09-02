import { readAdministrativeJson } from "@/lib/admin-api";
import { maintenanceWorkflowErrorResponse } from "@/modules/maintenance/api";
import { deleteMaintenanceWorkEntry } from "@/modules/maintenance/service";

export async function DELETE(request: Request, context: RouteContext<"/api/safety-cases/[id]/work-entries/[entryId]">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id, entryId } = await context.params;
  try {
    return Response.json(await deleteMaintenanceWorkEntry(id, entryId, body));
  } catch (error) {
    return maintenanceWorkflowErrorResponse(error);
  }
}
