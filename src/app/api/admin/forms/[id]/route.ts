import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { deleteDraftInspectionTemplate, saveDraftTemplateDefinition } from "@/modules/administration/service";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/forms/[id]">,
) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await saveDraftTemplateDefinition(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/admin/forms/[id]">,
) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await deleteDraftInspectionTemplate(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
