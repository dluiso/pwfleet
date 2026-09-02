import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { createDraftTemplateVersion } from "@/modules/administration/service";

export async function POST(
  request: Request,
  context: RouteContext<"/api/admin/forms/[id]/versions">,
) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await createDraftTemplateVersion(id, body), { status: 201 });
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
