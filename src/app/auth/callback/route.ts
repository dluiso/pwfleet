import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { authSessions, auditEvents, users } from "@/db/schema";
import { getEnvironment } from "@/lib/env";
import { exchangeAuthorizationCode, identityFromClaims, verifyIdToken } from "@/lib/oidc";
import { createSessionToken, readOidcTransactionToken, sessionCookieName, sessionCookieOptions, transactionCookieName, transactionCookieOptions } from "@/lib/session";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getRuntimeAuthenticationConfiguration } from "@/modules/integrations/settings";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function errorResponse(message: string, status: number, clearTransaction = true) {
  const response = new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (clearTransaction) response.cookies.set(transactionCookieName(), "", transactionCookieOptions(0));
  return response;
}

export async function GET(request: NextRequest) {
  const env = getEnvironment();
  const authentication = await getRuntimeAuthenticationConfiguration();
  if (authentication.mode !== "oidc") return NextResponse.redirect(new URL("/", env.APP_BASE_URL));
  const rateLimit = await enforceRateLimit(request, "auth.callback", 30, 900);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const url = request.nextUrl;
  if (url.searchParams.has("error")) return errorResponse("Authentication was not completed.", 401);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const transactionToken = request.cookies.get(transactionCookieName())?.value;
  if (!code || !state || !transactionToken) return errorResponse("The authentication response is incomplete or expired.", 400);
  try {
    const transaction = await readOidcTransactionToken(transactionToken);
    if (!safeEqual(state, transaction.state)) return errorResponse("The authentication response could not be validated.", 400);
    const idToken = await exchangeAuthorizationCode(code, transaction.codeVerifier, authentication);
    const identity = identityFromClaims(await verifyIdToken(idToken, transaction.nonce, authentication));
    const user = await db.transaction(async (transactionDb) => {
      const [boundCandidate] = await transactionDb
        .select()
        .from(users)
        .where(and(eq(users.oidcIssuer, authentication.issuer!), eq(users.oidcSubject, identity.subject), eq(users.active, true)))
        .for("update")
        .limit(1);
      if (boundCandidate) return boundCandidate;
      if (!identity.emailVerified || !identity.email) return null;
      const [candidate] = await transactionDb
        .select()
        .from(users)
        .where(and(sql`lower(${users.email}) = ${identity.email}`, eq(users.active, true)))
        .for("update")
        .limit(1);
      if (!candidate) return null;
      if ((candidate.oidcIssuer && candidate.oidcIssuer !== authentication.issuer) || (candidate.oidcSubject && candidate.oidcSubject !== identity.subject)) return null;
      if (!candidate.oidcSubject) {
        const [bound] = await transactionDb
          .update(users)
          .set({ oidcIssuer: authentication.issuer, oidcSubject: identity.subject, identityBoundAt: new Date(), recordVersion: candidate.recordVersion + 1, updatedAt: new Date() })
          .where(eq(users.id, candidate.id))
          .returning();
        await transactionDb.insert(auditEvents).values({ actorUserId: candidate.id, eventType: "authentication.identity_bound", entityType: "user", entityId: candidate.id, metadata: { providerSubjectHash: crypto.createHash("sha256").update(identity.subject).digest("hex") } });
        return bound!;
      }
      return candidate;
    });
    if (!user) return errorResponse("Your identity is valid, but it has not been authorized for Harvey PW Fleet. Contact an administrator.", 403);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_MINUTES * 60_000);
    const sessionToken = await createSessionToken({ sessionId, userId: user.id, email: user.email, displayName: user.displayName, authMethod: "oidc", oidcSubject: identity.subject, oidcIssuer: authentication.issuer! });
    await db.insert(authSessions).values({ id: sessionId, userId: user.id, expiresAt });
    await db.insert(auditEvents).values({ actorUserId: user.id, eventType: "authentication.login", entityType: "user", entityId: user.id, metadata: { providerSubjectHash: crypto.createHash("sha256").update(identity.subject).digest("hex") } });
    const response = NextResponse.redirect(new URL(transaction.returnTo, env.APP_BASE_URL));
    response.cookies.set(sessionCookieName(), sessionToken, sessionCookieOptions(env.SESSION_MAX_AGE_MINUTES * 60));
    response.cookies.set(transactionCookieName(), "", transactionCookieOptions(0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return errorResponse("Authentication could not be validated. Start a new sign-in attempt.", 401);
  }
}
