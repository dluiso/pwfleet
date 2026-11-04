import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { importVehicles } from "@/modules/administration/service";

export async function POST(request: Request) {
  const body = await readAdministrativeJson(request, 1024 * 1024);
  if (body instanceof Response) return body;
  try {
    return Response.json(await importVehicles(body), { status: 201 });
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
