import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    APP_BASE_URL: z.url(),
    APP_TIME_ZONE: z.string().min(1).refine((value) => {
      try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
    }, "A valid IANA time zone is required."),
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50),
    DATABASE_SSL_MODE: z.enum(["disable", "require"]),
    DATABASE_SSL_CA_FILE: optionalString,
    AUTH_MODE: z.enum(["development", "oidc"]),
    DEV_ACTOR_EMAIL: optionalString,
    OIDC_ISSUER: optionalUrl,
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_CLIENT_AUTH_METHOD: z.enum(["client_secret_basic", "client_secret_post"]),
    OIDC_SCOPES: z.string().min(6),
    OIDC_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(300),
    AUTH_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    SESSION_MAX_AGE_MINUTES: z.coerce.number().int().min(15).max(720),
    TRUST_PROXY_HEADERS: z.enum(["true", "false"]).transform((value) => value === "true"),
    EMAIL_MODE: z.enum(["capture", "smtp"]),
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalPositiveInteger,
    SMTP_SECURE: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
    SMTP_USERNAME: optionalString,
    SMTP_PASSWORD: optionalString,
    EMAIL_FROM: optionalString,
    FILE_STORAGE_ROOT: z.string().min(1),
    UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024),
    UPLOAD_USER_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000),
    UPLOAD_PROCESSING_CONCURRENCY: z.coerce.number().int().min(1).max(16),
    UPLOAD_PROCESSING_QUEUE_LIMIT: z.coerce.number().int().min(0).max(100),
    STORAGE_MIN_FREE_BYTES: z.coerce.number().int().min(0),
    FILE_SCANNING_MODE: z.enum(["disabled", "clamav"]),
    CLAMAV_HOST: optionalString,
    CLAMAV_PORT: optionalPositiveInteger,
    REPORT_ARTIFACT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650),
    REPORT_MAX_ROWS: z.coerce.number().int().min(100).max(50_000),
    REPORT_PDF_DETAIL_ROW_LIMIT: z.coerce.number().int().min(100).max(10_000),
    REPORT_RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(16),
    REPORT_RENDER_QUEUE_LIMIT: z.coerce.number().int().min(0).max(100),
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20),
    EMAIL_RETRY_BASE_MINUTES: z.coerce.number().int().min(1).max(1440),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production") {
      if (env.AUTH_MODE !== "oidc") {
        context.addIssue({
          code: "custom",
          path: ["AUTH_MODE"],
          message: "Production requires OIDC authentication.",
        });
      }

      if (env.DEV_ACTOR_EMAIL) {
        context.addIssue({
          code: "custom",
          path: ["DEV_ACTOR_EMAIL"],
          message: "Development identity bypass is forbidden in production.",
        });
      }

      if (!env.APP_BASE_URL.startsWith("https://")) {
        context.addIssue({
          code: "custom",
          path: ["APP_BASE_URL"],
          message: "Production requires an HTTPS application URL.",
        });
      }

      if (env.OIDC_ISSUER && !env.OIDC_ISSUER.startsWith("https://")) {
        context.addIssue({ code: "custom", path: ["OIDC_ISSUER"], message: "Production OIDC discovery requires an HTTPS issuer." });
      }

      if (env.DATABASE_SSL_MODE !== "require") {
        context.addIssue({
          code: "custom",
          path: ["DATABASE_SSL_MODE"],
          message: "Production database connections require TLS.",
        });
      }
      if (!env.TRUST_PROXY_HEADERS) {
        context.addIssue({ code: "custom", path: ["TRUST_PROXY_HEADERS"], message: "Production requires trusted reverse-proxy headers for request controls." });
      }
      if (env.FILE_SCANNING_MODE !== "clamav") {
        context.addIssue({ code: "custom", path: ["FILE_SCANNING_MODE"], message: "Production file uploads require ClamAV scanning." });
      }
    }

    if (env.AUTH_MODE === "development" && !env.DEV_ACTOR_EMAIL) {
      context.addIssue({
        code: "custom",
        path: ["DEV_ACTOR_EMAIL"],
        message: "Development mode requires an explicit local actor email.",
      });
    }

    if (env.AUTH_MODE === "oidc") {
      for (const key of [
        "OIDC_ISSUER",
        "OIDC_CLIENT_ID",
        "OIDC_CLIENT_SECRET",
        "AUTH_SECRET",
      ] as const) {
        if (!env[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when OIDC authentication is enabled.`,
          });
        }
      }
    }

    if (env.EMAIL_MODE === "smtp") {
      for (const key of ["SMTP_HOST", "SMTP_PORT", "EMAIL_FROM"] as const) {
        if (!env[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when SMTP email is enabled.`,
          });
        }
      }
      if (Boolean(env.SMTP_USERNAME) !== Boolean(env.SMTP_PASSWORD)) {
        context.addIssue({ code: "custom", path: ["SMTP_USERNAME"], message: "SMTP username and password must either both be provided or both be omitted for an approved relay." });
      }
    }
    if (env.FILE_SCANNING_MODE === "clamav") {
      for (const key of ["CLAMAV_HOST", "CLAMAV_PORT"] as const) {
        if (!env[key]) context.addIssue({ code: "custom", path: [key], message: `${key} is required when ClamAV scanning is enabled.` });
      }
    }
  });

export type AppEnvironment = z.infer<typeof envSchema>;

let cachedEnvironment: AppEnvironment | undefined;

export function getEnvironment(): AppEnvironment {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
  const source = isProductionBuild
    ? {
        ...process.env,
        NODE_ENV: "test",
        APP_BASE_URL: "http://build.invalid",
        APP_TIME_ZONE: "America/Chicago",
        DATABASE_URL: "postgresql://build.invalid/build",
        DATABASE_POOL_MAX: "1",
        DATABASE_SSL_MODE: "disable",
        AUTH_MODE: "development",
        DEV_ACTOR_EMAIL: "build@local.invalid",
        OIDC_CLIENT_AUTH_METHOD: "client_secret_basic",
        OIDC_SCOPES: "openid profile email",
        OIDC_CLOCK_TOLERANCE_SECONDS: "30",
        SESSION_MAX_AGE_MINUTES: "480",
        TRUST_PROXY_HEADERS: "false",
        EMAIL_MODE: "capture",
        SMTP_SECURE: "true",
        FILE_STORAGE_ROOT: "/tmp/harvey-pw-fleet-build",
        UPLOAD_MAX_BYTES: "10485760",
        UPLOAD_USER_DAILY_LIMIT: "20",
        UPLOAD_PROCESSING_CONCURRENCY: "2",
        UPLOAD_PROCESSING_QUEUE_LIMIT: "4",
        STORAGE_MIN_FREE_BYTES: "1073741824",
        FILE_SCANNING_MODE: "disabled",
        REPORT_ARTIFACT_RETENTION_DAYS: "365",
        REPORT_MAX_ROWS: "25000",
        REPORT_PDF_DETAIL_ROW_LIMIT: "2000",
        REPORT_RENDER_CONCURRENCY: "2",
        REPORT_RENDER_QUEUE_LIMIT: "4",
        EMAIL_MAX_ATTEMPTS: "5",
        EMAIL_RETRY_BASE_MINUTES: "5",
      }
    : process.env;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid application configuration:\n${details}`);
  }

  cachedEnvironment = parsed.data;
  return cachedEnvironment;
}
