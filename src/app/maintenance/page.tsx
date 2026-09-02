import { AlarmClock, ArrowRight, ClipboardList, ShieldAlert, Wrench } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatEnum, vehicleLabel } from "@/lib/format";
import { listMaintenanceDefects, listSafetyCases } from "@/modules/maintenance/repository";

export default async function MaintenancePage() {
  const [cases, items] = await Promise.all([listSafetyCases(), listMaintenanceDefects()]);
  const blocking = items.filter((item) => item.blocksDeparture).length;
  const overdue = cases.filter((item) => item.overdue).length;

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div><span className="eyebrow">SAFETY OPERATIONS</span><h1>Safety workbench</h1><p>Supervisor review, maintenance custody, reinspection, and controlled vehicle release.</p></div>
      </section>
      <section className="metrics-grid metrics-grid-compact">
        <article className="metric-card"><div className="metric-icon"><ClipboardList size={21} /></div><div><span>Active safety cases</span><strong>{cases.length}</strong></div><small>All workflow stages</small></article>
        <article className="metric-card"><div className="metric-icon metric-icon-warning"><Wrench size={21} /></div><div><span>Open defects</span><strong>{items.length}</strong></div><small>All severities</small></article>
        <article className="metric-card"><div className="metric-icon metric-icon-danger"><ShieldAlert size={21} /></div><div><span>Blocking departure</span><strong>{blocking}</strong></div><small>Release required</small></article>
        <article className="metric-card"><div className="metric-icon metric-icon-warning"><AlarmClock size={21} /></div><div><span>Overdue cases</span><strong>{overdue}</strong></div><small>Past target resolution</small></article>
      </section>
      <section className="panel records-panel">
        <div className="panel-header"><div><span className="eyebrow">ACTIVE CASES</span><h2>Supervisor and maintenance worklist</h2></div><span className="record-count">{cases.length} open</span></div>
        {cases.length ? <div className="records-list">{cases.map((item) => (
          <Link className="record-row safety-case-row" href={`/maintenance/${item.id}`} key={item.id}>
            <div className={`record-icon ${item.blockingDefectCount ? "record-icon-danger" : ""}`}><ShieldAlert size={18} /></div>
            <div className="record-main"><strong>{vehicleLabel(item)} - {item.templateName}</strong><span>{item.summary ?? "Inspection requires supervisor review"}</span><small>{item.openDefectCount} open defects · {item.assignedTechnicianName ?? "Unassigned"} · {item.targetResolutionAt ? `${item.overdue ? "Overdue" : "Due"} ${formatDateTime(item.targetResolutionAt)}` : "No target date"} · {(item.totalCostCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</small></div>
            <StatusBadge value={item.disposition} compact />
            <span className={`priority-chip priority-${item.priority}`}>{formatEnum(item.priority)}</span>
            <span className={`workflow-status workflow-status-${item.status}`}>{formatEnum(item.status)}</span>
            <ArrowRight size={17} />
          </Link>
        ))}</div> : <div className="empty-state"><ClipboardList size={28} /><strong>No active safety cases</strong><p>Inspections requiring review will create a case automatically.</p></div>}
      </section>
      <section className="panel records-panel">
        <div className="panel-header"><div><span className="eyebrow">ALL FINDINGS</span><h2>Open defect register</h2></div></div>
        {items.length ? <div className="records-list">{items.map((item) => (
          <article className="record-row maintenance-row" key={item.id}>
            <div className={`record-icon ${item.blocksDeparture ? "record-icon-danger" : ""}`}><Wrench size={18} /></div>
            <div className="record-main"><strong>{vehicleLabel(item)} - {item.title}</strong><span>{item.description || "No additional comment"}</span><small>Reported {formatDateTime(item.createdAt)} by {item.reporterName}</small></div>
            <StatusBadge value={item.status} compact />
            <span className={`severity-chip severity-${item.severity}`}>{formatEnum(item.severity)}</span>
          </article>
        ))}</div> : <div className="empty-state"><Wrench size={28} /><strong>No open defects</strong><p>New defects will appear automatically after inspection submission.</p></div>}
      </section>
    </div>
  );
}
