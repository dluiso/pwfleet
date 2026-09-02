import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { authSessions, auditEvents, integrationSettings, users } from "@/db/schema";
import { administrativeErrorResponse } from "@/lib/admin-api";
import { requirePermission } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

export type OidcRuntimeConfiguration = {
  mode: "local" | "oidc";
  issuer: string | null;
  clientId: string | null;
  clientSecret: string | null;
  clientAuthMethod: "client_secret_basic" | "client_secret_post";
  scopes: string;
  clockToleranceSeconds: number;
};

export type EmailRuntimeConfiguration = {
  mode: "capture" | "smtp";
  host: string | null;
  port: number | null;
  secure: boolean;
  authMode: "none" | "password" | "oauth2";
  username: string | null;
  password: string | null;
  oauthTenantId: string | null;
  oauthClientId: string | null;
  oauthClientSecret: string | null;
  from: string | null;
};

export type RuntimeIntegrationConfiguration = {
  authentication: OidcRuntimeConfiguration;
  email: EmailRuntimeConfiguration;
  recordVersion: number;
};

export class IntegrationSettingsError extends Error {
  constructor(message: string, readonly status = 400, readonly details?: unknown) {
    super(message);
    this.name = "IntegrationSettingsError";
  }
}

export function integrationSettingsErrorResponse(error: unknown): Response {
  if (error instanceof IntegrationSettingsError) return Response.json({ error: error.message, details: error.details }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: "Review the integration fields and try again.", details: error.flatten() }, { status: 400 });
  return administrativeErrorResponse(error);
}

const optionalText = z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(1).optional());
const microsoftIssuer = z.preprocess((value) => value === "" ? undefined : value, z.url().max(500).optional()).superRefine((value, context) => {
  if (!value) return;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "login.microsoftonline.com" || url.username || url.password || url.search || url.hash || !/^\/[0-9a-f-]{36}\/v2\.0\/?$/i.test(url.pathname)) {
    context.addIssue({ code: "custom", message: "Use the single-tenant Microsoft issuer URL with the Directory tenant ID." });
  }
});
const authenticationInputSchema = z.object({
  mode: z.enum(["local", "oidc"]),
  issuer: microsoftIssuer,
  clientId: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  clientSecret: z.string().max(2048).optional(),
  clientAuthMethod: z.enum(["client_secret_basic", "client_secret_post"]),
  scopes: z.string().trim().min(6).max(500),
  clockToleranceSeconds: z.coerce.number().int().min(0).max(300),
  administratorObjectId: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  recordVersion: z.coerce.number().int().positive(),
});
const emailInputSchema = z.object({
  mode: z.enum(["capture", "smtp"]),
  host: z.preprocess((value) => typeof value === "string" ? value.trim().toLowerCase() : value, z.literal("smtp.office365.com").optional()),
  port: z.preprocess((value) => value === "" || value === undefined ? undefined : value, z.coerce.number().int().min(1).max(65535).optional()),
  secure: z.boolean(),
  authMode: z.enum(["none", "password", "oauth2"]),
  username: z.preprocess((value) => value === "" ? undefined : value, z.email().trim().toLowerCase().max(320).optional()),
  password: z.string().max(2048).optional(),
  oauthTenantId: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  oauthClientId: z.preprocess((value) => value === "" ? undefined : value, z.uuid().optional()),
  oauthClientSecret: z.string().max(2048).optional(),
  from: optionalText.pipe(z.string().max(500).refine((value) => !/[\r\n]/.test(value), "Sender address cannot contain line breaks.").optional()),
  recordVersion: z.coerce.number().int().positive(),
});

async function loadRecord() {
  const [record] = await db.select().from(integrationSettings).where(eq(integrationSettings.id, 1)).limit(1);
  if (!record) throw new Error("Runtime integration settings have not been initialized.");
  return record;
}

function assertApprovedStoredDestinations(record: Awaited<ReturnType<typeof loadRecord>>) {
  if (record.authenticationMode === "oidc" && !microsoftIssuer.safeParse(record.oidcIssuer).success) {
    throw new Error("The stored Microsoft identity endpoint is not approved.");
  }
  if (record.emailMode === "smtp" && record.smtpHost !== "smtp.office365.com") {
    throw new Error("The stored SMTP endpoint is not approved.");
  }
}

function reveal(ciphertext: string | null): string | null {
  return ciphertext ? decryptSecret(ciphertext) : null;
}

