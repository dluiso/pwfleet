"use client";

import { KeyRound, Mail, Save, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Settings = {
  authentication: { mode: "local" | "oidc"; issuer: string; clientId: string; hasClientSecret: boolean; clientAuthMethod: "client_secret_basic" | "client_secret_post"; scopes: string; clockToleranceSeconds: number };
  email: { mode: "capture" | "smtp"; host: string; port: number; secure: boolean; authMode: "none" | "password" | "oauth2"; username: string; hasPassword: boolean; oauthTenantId: string; oauthClientId: string; hasOauthClientSecret: boolean; from: string };
  recordVersion: number;
};

async function update(endpoint: string, body: unknown) {
  const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { error?: string; recordVersion?: number };
  if (!response.ok) throw new Error(payload.error ?? "The integration could not be updated.");
  return payload;
}

export function IntegrationSettingsManager({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [authentication, setAuthentication] = useState(initial.authentication);
  const [email, setEmail] = useState(initial.email);
  const [recordVersion, setRecordVersion] = useState(initial.recordVersion);
  const [authSecret, setAuthSecret] = useState("");
  const [administratorObjectId, setAdministratorObjectId] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpOauthSecret, setSmtpOauthSecret] = useState("");
  const [busy, setBusy] = useState<"authentication" | "email" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveAuthentication() {
    if (authentication.mode === "oidc" && !window.confirm("Activate Microsoft Entra sign-in? The provider will be validated first and the current local sign-in entry point will be replaced.")) return;
    setBusy("authentication"); setMessage(null); setError(null);
    try {
      const result = await update("/api/admin/integrations/authentication", { ...authentication, clientSecret: authSecret || undefined, administratorObjectId: administratorObjectId || undefined, recordVersion });
      setRecordVersion(result.recordVersion!); setAuthSecret(""); setMessage(authentication.mode === "oidc" ? "Microsoft Entra sign-in validated and activated." : "Local sign-in remains active."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Authentication settings could not be updated."); } finally { setBusy(null); }
  }

  async function saveEmail() {
    if (email.mode === "smtp" && !window.confirm("Validate and activate external email delivery? Pending messages may be delivered by the next worker run.")) return;
    setBusy("email"); setMessage(null); setError(null);
    try {
      const result = await update("/api/admin/integrations/email", { ...email, password: smtpPassword || undefined, oauthClientSecret: smtpOauthSecret || undefined, recordVersion });
      setRecordVersion(result.recordVersion!); setSmtpPassword(""); setSmtpOauthSecret(""); setMessage(email.mode === "smtp" ? "SMTP connectivity validated and delivery activated." : "Capture mode is active; no external email will be sent."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Email settings could not be updated."); } finally { setBusy(null); }
  }

  return <div className="page-stack">
    <section className="page-heading-row"><div><span className="eyebrow">SECURE INTEGRATIONS</span><h1>Microsoft & email</h1><p>Configure, validate, and activate identity and delivery providers without changing application code.</p></div></section>
    <article className="safety-callout safety-callout-wide"><ShieldAlert size={22} /><div><strong>Secrets are write-only</strong><p>Credentials are encrypted before storage and are never returned to the browser. Leave a secret field empty to retain the saved value.</p></div></article>
    {message ? <div className="form-feedback form-feedback-success">{message}</div> : null}{error ? <div className="form-feedback form-feedback-error">{error}</div> : null}
    <section className="panel integration-card"><header><span className="record-icon"><KeyRound size={19} /></span><div><span className="eyebrow">AUTHENTICATION</span><h2>Microsoft Entra ID</h2><p>Local sign-in remains available until a complete Microsoft configuration passes discovery validation.</p></div><span className="policy-pill">{authentication.mode === "oidc" ? "Entra active" : "Local active"}</span></header>
      <div className="policy-fields integration-fields">
        <label><span>Sign-in provider</span><select value={authentication.mode} onChange={(event) => setAuthentication({ ...authentication, mode: event.target.value as "local" | "oidc" })}><option value="local">Secure local sign-in</option><option value="oidc">Microsoft Entra ID</option></select></label>
        <label><span>Issuer URL</span><input value={authentication.issuer} placeholder="https://login.microsoftonline.com/tenant-id/v2.0" onChange={(event) => setAuthentication({ ...authentication, issuer: event.target.value })} /></label>
        <label><span>Application client ID</span><input value={authentication.clientId} onChange={(event) => setAuthentication({ ...authentication, clientId: event.target.value })} /></label>
        <label><span>Application client secret</span><input type="password" autoComplete="new-password" value={authSecret} placeholder={authentication.hasClientSecret ? "Saved — leave empty to retain" : "Required for activation"} onChange={(event) => setAuthSecret(event.target.value)} /></label>
        <label><span>Client authentication</span><select value={authentication.clientAuthMethod} onChange={(event) => setAuthentication({ ...authentication, clientAuthMethod: event.target.value as "client_secret_basic" | "client_secret_post" })}><option value="client_secret_basic">HTTP Basic</option><option value="client_secret_post">POST body</option></select></label>
        <label><span>Scopes</span><input value={authentication.scopes} onChange={(event) => setAuthentication({ ...authentication, scopes: event.target.value })} /></label>
        <label><span>Clock tolerance (seconds)</span><input type="number" min="0" max="300" value={authentication.clockToleranceSeconds} onChange={(event) => setAuthentication({ ...authentication, clockToleranceSeconds: Number(event.target.value) })} /></label>
        <label><span>Current administrator Object ID</span><input value={administratorObjectId} placeholder="Required when activating Entra" onChange={(event) => setAdministratorObjectId(event.target.value)} /></label>
      </div><footer><span>Redirect URI: <code>/auth/callback</code></span><button className="button button-primary" type="button" disabled={busy !== null} onClick={saveAuthentication}><Save size={15} /> {busy === "authentication" ? "Validating…" : "Save authentication"}</button></footer>
    </section>
    <section className="panel integration-card"><header><span className="record-icon"><Mail size={19} /></span><div><span className="eyebrow">NOTIFICATIONS</span><h2>Email delivery</h2><p>Capture mode records notifications internally. SMTP mode is activated only after a live connectivity test succeeds.</p></div><span className="policy-pill">{email.mode === "smtp" ? "SMTP active" : "Capture active"}</span></header>
      <div className="policy-fields integration-fields">
        <label><span>Delivery mode</span><select value={email.mode} onChange={(event) => setEmail({ ...email, mode: event.target.value as "capture" | "smtp" })}><option value="capture">Capture only</option><option value="smtp">SMTP delivery</option></select></label>
        <label><span>SMTP host</span><input value={email.host} onChange={(event) => setEmail({ ...email, host: event.target.value })} /></label>
        <label><span>SMTP port</span><input type="number" min="1" max="65535" value={email.port} onChange={(event) => setEmail({ ...email, port: Number(event.target.value) })} /></label>
        <label className="policy-active"><input type="checkbox" checked={email.secure} onChange={(event) => setEmail({ ...email, secure: event.target.checked })} /> Implicit TLS (normally off for port 587)</label>
        <label><span>Authentication method</span><select value={email.authMode} onChange={(event) => setEmail({ ...email, authMode: event.target.value as "none" | "password" | "oauth2" })}><option value="none">Approved unauthenticated relay</option><option value="password">Username and password</option><option value="oauth2">Microsoft OAuth2</option></select></label>
        <label><span>Username / sender mailbox</span><input value={email.username} onChange={(event) => setEmail({ ...email, username: event.target.value })} /></label>
        {email.authMode === "password" ? <label><span>SMTP password</span><input type="password" autoComplete="new-password" value={smtpPassword} placeholder={email.hasPassword ? "Saved — leave empty to retain" : "Required for activation"} onChange={(event) => setSmtpPassword(event.target.value)} /></label> : null}
        {email.authMode === "oauth2" ? <><label><span>Microsoft tenant ID</span><input value={email.oauthTenantId} onChange={(event) => setEmail({ ...email, oauthTenantId: event.target.value })} /></label><label><span>Mailer application client ID</span><input value={email.oauthClientId} onChange={(event) => setEmail({ ...email, oauthClientId: event.target.value })} /></label><label><span>Mailer application client secret</span><input type="password" autoComplete="new-password" value={smtpOauthSecret} placeholder={email.hasOauthClientSecret ? "Saved — leave empty to retain" : "Required for activation"} onChange={(event) => setSmtpOauthSecret(event.target.value)} /></label></> : null}
        <label><span>From address</span><input value={email.from} placeholder="City of Harvey PW Fleet <fleet@example.gov>" onChange={(event) => setEmail({ ...email, from: event.target.value })} /></label>
      </div><footer><span>External delivery remains off while Capture only is selected.</span><button className="button button-primary" type="button" disabled={busy !== null} onClick={saveEmail}><Save size={15} /> {busy === "email" ? "Validating…" : "Save email delivery"}</button></footer>
    </section>
  </div>;
}
