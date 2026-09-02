import { InspectionSubmissionError, submitInspection } from "@/modules/inspections/service";
import { hasSameOrigin, sameOriginError } from "@/lib/http-security";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const maximumJsonBytes = 512 * 1024;

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return sameOriginError();
  const rateLimit = await enforceRateLimit(request, "inspection.submit", 60, 600);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumJsonBytes) {
    return Response.json({ error: "The inspection payload is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  try {
    const result = await submitInspection(body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof InspectionSubmissionError) {
      return Response.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }
    throw error;
  }
}