export async function getRuntimeIntegrationConfiguration(): Promise<RuntimeIntegrationConfiguration> {
  const record = await loadRecord();
  assertApprovedStoredDestinations(record);
  return {
    authentication: {
      mode: record.authenticationMode,
      issuer: record.oidcIssuer,
      clientId: record.oidcClientId,
      clientSecret: reveal(record.oidcClientSecretCiphertext),
      clientAuthMethod: record.oidcClientAuthMethod,
      scopes: record.oidcScopes,
      clockToleranceSeconds: record.oidcClockToleranceSeconds,
    },
    email: {
      mode: record.emailMode,
      host: record.smtpHost,
      port: record.smtpPort,
      secure: record.smtpSecure,
      authMode: record.smtpAuthMode,
      username: record.smtpUsername,
      password: reveal(record.smtpPasswordCiphertext),
      oauthTenantId: record.smtpOauthTenantId,
      oauthClientId: record.smtpOauthClientId,
      oauthClientSecret: reveal(record.smtpOauthClientSecretCiphertext),
      from: record.emailFrom,
    },
    recordVersion: record.recordVersion,
  };
}

export async function getRuntimeAuthenticationConfiguration(): Promise<OidcRuntimeConfiguration> {
  const record = await loadRecord();
  assertApprovedStoredDestinations(record);
  return { mode: record.authenticationMode, issuer: record.oidcIssuer, clientId: record.oidcClientId, clientSecret: reveal(record.oidcClientSecretCiphertext), clientAuthMethod: record.oidcClientAuthMethod, scopes: record.oidcScopes, clockToleranceSeconds: record.oidcClockToleranceSeconds };
}

export async function getRuntimeEmailConfiguration(): Promise<EmailRuntimeConfiguration> {
  const record = await loadRecord();
  assertApprovedStoredDestinations(record);
  return { mode: record.emailMode, host: record.smtpHost, port: record.smtpPort, secure: record.smtpSecure, authMode: record.smtpAuthMode, username: record.smtpUsername, password: reveal(record.smtpPasswordCiphertext), oauthTenantId: record.smtpOauthTenantId, oauthClientId: record.smtpOauthClientId, oauthClientSecret: reveal(record.smtpOauthClientSecretCiphertext), from: record.emailFrom };
}

export async function getRuntimeIntegrationModes() {
  const record = await loadRecord();
  assertApprovedStoredDestinations(record);
  return { authenticationMode: record.authenticationMode, emailMode: record.emailMode };
}

export async function getIntegrationSettingsForAdministration() {
  await requirePermission("configuration:manage");
  const record = await loadRecord();
  return {
    authentication: {
      mode: record.authenticationMode,
      issuer: record.oidcIssuer ?? "",
      clientId: record.oidcClientId ?? "",
      hasClientSecret: Boolean(record.oidcClientSecretCiphertext),
      clientAuthMethod: record.oidcClientAuthMethod,
      scopes: record.oidcScopes,
      clockToleranceSeconds: record.oidcClockToleranceSeconds,
    },
    email: {
      mode: record.emailMode,
      host: record.smtpHost ?? "",
      port: record.smtpPort ?? 587,
      secure: record.smtpSecure,
      authMode: record.smtpAuthMode,
      username: record.smtpUsername ?? "",
      hasPassword: Boolean(record.smtpPasswordCiphertext),
      oauthTenantId: record.smtpOauthTenantId ?? "",
      oauthClientId: record.smtpOauthClientId ?? "",
      hasOauthClientSecret: Boolean(record.smtpOauthClientSecretCiphertext),
      from: record.emailFrom ?? "",
    },
    recordVersion: record.recordVersion,
  };
}

function required(value: string | null | undefined, label: string): string {
  if (!value) throw new IntegrationSettingsError(`${label} is required before this integration can be activated.`);
  return value;
}

