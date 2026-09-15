import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { resetLocalUserPassword } from "@/modules/administration/service";

export async function POST(request: Request, context: RouteContext<"/api/admin/users/[id]/password">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await resetLocalUserPassword(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
