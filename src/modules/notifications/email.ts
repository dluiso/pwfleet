import nodemailer, { type Transporter } from "nodemailer";
import { z } from "zod";
import { getEnvironment } from "@/lib/env";
import { formatDateTime, formatEnum } from "@/lib/format";

export type NotificationPayload = {
  inspectionId?: unknown;
  vehicleCode?: unknown;
  templateName?: unknown;
  severity?: unknown;
  disposition?: unknown;
  submittedBy?: unknown;
  submittedAt?: unknown;
  safetyCaseId?: unknown;
  caseStatus?: unknown;
  action?: unknown;
  actionBy?: unknown;
  note?: unknown;
  notificationBody?: unknown;
  reportPeriod?: unknown;
  reportFormat?: unknown;
  reportArtifactId?: unknown;
  vehicleId?: unknown;
  documentName?: unknown;
  documentCategory?: unknown;
  expiresOn?: unknown;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readable(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? formatEnum(value) : fallback;
}

export function buildInspectionEmail(input: {
  templateKey: string;
  subject: string;
  payload: NotificationPayload;
}) {
  const env = getEnvironment();
  const critical = input.templateKey === "critical_vehicle_alert";
  const safetyCaseUpdate = input.templateKey === "safety_case_update";
  const safetyCaseEscalation = input.templateKey === "safety_case_escalation";
  const reportDelivery = input.templateKey === "report_delivery";
  const documentExpiration = input.templateKey === "vehicle_document_expiration";
  const inspectionId = typeof input.payload.inspectionId === "string"
    ? input.payload.inspectionId
    : undefined;
  const safetyCaseId = typeof input.payload.safetyCaseId === "string" ? input.payload.safetyCaseId : undefined;
  const vehicleId = typeof input.payload.vehicleId === "string" ? input.payload.vehicleId : undefined;
  const reportUrl = documentExpiration && vehicleId
    ? new URL(`/vehicles/${vehicleId}`, env.APP_BASE_URL).toString()
    : reportDelivery
    ? new URL("/reports", env.APP_BASE_URL).toString()
    : safetyCaseId
    ? new URL(`/maintenance/${safetyCaseId}`, env.APP_BASE_URL).toString()
    : inspectionId
      ? new URL(`/api/inspections/${inspectionId}/pdf`, env.APP_BASE_URL).toString()
      : env.APP_BASE_URL;
  const vehicleCode = String(input.payload.vehicleCode ?? "Vehicle");
  const disposition = readable(input.payload.disposition, "Pending review");
  const severity = readable(input.payload.severity, "Not classified");
  const submittedAt = typeof input.payload.submittedAt === "string"
    ? formatDateTime(input.payload.submittedAt)
    : "Not available";

  const caseStatus = readable(input.payload.caseStatus, "Pending review");
  const heading = documentExpiration ? "Vehicle document expiration" : reportDelivery ? "Scheduled fleet report" : critical ? "Critical vehicle safety alert" : safetyCaseEscalation ? "Vehicle safety escalation" : safetyCaseUpdate ? "Vehicle safety case update" : "Vehicle inspection review";
  const instruction = documentExpiration
    ? String(input.payload.notificationBody ?? "A controlled vehicle document requires attention.")
    : reportDelivery
    ? String(input.payload.notificationBody ?? "Your fleet operations report is attached.")
    : critical
    ? "Do not operate this vehicle. The driver must wait for an authorized supervisor or fleet manager to release it."
    : safetyCaseEscalation
      ? String(input.payload.notificationBody ?? input.payload.note ?? "This safety case requires immediate attention.")
      : safetyCaseUpdate
      ? input.payload.caseStatus === "released"
        ? "An authorized supervisor approved this vehicle for operation."
        : input.payload.caseStatus === "awaiting_reinspection"
          ? "Repairs were recorded. The vehicle remains unavailable until reinspection and supervisor release are complete."
          : "The vehicle remains under controlled review. Follow the recorded case status before operating or servicing it."
      : "Review the inspection outcome and any reported defects before the vehicle is released.";

  const text = [
    heading,
    "",
    `Vehicle: ${vehicleCode}`,
    ...(documentExpiration
      ? [`Document: ${String(input.payload.documentName ?? "Vehicle document")}`, `Category: ${readable(input.payload.documentCategory, "Document")}`, `Expiration: ${String(input.payload.expiresOn ?? "Not recorded")}`]
      : reportDelivery
      ? [`Report period: ${String(input.payload.reportPeriod ?? "Configured period")}`, `Format: ${String(input.payload.reportFormat ?? "report").toUpperCase()}`]
      : safetyCaseUpdate || safetyCaseEscalation
      ? [`Case status: ${caseStatus}`, `Action: ${readable(input.payload.action, "Updated")}`, `Action by: ${String(input.payload.actionBy ?? "System")}`, `Note: ${String(input.payload.note ?? "No additional note")}`]
      : [`Inspection: ${String(input.payload.templateName ?? "Vehicle inspection")}`, `Severity: ${severity}`, `Disposition: ${disposition}`, `Submitted by: ${String(input.payload.submittedBy ?? "Unknown")}`, `Submitted: ${submittedAt}`]),
    "",
    instruction,
    `PDF report: ${reportUrl}`,
  ].join("\n");

  const accent = critical ? "#a23732" : "#17634d";
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f3f6f4;font-family:Arial,sans-serif;color:#17211e">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #d9e1de;border-radius:12px;overflow:hidden">
<tr><td style="padding:20px 24px;background:#123f36;color:#fff"><div style="font-size:11px;letter-spacing:1px">CITY OF HARVEY PUBLIC WORKS</div><div style="margin-top:5px;font-size:23px;font-weight:700">${escapeHtml(heading)}</div></td></tr>
<tr><td style="padding:22px 24px"><div style="padding:13px 15px;border-left:4px solid ${accent};background:${critical ? "#fff0ef" : "#eaf6f0"};font-weight:700">${escapeHtml(instruction)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-collapse:collapse">
${(documentExpiration ? [
  ["Vehicle", vehicleCode],
  ["Document", input.payload.documentName ?? "Vehicle document"],
  ["Category", readable(input.payload.documentCategory, "Document")],
  ["Expiration", input.payload.expiresOn ?? "Not recorded"],
] : reportDelivery ? [
  ["Report period", input.payload.reportPeriod ?? "Configured period"],
  ["Format", String(input.payload.reportFormat ?? "report").toUpperCase()],
] : safetyCaseUpdate || safetyCaseEscalation ? [
  ["Vehicle", vehicleCode],
  ["Case status", caseStatus],
  ["Action", readable(input.payload.action, "Updated")],
  ["Action by", input.payload.actionBy ?? "System"],
  ["Note", input.payload.note ?? "No additional note"],
] : [
  ["Vehicle", vehicleCode],
  ["Inspection", input.payload.templateName ?? "Vehicle inspection"],
  ["Severity", severity],
  ["Disposition", disposition],
  ["Submitted by", input.payload.submittedBy ?? "Unknown"],
  ["Submitted", submittedAt],
]).map(([label, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #e5ebe8;color:#65746f;font-size:12px">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5ebe8;font-weight:700;font-size:12px">${escapeHtml(value)}</td></tr>`).join("")}
</table>
<a href="${escapeHtml(reportUrl)}" style="display:inline-block;margin-top:20px;padding:11px 16px;border-radius:7px;background:#17634d;color:#fff;text-decoration:none;font-weight:700;font-size:13px">${documentExpiration ? "Open vehicle dossier" : reportDelivery ? "Open reports dashboard" : safetyCaseId ? "Open safety case" : "Download PDF report"}</a>
</td></tr><tr><td style="padding:14px 24px;background:#f4f7f5;color:#65746f;font-size:10px">Automated fleet safety notification. The PDF requires an authorized application session.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: input.subject, text, html, reportUrl };
}

const oauthTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
});

async function getSmtpOAuthAccessToken() {
  const env = getEnvironment();
  const endpoint = new URL(
    `/${encodeURIComponent(env.SMTP_OAUTH_TENANT_ID!)}/oauth2/v2.0/token`,
    "https://login.microsoftonline.com",
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SMTP_OAUTH_CLIENT_ID!,
      client_secret: env.SMTP_OAUTH_CLIENT_SECRET!,
      grant_type: "client_credentials",
      scope: "https://outlook.office365.com/.default",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("SMTP OAuth2 token request failed.");
  return oauthTokenSchema.parse(await response.json()).access_token;
}

export async function createSmtpTransport(): Promise<Transporter | null> {
  const env = getEnvironment();
  if (env.EMAIL_MODE !== "smtp") return null;

  const auth = env.SMTP_AUTH_MODE === "oauth2"
    ? {
        type: "OAuth2" as const,
        user: env.SMTP_USERNAME!,
        accessToken: await getSmtpOAuthAccessToken(),
      }
    : env.SMTP_AUTH_MODE === "password"
      ? { user: env.SMTP_USERNAME!, pass: env.SMTP_PASSWORD! }
      : undefined;

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
