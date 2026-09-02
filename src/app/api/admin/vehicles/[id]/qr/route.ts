import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { rotateVehicleQr } from "@/modules/administration/service";

export async function POST(request: Request, context: RouteContext<"/api/admin/vehicles/[id]/qr">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await rotateVehicleQr(id, body), { status: 201 });
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
