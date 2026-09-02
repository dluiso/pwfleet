import { getEnvironment } from "./env";

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(getEnvironment().APP_BASE_URL).origin;
  } catch {
    return false;
  }
}

export function sameOriginError(): Response {
  return Response.json({ error: "The request origin is not allowed." }, { status: 403 });
}

