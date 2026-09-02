import { administrativeErrorResponse, readAdministrativeJson } from "@/lib/admin-api";
import { resetUserIdentityBinding } from "@/modules/administration/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  try {
    const { id } = await context.params;
    return Response.json(await resetUserIdentityBinding(id, body));
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
