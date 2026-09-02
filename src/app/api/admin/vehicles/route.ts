import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { createVehicle } from "@/modules/administration/service";

export async function POST(request: Request) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  try {
    return Response.json(await createVehicle(body), { status: 201 });
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
