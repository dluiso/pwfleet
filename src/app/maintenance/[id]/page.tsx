import {
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Download,
  FileWarning,
  ShieldAlert,
  UserRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SafetyCaseActions } from "@/components/safety-case-actions";
import { MaintenanceWorkEditor } from "@/components/maintenance-work-editor";
import { MaintenanceGovernancePanel } from "@/components/maintenance-governance-panel";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatEnum, vehicleLabel } from "@/lib/format";
import { getSafetyCase } from "@/modules/maintenance/repository";

export default async function SafetyCasePage({ params }: { params: Promise<{ id: string }> }) {
  const detail = await getSafetyCase((await params).id);
  if (!detail) notFound();
  const openDefects = detail.defects.filter((defect) => defect.status !== "closed");
  const blockingDefects = openDefects.filter((defect) => defect.blocksDeparture);

  return (
    <div className="page-stack">
      <Link className="back-link" href="/maintenance"><ArrowLeft size={16} /> Back to safety workbench</Link>
      <section className="case-hero">
        <span className="record-icon record-icon-danger"><ShieldAlert size={21} /></span>
        <div><span className="eyebrow">SAFETY CASE</span><h1>{vehicleLabel(detail)}</h1><p>{detail.templateName} · Version {detail.templateVersion} · Submitted {formatDateTime(detail.sourceSubmittedAt)}</p></div>
        <StatusBadge value={detail.disposition} />
        <span className={`workflow-status workflow-status-${detail.status}`}>{formatEnum(detail.status)}</span>
      </section>

      <section className="case-metrics-grid">
        <article className="panel"><FileWarning size={19} /><span>Open defects</span><strong>{openDefects.length}</strong></article>
        <article className={blockingDefects.length ? "panel case-metric-danger" : "panel"}><ShieldAlert size={19} /><span>Blocking defects</span><strong>{blockingDefects.length}</strong></article>
        <article className="panel"><UserRound size={19} /><span>Assigned technician</span><strong>{detail.assignedTechnician?.displayName ?? "Not assigned"}</strong></article>
        <article className={detail.overdue ? "panel case-metric-danger" : "panel"}><CalendarClock size={19} /><span>Target resolution</span><strong>{detail.targetResolutionAt ? formatDateTime(detail.targetResolutionAt) : "Not scheduled"}</strong></article>
        <article className="panel"><CircleDollarSign size={19} /><span>Recorded cost</span><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(detail.totalCostCents / 100)}</strong></article>
        <article className="panel"><Clock3 size={19} /><span>Labor recorded</span><strong>{detail.totalLaborMinutes} min</strong></article>
      </section>

      <section className="case-detail-layout">
        <div className="case-main-column">
          <SafetyCaseActions
            caseId={detail.id}
            status={detail.status}
            recordVersion={detail.recordVersion}
            vehicleId={detail.vehicleId}
            blockingDefectCount={blockingDefects.length}
            actor={detail.actor}
            assignedTechnician={detail.assignedTechnician}
            technicians={detail.technicians}
          />

          <MaintenanceGovernancePanel
            actor={detail.actor}
            approvalThresholdCents={detail.escalationPolicy?.estimateApprovalThresholdCents ?? null}
            assignedTechnicianId={detail.assignedTechnician?.id ?? null}
            caseId={detail.id}
            estimatedCostCents={detail.estimatedCostCents}
            estimateNote={detail.estimateNote}
            estimateStatus={detail.estimateStatus}
            estimateSubmittedAt={detail.estimateSubmittedAt?.toISOString() ?? null}
            key={`governance-${detail.recordVersion}`}
            recordVersion={detail.recordVersion}
            status={detail.status}
            technicians={detail.technicians}
          />

          <MaintenanceWorkEditor
            actor={detail.actor}
            caseId={detail.id}
            evidence={detail.evidence}
            externalReference={detail.externalReference}
            key={detail.recordVersion}
            priority={detail.priority}
            recordVersion={detail.recordVersion}
            serviceProvider={detail.serviceProvider}
            status={detail.status}
            targetResolutionAt={detail.targetResolutionAt?.toISOString() ?? null}
            workEntries={detail.workEntries}
          />

          <section className="panel case-defects-panel">
            <header><div><span className="eyebrow">INSPECTION FINDINGS</span><h2>Defects and exceptions</h2></div><a className="button button-secondary button-small" href={`/api/inspections/${detail.sourceSubmissionId}/pdf`} download><Download size={14} /> Source PDF</a></header>
            {detail.defects.length ? <div className="case-defect-list">{detail.defects.map((defect) => <article key={defect.id} className={defect.blocksDeparture ? "case-defect case-defect-blocking" : "case-defect"}><span className={`severity-chip severity-${defect.severity}`}>{formatEnum(defect.severity)}</span><div><strong>{defect.title}</strong><p>{defect.description || "No additional driver comment."}</p><small>{formatEnum(defect.status)}{defect.blocksDeparture ? " · Blocks departure" : ""}</small></div></article>)}</div> : <div className="inline-empty"><span>No explicit defects</span><p>This case was created by a fail-safe rule-set review requirement.</p></div>}
          </section>

          {detail.reinspection ? <section className="panel reinspection-summary"><header><div><span className="eyebrow">VERIFICATION INSPECTION</span><h2>Reinspection result</h2></div><StatusBadge value={detail.reinspection.disposition} compact /></header><p>Submitted {formatDateTime(detail.reinspection.submittedAt)} · {formatEnum(detail.reinspection.severity)} severity</p><a className="button button-secondary button-small" href={`/api/inspections/${detail.reinspection.id}/pdf`} download><Download size={14} /> Reinspection PDF</a></section> : null}
        </div>

        <aside className="panel case-timeline-panel">
          <header><span className="eyebrow">CHAIN OF CUSTODY</span><h2>Case activity</h2></header>
          <div className="case-timeline">{detail.events.map((event) => <article key={event.id}><span className="case-timeline-marker"><Wrench size={13} /></span><div><strong>{formatEnum(event.action)}</strong><small>{event.actorName ?? "System"}{event.actorRole ? ` · ${formatEnum(event.actorRole)}` : ""}</small><p>{event.note ?? `${formatEnum(event.fromStatus ?? "new")} to ${formatEnum(event.toStatus)}`}</p><time>{formatDateTime(event.createdAt)}</time></div></article>)}</div>
        </aside>
      </section>
    </div>
  );
}
