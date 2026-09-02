import { readAdministrativeJson } from "@/lib/admin-api";
import { notificationErrorResponse } from "@/modules/notifications/api";
import { markAllNotificationsRead } from "@/modules/notifications/service";

export async function POST(request: Request) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  try {
    return Response.json(await markAllNotificationsRead());
  } catch (error) {
    return notificationErrorResponse(error);
  }
}
