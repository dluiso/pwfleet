import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { deleteUser, updateUser } from "@/modules/administration/service";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await updateUser(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await deleteUser(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