export async function updateAuthenticationIntegration(body: unknown) {
  const actor = await requirePermission("configuration:manage");
  const input = authenticationInputSchema.parse(body);
  const record = await loadRecord();
  const storedSecret = input.clientSecret || reveal(record.oidcClientSecretCiphertext);
  const configuration: OidcRuntimeConfiguration = {
    mode: input.mode,
    issuer: input.issuer ?? null,
    clientId: input.clientId ?? null,
    clientSecret: storedSecret,
    clientAuthMethod: input.clientAuthMethod,
    scopes: input.scopes,
    clockToleranceSeconds: input.clockToleranceSeconds,
  };

  if (input.mode === "oidc") {
    required(configuration.issuer, "Issuer URL");
    required(configuration.clientId, "Application client ID");
    required(configuration.clientSecret, "Application client secret");
    required(input.administratorObjectId, "Current administrator Microsoft Object ID");
    const { discoverOidc } = await import("@/lib/oidc");
    await discoverOidc(configuration, true);
  }

  const updated = await db.transaction(async (transaction) => {
    const [saved] = await transaction.update(integrationSettings).set({
      authenticationMode: input.mode,
      oidcIssuer: input.issuer ?? null,
      oidcClientId: input.clientId ?? null,
      oidcClientSecretCiphertext: input.clientSecret ? encryptSecret(input.clientSecret) : record.oidcClientSecretCiphertext,
      oidcClientAuthMethod: input.clientAuthMethod,
      oidcScopes: input.scopes,
      oidcClockToleranceSeconds: input.clockToleranceSeconds,
      recordVersion: record.recordVersion + 1,
      updatedByUserId: actor.id,
      updatedAt: new Date(),
    }).where(and(eq(integrationSettings.id, 1), eq(integrationSettings.recordVersion, input.recordVersion))).returning();
    if (!saved) throw new IntegrationSettingsError("Integration settings changed in another session. Refresh and try again.", 409);
    if (input.mode === "oidc") {
      await transaction.update(users).set({
        oidcIssuer: input.issuer!,
        oidcSubject: input.administratorObjectId!,
        identityBoundAt: new Date(),
        recordVersion: actor.recordVersion + 1,
        updatedAt: new Date(),
      }).where(eq(users.id, actor.id));
    }
    if (record.authenticationMode !== input.mode) {
      await transaction.update(authSessions).set({ revokedAt: new Date() }).where(isNull(authSessions.revokedAt));
    }
    await transaction.insert(auditEvents).values({ actorUserId: actor.id, eventType: "integration.authentication_updated", entityType: "integration_settings", metadata: { mode: input.mode, issuer: input.issuer ?? null, clientSecretReplaced: Boolean(input.clientSecret) } });
    return saved;
  });
  return { mode: updated.authenticationMode, recordVersion: updated.recordVersion };
}

export async function updateEmailIntegration(body: unknown) {
  const actor = await requirePermission("configuration:manage");
  const input = emailInputSchema.parse(body);
  const record = await loadRecord();
  const configuration: EmailRuntimeConfiguration = {
    mode: input.mode,
    host: input.host ?? null,
    port: input.port ?? null,
    secure: input.secure,
    authMode: input.authMode,
    username: input.username ?? null,
    password: input.password || reveal(record.smtpPasswordCiphertext),
    oauthTenantId: input.oauthTenantId ?? null,
    oauthClientId: input.oauthClientId ?? null,
    oauthClientSecret: input.oauthClientSecret || reveal(record.smtpOauthClientSecretCiphertext),
    from: input.from ?? null,
  };
  if (input.mode === "smtp") {
    required(configuration.host, "SMTP host");
    if (!configuration.port) throw new IntegrationSettingsError("SMTP port is required before email delivery can be activated.");
    required(configuration.from, "Sender address");
    if (configuration.authMode === "password") {
      required(configuration.username, "SMTP username");
      required(configuration.password, "SMTP password");
    }
    if (configuration.authMode === "oauth2") {
      required(configuration.username, "Sender mailbox");
      required(configuration.oauthTenantId, "Microsoft tenant ID");
      required(configuration.oauthClientId, "Mailer application client ID");
      required(configuration.oauthClientSecret, "Mailer application client secret");
    }
    const { createSmtpTransportForConfiguration } = await import("@/modules/notifications/email");
    const transport = await createSmtpTransportForConfiguration(configuration);
    await transport.verify();
    transport.close();
  }
  const [updated] = await db.update(integrationSettings).set({
    emailMode: input.mode,
    smtpHost: input.host ?? null,
    smtpPort: input.port ?? null,
    smtpSecure: input.secure,
    smtpAuthMode: input.authMode,
    smtpUsername: input.username ?? null,
    smtpPasswordCiphertext: input.password ? encryptSecret(input.password) : record.smtpPasswordCiphertext,
    smtpOauthTenantId: input.oauthTenantId ?? null,
    smtpOauthClientId: input.oauthClientId ?? null,
    smtpOauthClientSecretCiphertext: input.oauthClientSecret ? encryptSecret(input.oauthClientSecret) : record.smtpOauthClientSecretCiphertext,
    emailFrom: input.from ?? null,
    recordVersion: record.recordVersion + 1,
    updatedByUserId: actor.id,
    updatedAt: new Date(),
  }).where(and(eq(integrationSettings.id, 1), eq(integrationSettings.recordVersion, input.recordVersion))).returning();
  if (!updated) throw new IntegrationSettingsError("Integration settings changed in another session. Refresh and try again.", 409);
  await db.insert(auditEvents).values({ actorUserId: actor.id, eventType: "integration.email_updated", entityType: "integration_settings", metadata: { mode: input.mode, authMode: input.authMode, passwordReplaced: Boolean(input.password), oauthClientSecretReplaced: Boolean(input.oauthClientSecret) } });
  return { mode: updated.emailMode, recordVersion: updated.recordVersion };
}
