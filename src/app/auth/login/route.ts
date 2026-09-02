import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { authSessions, auditEvents, users } from "@/db/schema";
import { getEnvironment } from "@/lib/env";
import { hasSameOrigin, sameOriginError } from "@/lib/http-security";
import { buildAuthorizationUrl, createAuthorizationTransaction } from "@/lib/oidc";
import { hashLocalPassword, verifyLocalPassword } from "@/lib/password";
import { enforceCredentialRateLimit, enforceRateLimit } from "@/lib/rate-limit";
import { createOidcTransactionToken, createSessionToken, sanitizeReturnTo, sessionCookieName, sessionCookieOptions, transactionCookieName, transactionCookieOptions } from "@/lib/session";
import { getRuntimeAuthenticationConfiguration } from "@/modules/integrations/settings";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(1).max(128),
  returnTo: z.string().max(1000).optional(),
});

const maximumLoginBodyBytes = 4 * 1024;
const dummyPasswordHash = hashLocalPassword(`${crypto.randomBytes(32).toString("base64url")}Aa1!`);

class LoginBodyError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readLoginForm(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") throw new LoginBodyError(415, "Use the sign-in form to submit credentials.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumLoginBodyBytes)) {
    throw new LoginBodyError(413, "The sign-in request is too large.");
  }

  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumLoginBodyBytes) {
      await reader.cancel();
      throw new LoginBodyError(413, "The sign-in request is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parameters = new URLSearchParams(new TextDecoder().decode(body));
  return Object.fromEntries(parameters.entries());
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function loginPage(input: { returnTo: string; email?: string; error?: string }, status = 200): Response {
  const error = input.error ? `<div class="alert" role="alert">${escapeHtml(input.error)}</div>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in | Harvey PW Fleet</title>
<style>:root{color-scheme:light;--ink:#13231f;--muted:#5e706a;--green:#0c4b3e;--green2:#17705b;--line:#d7e1dd;--danger:#9f312c}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(145deg,#eef5f1 0,#f8f7f1 48%,#e2eee8 100%);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.shell{min-height:100vh;display:grid;grid-template-columns:minmax(310px,440px) minmax(0,1fr)}main{display:flex;align-items:center;padding:clamp(24px,6vw,72px);background:#fff;box-shadow:16px 0 50px rgba(18,63,54,.09);z-index:1}.card{width:100%;max-width:360px;margin:auto}.brand{display:flex;align-items:center;gap:12px;margin-bottom:54px}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--green);color:#fff;font-weight:800;letter-spacing:-1px}.brand strong{display:block;font-size:14px}.brand span{display:block;margin-top:2px;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-size:clamp(30px,4vw,42px);letter-spacing:-.04em}p{margin:12px 0 28px;color:var(--muted);line-height:1.55}.field{margin:0 0 18px}label{display:block;margin:0 0 7px;font-size:13px;font-weight:700}input{width:100%;height:48px;border:1px solid var(--line);border-radius:9px;padding:0 13px;background:#fbfcfb;color:var(--ink);font:inherit;outline:none}input:focus{border-color:var(--green2);box-shadow:0 0 0 3px rgba(23,112,91,.14)}button{width:100%;height:50px;margin-top:6px;border:0;border-radius:9px;background:var(--green);color:#fff;font:700 15px inherit;cursor:pointer}button:hover{background:#093e33}.alert{margin:0 0 20px;padding:12px 14px;border:1px solid #edc3c0;border-radius:9px;background:#fff2f1;color:var(--danger);font-size:13px;line-height:1.4}.notice{margin-top:28px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);line-height:1.5}.visual{display:flex;align-items:flex-end;padding:clamp(32px,6vw,80px);background:radial-gradient(circle at 72% 24%,rgba(255,255,255,.18),transparent 30%),linear-gradient(155deg,#0a4b3c,#0c362f);color:#fff}.visual-copy{max-width:650px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#a7d4c5}.visual h2{margin:15px 0 12px;font-size:clamp(34px,5vw,64px);line-height:1.02;letter-spacing:-.055em}.visual p{max-width:540px;margin:0;color:#d1e4dd;font-size:17px}@media(max-width:760px){.shell{display:block}.visual{display:none}main{min-height:100vh;padding:28px 22px}.brand{margin-bottom:44px}}</style></head>
<body><div class="shell"><main><div class="card"><div class="brand"><div class="mark">PW</div><div><strong>City of Harvey</strong><span>Public Works Fleet</span></div></div><h1>Welcome back</h1><p>Sign in to manage vehicle inspections, safety holds, maintenance, and fleet records.</p>${error}<form method="post" action="/auth/login"><input type="hidden" name="returnTo" value="${escapeHtml(input.returnTo)}"><div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" value="${escapeHtml(input.email ?? "")}" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required></div><button type="submit">Sign in securely</button></form><div class="notice">Authorized City of Harvey personnel only. Access and security-relevant activity may be audited.</div></div></main><aside class="visual"><div class="visual-copy"><div class="eyebrow">Fleet operations</div><h2>Every vehicle. Every inspection. One accountable record.</h2><p>Mobile-first daily inspections, configurable safety rules, supervisor review, and auditable fleet history.</p></div></aside></div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" } });
}

export async function GET(request: Request) {
  const env = getEnvironment();
  const authentication = env.AUTH_MODE === "development" ? null : await getRuntimeAuthenticationConfiguration();
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  if (env.AUTH_MODE === "development") return NextResponse.redirect(new URL(returnTo, env.APP_BASE_URL));
  if (authentication!.mode === "local") return loginPage({ returnTo });
  try {
    const rateLimit = await enforceRateLimit(request, "auth.login", 20, 900);
    if (!rateLimit.allowed) return new Response("Too many sign-in attempts. Wait before trying again.", { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rateLimit.retryAfterSeconds) } });
    const transaction = createAuthorizationTransaction();
    const response = NextResponse.redirect(await buildAuthorizationUrl(transaction, authentication!));
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

export async function POST(request: Request) {
  const env = getEnvironment();
  const authentication = env.AUTH_MODE === "development" ? null : await getRuntimeAuthenticationConfiguration();
  if (env.AUTH_MODE === "development" || authentication!.mode !== "local") return new Response("Local password authentication is unavailable.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!hasSameOrigin(request)) return sameOriginError();

  let submitted: z.infer<typeof loginSchema> | undefined;
  let returnTo = "/";
  try {
    const ipLimit = await enforceRateLimit(request, "auth.local.ip", 10, 900);
    if (!ipLimit.allowed) {
      const response = loginPage({ returnTo, error: "Too many sign-in attempts. Wait before trying again." }, 429);
      response.headers.set("Retry-After", String(ipLimit.retryAfterSeconds));
      return response;
    }

    submitted = loginSchema.parse(await readLoginForm(request));
    returnTo = sanitizeReturnTo(submitted.returnTo ?? null);

    const credentialLimit = await enforceCredentialRateLimit(submitted.email, "auth.local.credential", 5, 900);
    if (!credentialLimit.allowed) {
      const response = loginPage({ returnTo, email: submitted.email, error: "Too many sign-in attempts. Wait before trying again." }, 429);
      response.headers.set("Retry-After", String(credentialLimit.retryAfterSeconds));
      return response;
    }

    const [user] = await db.select().from(users).where(and(sql`lower(${users.email}) = ${submitted.email}`, eq(users.active, true))).limit(1);
    const valid = await verifyLocalPassword(submitted.password, user?.localPasswordHash ?? await dummyPasswordHash);
    if (!user || !user.localPasswordHash || !valid) {
      return loginPage({ returnTo, email: submitted.email, error: "The email or password is incorrect." }, 401);
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_MINUTES * 60_000);
    const sessionToken = await createSessionToken({ sessionId, userId: user.id, email: user.email, displayName: user.displayName, authMethod: "local", authVersion: user.recordVersion });
    await db.transaction(async (transaction) => {
      await transaction.insert(authSessions).values({ id: sessionId, userId: user.id, expiresAt });
      await transaction.insert(auditEvents).values({ actorUserId: user.id, eventType: "authentication.login", entityType: "user", entityId: user.id, metadata: { authenticationMethod: "local" } });
    });
    const response = NextResponse.redirect(new URL(returnTo, env.APP_BASE_URL), 303);
    response.cookies.set(sessionCookieName(), sessionToken, sessionCookieOptions(env.SESSION_MAX_AGE_MINUTES * 60));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof LoginBodyError) return loginPage({ returnTo, error: error.message }, error.status);
    if (error instanceof z.ZodError) return loginPage({ returnTo, error: "Enter a valid email address and password." }, 400);
    return loginPage({ returnTo, email: submitted?.email, error: "The sign-in service is temporarily unavailable." }, 503);
  }
}
