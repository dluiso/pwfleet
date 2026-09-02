import Link from "next/link";
import { CalendarDays, Download, FileText, Mail } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";
import { getFleetDashboard } from "@/modules/fleet/repository";
import { getMaintenanceReportSnapshot, listInspectionReports } from "@/modules/reports/repository";
import { getFleetReportOptions } from "@/modules/reports/fleet-report";
import { ReportBuilder } from "@/components/report-builder";

export default async function ReportsPage() {
  const actor = await requirePermission("reports:read");
  const env = getEnvironment();
  const [dashboard, inspections, maintenance, reportOptions] = await Promise.all([
    getFleetDashboard(),
    listInspectionReports(5),
    getMaintenanceReportSnapshot(),
    getFleetReportOptions(),
  ]);

  return (
    <div className="page-stack">
      <section className="page-heading-row"><div><span className="eyebrow">ANALYTICS & DELIVERY</span><h1>Reports</h1><p>Fleet readiness and controlled inspection exports.</p></div></section>
      <section className="report-options-grid">
        <article className="panel report-option"><span className="record-icon"><FileText size={19} /></span><div><strong>Inspection reports</strong><p>Download the signed system record for any submitted form.</p></div><Link className="button button-secondary button-small" href="/inspections"><Download size={15} /> Browse PDFs</Link></article>
        <article className="panel report-option"><span className="record-icon"><CalendarDays size={19} /></span><div><strong>Scheduled fleet summaries</strong><p>Daily, weekly, monthly, and annual subscriptions deliver controlled PDF or CSV reports to registered recipients.</p></div>{actor.role === "administrator" ? <Link className="button button-secondary button-small" href="/settings/reports">Manage schedules</Link> : <span className="policy-pill">Automated delivery</span>}</article>
        <article className="panel report-option"><span className="record-icon"><Mail size={19} /></span><div><strong>Email delivery</strong><p>{env.EMAIL_MODE === "smtp" ? "The approved SMTP relay is configured for queued delivery with retry and dead-letter tracking." : "Messages are captured locally without external delivery while this environment remains in development mode."}</p></div><span className="policy-pill">{env.EMAIL_MODE === "smtp" ? "SMTP delivery" : "Development capture"}</span></article>
      </section>
      <ReportBuilder canManageDelivery={actor.role === "administrator"} options={reportOptions} />
      <section className="panel report-snapshot">
        <div className="panel-header"><div><span className="eyebrow">CURRENT SNAPSHOT</span><h2>Fleet readiness</h2></div><span className="record-count">{inspections.length} recent inspections</span></div>
        <div className="snapshot-grid"><div><span>Active vehicles</span><strong>{dashboard.metrics.totalActive}</strong></div><div><span>Cleared</span><strong>{dashboard.metrics.cleared}</strong></div><div><span>Inspection due</span><strong>{dashboard.metrics.inspectionRequired}</strong></div><div><span>Open defects</span><strong>{dashboard.metrics.openDefects}</strong></div><div><span>Out of service</span><strong>{dashboard.metrics.outOfService}</strong></div></div>
      </section>
      <section className="panel report-snapshot">
        <div className="panel-header"><div><span className="eyebrow">MAINTENANCE PERFORMANCE</span><h2>Safety-case operations</h2></div><span className="record-count">{maintenance.totalCases} lifetime cases</span></div>
        <div className="snapshot-grid maintenance-snapshot-grid"><div><span>Active cases</span><strong>{maintenance.activeCases}</strong></div><div><span>Overdue</span><strong>{maintenance.overdueCases}</strong></div><div><span>Critical priority</span><strong>{maintenance.criticalCases}</strong></div><div><span>Released</span><strong>{maintenance.releasedCases}</strong></div><div><span>Recorded cost</span><strong>{(maintenance.totalCostCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong></div><div><span>Labor hours</span><strong>{(maintenance.totalLaborMinutes / 60).toFixed(1)}</strong></div></div>
      </section>
    </div>
  );
}
