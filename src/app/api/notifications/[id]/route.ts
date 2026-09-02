import { readAdministrativeJson } from "@/lib/admin-api";
import { notificationErrorResponse } from "@/modules/notifications/api";
import { updateUserNotification } from "@/modules/notifications/service";

export async function PATCH(request: Request, context: RouteContext<"/api/notifications/[id]">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return Response.json(await updateUserNotification(id, body));
  } catch (error) {
    return notificationErrorResponse(error);
  }
}
