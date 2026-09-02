import crypto from "node:crypto";
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import { getEnvironment } from "./env";

const tokenIssuer = "harvey-pw-fleet";
const sessionAudience = "fleet-session";
const transactionAudience = "oidc-transaction";

export type FleetSession = {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  oidcSubject: string;
  oidcIssuer: string;
  expiresAt: number;
};

export type OidcTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

function encryptionKey(): Uint8Array {
  const secret = getEnvironment().AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for encrypted sessions.");
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

async function encrypt(payload: JWTPayload, audience: string, expiresIn: string | number | Date, jti: string = crypto.randomUUID()): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuer(tokenIssuer)
    .setAudience(audience)
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(expiresIn)
    .encrypt(encryptionKey());
}

async function decrypt(token: string, audience: string): Promise<JWTPayload> {
  const { payload } = await jwtDecrypt(token, encryptionKey(), {
    issuer: tokenIssuer,
    audience,
    clockTolerance: getEnvironment().OIDC_CLOCK_TOLERANCE_SECONDS,
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  return payload;
}

export function sessionCookieName(): string {
  return getEnvironment().NODE_ENV === "production" ? "__Host-chopw_session" : "chopw_session";
}

export function transactionCookieName(): string {
  return getEnvironment().NODE_ENV === "production" ? "__Host-chopw_oidc" : "chopw_oidc";
}

export function secureCookie(): boolean {
  return getEnvironment().NODE_ENV === "production";
}

export function sessionCookieOptions(maxAge: number) {
  return { httpOnly: true as const, secure: secureCookie(), sameSite: "lax" as const, path: "/", maxAge };
}

export function transactionCookieOptions(maxAge: number) {
  return { httpOnly: true as const, secure: secureCookie(), sameSite: "lax" as const, path: "/", maxAge };
}

export async function createSessionToken(input: Omit<FleetSession, "expiresAt">): Promise<string> {
  const env = getEnvironment();
  return encrypt(
    { sub: input.userId, email: input.email, name: input.displayName, oidc_sub: input.oidcSubject, oidc_iss: input.oidcIssuer },
    sessionAudience,
    `${env.SESSION_MAX_AGE_MINUTES}m`,
    input.sessionId,
  );
}

export async function readSessionToken(token: string): Promise<FleetSession> {
  const payload = await decrypt(token, sessionAudience);
  if (!payload.sub || !payload.jti || typeof payload.email !== "string" || typeof payload.name !== "string" || typeof payload.oidc_sub !== "string" || typeof payload.oidc_iss !== "string" || !payload.exp) {
    throw new Error("The encrypted session payload is incomplete.");
  }
  return { sessionId: payload.jti, userId: payload.sub, email: payload.email, displayName: payload.name, oidcSubject: payload.oidc_sub, oidcIssuer: payload.oidc_iss, expiresAt: payload.exp };
}

export async function createOidcTransactionToken(input: OidcTransaction): Promise<string> {
  return encrypt({ state: input.state, nonce: input.nonce, verifier: input.codeVerifier, return_to: input.returnTo }, transactionAudience, "10m");
}

export async function readOidcTransactionToken(token: string): Promise<OidcTransaction> {
  const payload = await decrypt(token, transactionAudience);
  if (typeof payload.state !== "string" || typeof payload.nonce !== "string" || typeof payload.verifier !== "string" || typeof payload.return_to !== "string") {
    throw new Error("The OIDC transaction payload is incomplete.");
  }
  return { state: payload.state, nonce: payload.nonce, codeVerifier: payload.verifier, returnTo: payload.return_to };
}

export function sanitizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value.slice(0, 1000);
}
