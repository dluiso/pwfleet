import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { authSessions } from "@/db/schema";
import { getEnvironment } from "@/lib/env";
import { hasSameOrigin, sameOriginError } from "@/lib/http-security";
import { discoverOidc } from "@/lib/oidc";
import { readSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/session";
import { getRuntimeAuthenticationConfiguration } from "@/modules/integrations/settings";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return sameOriginError();
  const env = getEnvironment();
  const sessionToken = request.cookies.get(sessionCookieName())?.value;
  let session: Awaited<ReturnType<typeof readSessionToken>> | undefined;
  if (sessionToken) {
    try { session = await readSessionToken(sessionToken); } catch {
      // Invalid or already-expired sessions still receive a local cookie clear.
    }
  }
  if (session) await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, session.sessionId));
  let target = new URL("/auth/login", env.APP_BASE_URL);
  const authentication = env.AUTH_MODE === "development" ? null : await getRuntimeAuthenticationConfiguration();
  if (authentication?.mode === "oidc") {
    try {
      const discovery = await discoverOidc(authentication);
      if (discovery.end_session_endpoint) {
        target = new URL(discovery.end_session_endpoint);
        target.searchParams.set("client_id", authentication.clientId!);
        target.searchParams.set("post_logout_redirect_uri", new URL("/auth/login", env.APP_BASE_URL).toString());
      }
    } catch {
      // Local session termination must still succeed if the provider is unavailable.
    }
  }
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(sessionCookieName(), "", sessionCookieOptions(0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
