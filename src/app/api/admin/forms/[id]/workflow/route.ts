import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { transitionTemplateWorkflow } from "@/modules/administration/service";

export async function POST(
  request: Request,
  context: RouteContext<"/api/admin/forms/[id]/workflow">,
) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await transitionTemplateWorkflow(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
