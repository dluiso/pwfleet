import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Mail, ShieldCheck, Truck, UsersRound } from "lucide-react";
import { getPilotReadiness } from "@/modules/administration/service";

type Gate = { ready: boolean; label: string; detail: string; href: string };

export default async function PilotReadinessPage() {
  const readiness = await getPilotReadiness();
  const gates: Gate[] = [
    { ready: readiness.vehicles.active > 0, label: "Active fleet records", detail: `${readiness.vehicles.active} active of ${readiness.vehicles.total} total vehicles`, href: "/settings/vehicles" },
    { ready: readiness.vehicles.active > 0 && readiness.vehicles.activeQr >= readiness.vehicles.active, label: "Vehicle QR coverage", detail: `${readiness.vehicles.activeQr} active QR labels for ${readiness.vehicles.active} active vehicles`, href: "/settings/vehicles" },
    { ready: readiness.forms.assignable > 0, label: "Approved inspection forms", detail: `${readiness.forms.assignable} published, approved, and assignable versions`, href: "/settings/forms" },
    { ready: readiness.vehicles.active > 0 && readiness.vehicles.unassigned === 0, label: "Form assignments", detail: `${readiness.vehicles.assigned} active vehicles assigned; ${readiness.vehicles.unassigned} still need a form`, href: "/settings/vehicles" },
    { ready: readiness.roles.drivers > 0, label: "Driver coverage", detail: `${readiness.roles.drivers} active driver accounts`, href: "/settings/users" },
    { ready: readiness.roles.supervisors + readiness.roles.fleetManagers > 0, label: "Operational review coverage", detail: `${readiness.roles.supervisors} supervisors and ${readiness.roles.fleetManagers} fleet managers`, href: "/settings/users" },
    { ready: readiness.roles.maintenanceTechnicians > 0, label: "Maintenance coverage", detail: `${readiness.roles.maintenanceTechnicians} active maintenance technicians`, href: "/settings/users" },
    { ready: true, label: "Secure authentication", detail: readiness.integrations.authenticationMode === "local" ? "Secure local sign-in is active; Microsoft Entra remains optional" : "Microsoft Entra sign-in is active", href: "/settings/integrations" },
    { ready: readiness.integrations.emailMode === "smtp", label: "External email delivery", detail: readiness.integrations.emailMode === "capture" ? "Capture mode is safe for testing; configure SMTP before external notifications are required" : "SMTP delivery is active", href: "/settings/integrations" },
  ];
  const readyCount = gates.filter((gate) => gate.ready).length;
  return <div className="page-stack">
    <section className="page-heading-row"><div><span className="eyebrow">OPERATIONAL CONTROL</span><h1>Pilot readiness</h1><p>A live, read-only view of the prerequisites for controlled fleet use.</p></div><span className="policy-pill">{readyCount} of {gates.length} ready</span></section>
    <section className="panel readiness-summary"><div className="panel-header"><div><span className="eyebrow">CURRENT SNAPSHOT</span><h2>Deployment posture</h2></div><ClipboardCheck size={22} /></div><div className="snapshot-grid readiness-snapshot"><div><span>Active vehicles</span><strong>{readiness.vehicles.active}</strong></div><div><span>Assignable forms</span><strong>{readiness.forms.assignable}</strong></div><div><span>Form assignments</span><strong>{readiness.forms.activeAssignments}</strong></div><div><span>Pending reviews</span><strong>{readiness.forms.pendingReview}</strong></div><div><span>Unassigned vehicles</span><strong>{readiness.vehicles.unassigned}</strong></div></div></section>
    <section className="panel settings-panel"><div className="panel-header"><div><span className="eyebrow">RELEASE GATES</span><h2>Items requiring attention</h2></div></div><div className="readiness-gates">{gates.map((gate) => { const Icon = gate.ready ? CheckCircle2 : AlertTriangle; return <Link href={gate.href} key={gate.label}><span className={gate.ready ? "gate-icon gate-icon-ready" : "gate-icon"}><Icon size={18} /></span><div><strong>{gate.label}</strong><p>{gate.detail}</p></div><span className={`workflow-status workflow-status-${gate.ready ? "approved" : "changes_requested"}`}>{gate.ready ? "ready" : "action needed"}</span></Link>; })}</div></section>
    <section className="readiness-notes-grid"><article className="panel"><Truck size={20} /><div><strong>Fleet and forms</strong><p>{readiness.forms.draftOrChanges} form versions remain draft or need changes. Approval still requires the configured independent reviewers.</p></div></article><article className="panel"><UsersRound size={20} /><div><strong>No automatic user creation</strong><p>This dashboard reports role coverage only. It never provisions, changes, or activates an account.</p></div></article><article className="panel"><Mail size={20} /><div><strong>Email can remain deferred</strong><p>Capture mode retains outgoing notifications for testing without contacting external recipients.</p></div></article><article className="panel"><ShieldCheck size={20} /><div><strong>Fail-safe controls remain active</strong><p>Critical inspection rules, publication governance, and authorization checks are not bypassed by readiness reporting.</p></div></article></section>
  </div>;
}
