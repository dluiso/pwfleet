import { NextResponse } from "next/server";
import { buildAuthorizationUrl, createAuthorizationTransaction } from "@/lib/oidc";
import { createOidcTransactionToken, sanitizeReturnTo, transactionCookieName, transactionCookieOptions } from "@/lib/session";
import { getEnvironment } from "@/lib/env";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const env = getEnvironment();
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  if (env.AUTH_MODE === "development") return NextResponse.redirect(new URL(returnTo, env.APP_BASE_URL));
  try {
    const rateLimit = await enforceRateLimit(request, "auth.login", 20, 900);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const transaction = createAuthorizationTransaction();
    const response = NextResponse.redirect(await buildAuthorizationUrl(transaction));
    response.cookies.set(transactionCookieName(), await createOidcTransactionToken({
      state: transaction.state,
      nonce: transaction.nonce,
      codeVerifier: transaction.codeVerifier,
      returnTo,
    }), transactionCookieOptions(600));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return new Response("Authentication service is temporarily unavailable.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
