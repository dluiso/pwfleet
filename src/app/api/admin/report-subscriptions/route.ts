import { readAdministrativeJson } from "@/lib/admin-api";
import { reportErrorResponse } from "@/modules/reports/api";
import { createReportSubscription } from "@/modules/reports/subscriptions";

export async function POST(request: Request) {
  const body = await readAdministrativeJson(request);
  if (body instanceof Response) return body;
  try { return Response.json(await createReportSubscription(body), { status: 201 }); } catch (error) { return reportErrorResponse(error); }
}
