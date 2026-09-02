import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getEnvironment } from "@/lib/env";
import { sessionCookieName, sessionCookieOptions } from "@/lib/session";
import { validateActiveSessionToken } from "@/lib/session-auth";

const publicPaths = ["/auth/", "/api/health", "/api/live", "/api/ready"];

function isPublic(pathname: string): boolean {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(path));
}

function continueWithCsp(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: http:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export async function proxy(request: NextRequest) {
  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();
  const env = getEnvironment();
  if (env.AUTH_MODE === "development") return continueWithCsp(request);
  const token = request.cookies.get(sessionCookieName())?.value;
  try {
    if (!token) throw new Error("Missing session");
    await validateActiveSessionToken(token);
    return continueWithCsp(request);
  } catch {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Authentication is required." }, { status: 401 });
      response.cookies.set(sessionCookieName(), "", sessionCookieOptions(0));
      return response;
    }
    const login = new URL("/auth/login", env.APP_BASE_URL);
    login.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(login);
    response.cookies.set(sessionCookieName(), "", sessionCookieOptions(0));
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
