import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("encrypted authentication sessions", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("APP_TIME_ZONE", "America/Chicago");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("DATABASE_POOL_MAX", "1");
    vi.stubEnv("DATABASE_SSL_MODE", "disable");
    vi.stubEnv("AUTH_MODE", "oidc");
    vi.stubEnv("OIDC_ISSUER", "https://identity.example.gov");
    vi.stubEnv("OIDC_CLIENT_ID", "fleet-client");
    vi.stubEnv("OIDC_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("OIDC_CLIENT_AUTH_METHOD", "client_secret_basic");
    vi.stubEnv("OIDC_SCOPES", "openid profile email");
    vi.stubEnv("OIDC_CLOCK_TOLERANCE_SECONDS", "30");
    vi.stubEnv("AUTH_SECRET", "test-only-auth-secret-with-at-least-32-characters");
    vi.stubEnv("SESSION_MAX_AGE_MINUTES", "480");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    vi.stubEnv("EMAIL_MODE", "capture");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("FILE_STORAGE_ROOT", "/tmp/fleet-test");
    vi.stubEnv("UPLOAD_MAX_BYTES", "10485760");
    vi.stubEnv("UPLOAD_USER_DAILY_LIMIT", "20");
    vi.stubEnv("UPLOAD_PROCESSING_CONCURRENCY", "2");
    vi.stubEnv("UPLOAD_PROCESSING_QUEUE_LIMIT", "4");
    vi.stubEnv("STORAGE_MIN_FREE_BYTES", "0");
    vi.stubEnv("FILE_SCANNING_MODE", "disabled");
    vi.stubEnv("REPORT_ARTIFACT_RETENTION_DAYS", "365");
    vi.stubEnv("REPORT_MAX_ROWS", "25000");
    vi.stubEnv("REPORT_PDF_DETAIL_ROW_LIMIT", "2000");
    vi.stubEnv("REPORT_RENDER_CONCURRENCY", "2");
    vi.stubEnv("REPORT_RENDER_QUEUE_LIMIT", "4");
    vi.stubEnv("EMAIL_MAX_ATTEMPTS", "5");
    vi.stubEnv("EMAIL_RETRY_BASE_MINUTES", "5");
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("round-trips an encrypted session and rejects tampering", async () => {
    const { createSessionToken, readSessionToken } = await import("./session");
    const token = await createSessionToken({ sessionId: "f3115316-b95d-463d-a2cf-94145af247dc", userId: "4f9d9c6b-86ae-4b6e-9ae6-3b7d4994945f", email: "driver@example.gov", displayName: "Driver One", oidcSubject: "provider-subject", oidcIssuer: "https://identity.example.gov" });
    await expect(readSessionToken(token)).resolves.toMatchObject({ sessionId: "f3115316-b95d-463d-a2cf-94145af247dc", email: "driver@example.gov", oidcSubject: "provider-subject", oidcIssuer: "https://identity.example.gov" });
    const index = Math.floor(token.length / 2);
    const tampered = `${token.slice(0, index)}${token[index] === "a" ? "b" : "a"}${token.slice(index + 1)}`;
    await expect(readSessionToken(tampered)).rejects.toThrow();
  });

  it("round-trips a short-lived PKCE transaction and constrains return paths", async () => {
    const { createOidcTransactionToken, readOidcTransactionToken, sanitizeReturnTo } = await import("./session");
    const transaction = { state: "state-value", nonce: "nonce-value", codeVerifier: "verifier-value", returnTo: "/vehicles/123?tab=history" };
    const token = await createOidcTransactionToken(transaction);
    await expect(readOidcTransactionToken(token)).resolves.toEqual(transaction);
    expect(sanitizeReturnTo("//evil.example/path")).toBe("/");
    expect(sanitizeReturnTo("https://evil.example/path")).toBe("/");
    expect(sanitizeReturnTo(transaction.returnTo)).toBe(transaction.returnTo);
  });

  it("uses production-safe __Host cookie attributes for creation and deletion", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://fleet.example.gov");
    vi.stubEnv("DATABASE_SSL_MODE", "require");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    vi.stubEnv("FILE_SCANNING_MODE", "clamav");
    vi.stubEnv("CLAMAV_HOST", "clamav");
    vi.stubEnv("CLAMAV_PORT", "3310");
    const { sessionCookieOptions, transactionCookieOptions } = await import("./session");
    expect(sessionCookieOptions(0)).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    expect(transactionCookieOptions(600)).toMatchObject({ secure: true, path: "/", maxAge: 600 });
  });
});
