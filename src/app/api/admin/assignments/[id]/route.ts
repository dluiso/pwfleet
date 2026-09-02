import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { endInspectionAssignment } from "@/modules/administration/service";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/assignments/[id]">,
) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await endInspectionAssignment(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
