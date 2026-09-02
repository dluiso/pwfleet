import { afterEach, describe, expect, it, vi } from "vitest";

describe("environment security policy", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("rejects the development identity bypass in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://fleet.example.gov");
    vi.stubEnv("APP_TIME_ZONE", "America/Chicago");
    vi.stubEnv("DATABASE_URL", "postgresql://db.example.gov/fleet");
    vi.stubEnv("DATABASE_POOL_MAX", "10");
    vi.stubEnv("DATABASE_SSL_MODE", "require");
    vi.stubEnv("AUTH_MODE", "development");
    vi.stubEnv("DEV_ACTOR_EMAIL", "local@example.invalid");
    vi.stubEnv("OIDC_CLIENT_AUTH_METHOD", "client_secret_basic");
    vi.stubEnv("OIDC_SCOPES", "openid profile email");
    vi.stubEnv("OIDC_CLOCK_TOLERANCE_SECONDS", "30");
    vi.stubEnv("SESSION_MAX_AGE_MINUTES", "480");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    vi.stubEnv("EMAIL_MODE", "capture");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("FILE_STORAGE_ROOT", "/srv/fleet/uploads");
    vi.stubEnv("UPLOAD_MAX_BYTES", "10485760");
    vi.stubEnv("UPLOAD_USER_DAILY_LIMIT", "20");
    vi.stubEnv("UPLOAD_PROCESSING_CONCURRENCY", "2");
    vi.stubEnv("UPLOAD_PROCESSING_QUEUE_LIMIT", "4");
    vi.stubEnv("STORAGE_MIN_FREE_BYTES", "1073741824");
    vi.stubEnv("FILE_SCANNING_MODE", "clamav");
    vi.stubEnv("CLAMAV_HOST", "clamav");
    vi.stubEnv("CLAMAV_PORT", "3310");
    vi.stubEnv("REPORT_ARTIFACT_RETENTION_DAYS", "365");
    vi.stubEnv("REPORT_MAX_ROWS", "25000");
    vi.stubEnv("REPORT_PDF_DETAIL_ROW_LIMIT", "2000");
    vi.stubEnv("REPORT_RENDER_CONCURRENCY", "2");
    vi.stubEnv("REPORT_RENDER_QUEUE_LIMIT", "4");
    vi.stubEnv("EMAIL_MAX_ATTEMPTS", "5");
    vi.stubEnv("EMAIL_RETRY_BASE_MINUTES", "5");

    const { getEnvironment } = await import("./env");
    expect(() => getEnvironment()).toThrow(/forbids the development identity bypass/);
  });

  it("requires HTTPS for production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://fleet.example.gov");
    vi.stubEnv("APP_TIME_ZONE", "America/Chicago");
    vi.stubEnv("DATABASE_URL", "postgresql://db.example.gov/fleet");
    vi.stubEnv("DATABASE_POOL_MAX", "10");
    vi.stubEnv("DATABASE_SSL_MODE", "require");
    vi.stubEnv("AUTH_MODE", "oidc");
    vi.stubEnv("OIDC_ISSUER", "https://identity.example.gov");
    vi.stubEnv("OIDC_CLIENT_ID", "client-id");
    vi.stubEnv("OIDC_CLIENT_SECRET", "not-a-real-secret");
    vi.stubEnv("AUTH_SECRET", "not-a-real-secret-that-is-at-least-32-characters");
    vi.stubEnv("OIDC_CLIENT_AUTH_METHOD", "client_secret_basic");
    vi.stubEnv("OIDC_SCOPES", "openid profile email");
    vi.stubEnv("OIDC_CLOCK_TOLERANCE_SECONDS", "30");
    vi.stubEnv("SESSION_MAX_AGE_MINUTES", "480");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    vi.stubEnv("EMAIL_MODE", "capture");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("FILE_STORAGE_ROOT", "/srv/fleet/uploads");
    vi.stubEnv("UPLOAD_MAX_BYTES", "10485760");
    vi.stubEnv("UPLOAD_USER_DAILY_LIMIT", "20");
    vi.stubEnv("UPLOAD_PROCESSING_CONCURRENCY", "2");
    vi.stubEnv("UPLOAD_PROCESSING_QUEUE_LIMIT", "4");
    vi.stubEnv("STORAGE_MIN_FREE_BYTES", "1073741824");
    vi.stubEnv("FILE_SCANNING_MODE", "clamav");
    vi.stubEnv("CLAMAV_HOST", "clamav");
    vi.stubEnv("CLAMAV_PORT", "3310");
    vi.stubEnv("REPORT_ARTIFACT_RETENTION_DAYS", "365");
    vi.stubEnv("REPORT_MAX_ROWS", "25000");
    vi.stubEnv("REPORT_PDF_DETAIL_ROW_LIMIT", "2000");
    vi.stubEnv("REPORT_RENDER_CONCURRENCY", "2");
    vi.stubEnv("REPORT_RENDER_QUEUE_LIMIT", "4");
    vi.stubEnv("EMAIL_MAX_ATTEMPTS", "5");
    vi.stubEnv("EMAIL_RETRY_BASE_MINUTES", "5");

    const { getEnvironment } = await import("./env");
    expect(() => getEnvironment()).toThrow(/HTTPS application URL/);
  });

  it("accepts a local ClamAV socket without TCP settings", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("APP_TIME_ZONE", "America/Chicago");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/fleet");
    vi.stubEnv("DATABASE_POOL_MAX", "10");
    vi.stubEnv("DATABASE_SSL_MODE", "disable");
    vi.stubEnv("AUTH_MODE", "development");
    vi.stubEnv("DEV_ACTOR_EMAIL", "local@example.invalid");
    vi.stubEnv("OIDC_CLIENT_AUTH_METHOD", "client_secret_basic");
    vi.stubEnv("OIDC_SCOPES", "openid profile email");
    vi.stubEnv("OIDC_CLOCK_TOLERANCE_SECONDS", "30");
    vi.stubEnv("SESSION_MAX_AGE_MINUTES", "480");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    vi.stubEnv("EMAIL_MODE", "capture");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("FILE_STORAGE_ROOT", "/tmp/fleet/uploads");
    vi.stubEnv("UPLOAD_MAX_BYTES", "10485760");
    vi.stubEnv("UPLOAD_USER_DAILY_LIMIT", "20");
    vi.stubEnv("UPLOAD_PROCESSING_CONCURRENCY", "2");
    vi.stubEnv("UPLOAD_PROCESSING_QUEUE_LIMIT", "4");
    vi.stubEnv("STORAGE_MIN_FREE_BYTES", "1073741824");
    vi.stubEnv("FILE_SCANNING_MODE", "clamav");
    vi.stubEnv("CLAMAV_SOCKET_PATH", "/run/clamav/clamd.ctl");
    vi.stubEnv("REPORT_ARTIFACT_RETENTION_DAYS", "365");
    vi.stubEnv("REPORT_MAX_ROWS", "25000");
    vi.stubEnv("REPORT_PDF_DETAIL_ROW_LIMIT", "2000");
    vi.stubEnv("REPORT_RENDER_CONCURRENCY", "2");
    vi.stubEnv("REPORT_RENDER_QUEUE_LIMIT", "4");
    vi.stubEnv("EMAIL_MAX_ATTEMPTS", "5");
    vi.stubEnv("EMAIL_RETRY_BASE_MINUTES", "5");

    const { getEnvironment } = await import("./env");
    expect(getEnvironment().CLAMAV_SOCKET_PATH).toBe("/run/clamav/clamd.ctl");
  });
});
