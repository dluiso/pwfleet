import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { getEnvironment } from "./env";

const discoverySchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
  end_session_endpoint: z.url().optional(),
  id_token_signing_alg_values_supported: z.array(z.string()).optional(),
});

const tokenResponseSchema = z.object({ id_token: z.string().min(20), access_token: z.string().optional(), token_type: z.string().optional(), expires_in: z.number().optional() });
const safeAlgorithms = new Set(["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"]);
type Discovery = z.infer<typeof discoverySchema>;
let discoveryPromise: Promise<Discovery> | undefined;

async function fetchBoundedJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(7_500), cache: "no-store" });
  if (!response.ok) throw new Error(`OIDC endpoint returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 1_048_576) throw new Error("OIDC response exceeded the maximum accepted size.");
  return JSON.parse(text) as unknown;
}

export async function discoverOidc(): Promise<Discovery> {
  if (!discoveryPromise) {
    discoveryPromise = (async () => {
      const env = getEnvironment();
      const configuredIssuer = env.OIDC_ISSUER!;
      const url = `${configuredIssuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
      const parsed = discoverySchema.parse(await fetchBoundedJson(url));
      if (parsed.issuer !== configuredIssuer) throw new Error("OIDC discovery issuer does not match the configured issuer.");
      if (env.NODE_ENV === "production") {
        for (const endpoint of [parsed.authorization_endpoint, parsed.token_endpoint, parsed.jwks_uri, parsed.end_session_endpoint].filter(Boolean)) {
          if (!endpoint!.startsWith("https://")) throw new Error("Production OIDC endpoints must use HTTPS.");
        }
      }
      return parsed;
    })().catch((error) => {
      discoveryPromise = undefined;
      throw error;
    });
  }
  return discoveryPromise;
}

export function createAuthorizationTransaction() {
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  return {
    state: crypto.randomBytes(32).toString("base64url"),
    nonce: crypto.randomBytes(32).toString("base64url"),
    codeVerifier,
    codeChallenge: crypto.createHash("sha256").update(codeVerifier).digest("base64url"),
  };
}

export async function buildAuthorizationUrl(input: { state: string; nonce: string; codeChallenge: string }): Promise<URL> {
  const env = getEnvironment();
  const discovery = await discoverOidc();
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.OIDC_CLIENT_ID!);
  url.searchParams.set("redirect_uri", new URL("/auth/callback", env.APP_BASE_URL).toString());
  url.searchParams.set("scope", env.OIDC_SCOPES);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<string> {
  const env = getEnvironment();
  const discovery = await discoverOidc();
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: new URL("/auth/callback", env.APP_BASE_URL).toString(),
    client_id: env.OIDC_CLIENT_ID!,
    code_verifier: codeVerifier,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (env.OIDC_CLIENT_AUTH_METHOD === "client_secret_basic") {
    headers.Authorization = `Basic ${Buffer.from(`${env.OIDC_CLIENT_ID}:${env.OIDC_CLIENT_SECRET}`, "utf8").toString("base64")}`;
  } else {
    form.set("client_secret", env.OIDC_CLIENT_SECRET!);
  }
  const parsed = tokenResponseSchema.parse(await fetchBoundedJson(discovery.token_endpoint, { method: "POST", headers, body: form }));
  return parsed.id_token;
}

export async function verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload> {
  const env = getEnvironment();
  const discovery = await discoverOidc();
  const advertised = discovery.id_token_signing_alg_values_supported ?? ["RS256"];
  const algorithms = advertised.filter((algorithm) => safeAlgorithms.has(algorithm));
  if (!algorithms.length) throw new Error("The OIDC provider did not advertise a supported secure ID token algorithm.");
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), { timeoutDuration: 7_500, cooldownDuration: 30_000, cacheMaxAge: 600_000 });
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: env.OIDC_CLIENT_ID,
    algorithms,
    clockTolerance: env.OIDC_CLOCK_TOLERANCE_SECONDS,
    requiredClaims: ["sub", "iat", "exp", "nonce"],
  });
  if (payload.nonce !== expectedNonce) throw new Error("OIDC nonce validation failed.");
  return payload;
}

export function identityFromClaims(payload: JWTPayload): { subject: string; email: string | null; displayName: string; emailVerified: boolean } {
  const emailClaim = payload.email;
  if (!payload.sub) throw new Error("The OIDC identity does not contain a usable subject.");
  const objectId = typeof payload.oid === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.oid)
    ? payload.oid.toLowerCase()
    : null;
  const email = typeof emailClaim === "string" && emailClaim.includes("@") ? emailClaim.trim().toLowerCase().slice(0, 320) : null;
  const displayName = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 160) : email?.split("@")[0] ?? "Authorized user";
  return { subject: objectId ?? payload.sub, email, displayName, emailVerified: Boolean(email && payload.email_verified === true) };
}
