import { AuthenticationRequiredError, AuthorizationError } from "@/lib/auth";
import { MaintenanceWorkflowError } from "./service";

export function maintenanceWorkflowErrorResponse(error: unknown): Response {
  if (error instanceof MaintenanceWorkflowError) {
    return Response.json({ error: error.message, details: error.details }, { status: error.status });
  }
  if (error instanceof AuthenticationRequiredError) {
    return Response.json({ error: "Authentication is required." }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: "You are not authorized to perform this operation." }, { status: 403 });
  }
  return Response.json({ error: "The safety-case operation could not be completed." }, { status: 500 });
}
