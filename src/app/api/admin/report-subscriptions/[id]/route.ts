import { readAdministrativeJson } from "@/lib/admin-api";
import { reportErrorResponse } from "@/modules/reports/api";
import { updateReportSubscription } from "@/modules/reports/subscriptions";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/report-subscriptions/[id]">) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try { return Response.json(await updateReportSubscription(id, body)); } catch (error) { return reportErrorResponse(error); }
}
