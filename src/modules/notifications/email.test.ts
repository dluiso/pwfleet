import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInspectionEmail, createSmtpTransportForConfiguration } from "./email";

describe("inspection email", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("APP_TIME_ZONE", "America/Chicago");
    vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/test");
    vi.stubEnv("DATABASE_POOL_MAX", "1");
    vi.stubEnv("DATABASE_SSL_MODE", "disable");
    vi.stubEnv("AUTH_MODE", "development");
    vi.stubEnv("DEV_ACTOR_EMAIL", "test@local.invalid");
    vi.stubEnv("OIDC_CLIENT_AUTH_METHOD", "client_secret_basic");
    vi.stubEnv("OIDC_SCOPES", "openid profile email");
    vi.stubEnv("OIDC_CLOCK_TOLERANCE_SECONDS", "30");
    vi.stubEnv("SESSION_MAX_AGE_MINUTES", "480");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    vi.stubEnv("EMAIL_MODE", "capture");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("FILE_STORAGE_ROOT", "./var/test-uploads");
    vi.stubEnv("UPLOAD_MAX_BYTES", "1048576");
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
    vi.unstubAllEnvs();
  });

  it("escapes untrusted values and produces an authenticated report link", () => {
    const email = buildInspectionEmail({
      templateKey: "critical_vehicle_alert",
      subject: "Critical alert",
      payload: {
        inspectionId: "2f0795ef-0ad1-483a-bb8c-a9f5ee8bad33",
        vehicleCode: "<script>alert(1)</script>",
        disposition: "out_of_service",
      },
    });

    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.reportUrl).toBe(
      "http://localhost:3000/api/inspections/2f0795ef-0ad1-483a-bb8c-a9f5ee8bad33/pdf",
    );
    expect(email.text).toContain("Do not operate this vehicle");
  });

  it("renders safety case updates with the controlled release instruction", () => {
    const email = buildInspectionEmail({
      templateKey: "safety_case_update",
      subject: "Safety case updated",
      payload: {
        inspectionId: "2f0795ef-0ad1-483a-bb8c-a9f5ee8bad33",
        vehicleCode: "DT-03",
        caseStatus: "released",
        action: "release_approved",
        actionBy: "Fleet Supervisor",
        note: "Clean reinspection verified.",
      },
    });

    expect(email.text).toContain("approved this vehicle for operation");
    expect(email.text).toContain("Case status: Released");
    expect(email.html).toContain("Clean reinspection verified.");
  });

  it("puts reported defects before routine inspection details", () => {
    const email = buildInspectionEmail({
      templateKey: "inspection_attention",
      subject: "Inspection requires attention",
      payload: {
        inspectionId: "2f0795ef-0ad1-483a-bb8c-a9f5ee8bad33",
        vehicleCode: "DT-04",
        templateName: "Dump Truck Pre-Trip Inspection",
        defects: [{
          title: "Brake system <unsafe>",
          severity: "critical",
          blocksDeparture: true,
          comment: "Air leak detected.",
          photoCount: 2,
        }],
      },
    });

    expect(email.text.indexOf("ATTENTION REQUIRED")).toBeLessThan(email.text.indexOf("Vehicle: DT-04"));
    expect(email.text).toContain("DEPARTURE BLOCKED");
    expect(email.text).toContain("(2 photos)");
    expect(email.html).toContain("Brake system &lt;unsafe&gt;");
    expect(email.html).not.toContain("Brake system <unsafe>");
  });

  it("renders a normal submission message when no defects were reported", () => {
    const email = buildInspectionEmail({
      templateKey: "inspection_submitted",
      subject: "Inspection submitted",
      payload: { vehicleCode: "Unit 20", defects: [] },
    });

    expect(email.text).toContain("no reported defects");
    expect(email.text).not.toContain("ATTENTION REQUIRED");
  });

  it("rejects credential-bearing delivery to a non-Microsoft SMTP host", async () => {
    await expect(createSmtpTransportForConfiguration({ mode: "smtp", host: "mail.attacker.invalid", port: 587, secure: false, authMode: "password", username: "fleet@example.gov", password: "stored-secret", oauthTenantId: null, oauthClientId: null, oauthClientSecret: null, from: "fleet@example.gov" })).rejects.toThrow(/approved Microsoft endpoint/);
  });
});
