import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, FileCog, KeyRound, Mail, Server, ShieldAlert, SlidersHorizontal, Truck, UsersRound } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";

export default async function AdministrationPage() {
  await requirePermission("configuration:manage");
  const env = getEnvironment();
  const production = env.NODE_ENV === "production";
  const gates = [
    { label: "Authentication", ready: env.AUTH_MODE !== "development", note: env.AUTH_MODE === "local" ? "Secure local sign-in active; Microsoft Entra can be enabled later" : env.AUTH_MODE === "oidc" ? "Microsoft Entra OpenID Connect active" : "Development identity bypass active", icon: KeyRound },
    { label: "Email delivery", ready: env.EMAIL_MODE === "smtp", note: env.EMAIL_MODE === "capture" ? "Messages are captured without external delivery" : "SMTP configured externally", icon: Mail },
    { label: "Database transport", ready: env.DATABASE_SSL_MODE === "require", note: env.DATABASE_SSL_MODE === "disable" ? "Local database connection only" : "TLS required", icon: Server },
  ];
  return (
    <div className="page-stack">
      <section className="page-heading-row"><div><span className="eyebrow">CONTROL CENTER</span><h1>Administration</h1><p>Fleet records, access control, forms, and production readiness.</p></div></section>
      <section className="admin-module-grid">
        <Link className="panel admin-module-card" href="/settings/vehicles"><span className="record-icon"><Truck size={20} /></span><div><strong>Vehicle administration</strong><p>Create vehicle records, manage identifiers and QR labels, and assign inspection forms.</p></div><ArrowRight size={18} /></Link>
        <Link className="panel admin-module-card" href="/settings/users"><span className="record-icon"><UsersRound size={20} /></span><div><strong>User administration</strong><p>Manage drivers, supervisors, maintenance staff, auditors, and administrators.</p></div><ArrowRight size={18} /></Link>
        <Link className="panel admin-module-card" href="/settings/forms"><span className="record-icon"><FileCog size={20} /></span><div><strong>Form catalog</strong><p>Review published versions and draft safety-rule approval status.</p></div><ArrowRight size={18} /></Link>
        <Link className="panel admin-module-card" href="/settings/maintenance"><span className="record-icon"><SlidersHorizontal size={20} /></span><div><strong>Maintenance policies</strong><p>Configure escalation deadlines and estimate approval thresholds by priority.</p></div><ArrowRight size={18} /></Link>
        <Link className="panel admin-module-card" href="/settings/reports"><span className="record-icon"><CalendarClock size={20} /></span><div><strong>Report subscriptions</strong><p>Manage scheduled PDF/CSV delivery, registered recipients, filters, and delivery history.</p></div><ArrowRight size={18} /></Link>
      </section>
      <section className="panel settings-panel"><div className="panel-header"><div><span className="eyebrow">ENVIRONMENT</span><h2>Security gates</h2></div><span className="policy-pill">{production ? "Production" : "Local development"}</span></div><div className="settings-gates">{gates.map((gate) => { const Icon = gate.icon; return <article key={gate.label}><span className={gate.ready ? "gate-icon gate-icon-ready" : "gate-icon"}><Icon size={18} /></span><div><strong>{gate.label}</strong><p>{gate.note}</p></div>{gate.ready ? <CheckCircle2 size={18} className="gate-check" /> : <ShieldAlert size={18} className="gate-warning" />}</article>; })}</div></section>
      {env.EMAIL_MODE === "capture" ? <article className="safety-callout safety-callout-wide"><ShieldAlert size={22} /><div><strong>Email delivery is pending</strong><p>The application is operational, but outgoing notifications are retained without external delivery until the approved mail integration is configured.</p></div></article> : null}
    </div>
  );
}
