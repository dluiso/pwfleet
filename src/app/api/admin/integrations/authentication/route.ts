import { readAdministrativeJson } from "@/lib/admin-api";
import { integrationSettingsErrorResponse, updateAuthenticationIntegration } from "@/modules/integrations/settings";

export async function PATCH(request: Request) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  try {
    return Response.json(await updateAuthenticationIntegration(body));
  } catch (error) {
    return integrationSettingsErrorResponse(error);
  }
}
