import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { updateVehicleClass } from "@/modules/administration/service";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/vehicle-classes/[id]">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await updateVehicleClass(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
