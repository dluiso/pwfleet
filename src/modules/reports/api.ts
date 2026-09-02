import { AuthenticationRequiredError, AuthorizationError } from "@/lib/auth";
import { FleetReportError } from "./fleet-report";
import { ReportRenderCapacityError } from "./render-admission";

export function reportErrorResponse(error: unknown) {
  if (error instanceof FleetReportError) return Response.json({ error: error.message, details: error.details }, { status: error.status });
  if (error instanceof ReportRenderCapacityError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof AuthenticationRequiredError) return Response.json({ error: "Authentication is required." }, { status: 401 });
  if (error instanceof AuthorizationError) return Response.json({ error: "You are not authorized to access this report." }, { status: 403 });
  return Response.json({ error: "The report could not be generated." }, { status: 500 });
}
