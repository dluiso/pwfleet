import Link from "next/link";
import { Download, FileText, QrCode } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatEnum, vehicleLabel } from "@/lib/format";
import { listInspectionReports } from "@/modules/reports/repository";

export default async function InspectionsPage() {
  const reports = await listInspectionReports();

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <span className="eyebrow">OPERATIONS RECORDS</span>
          <h1>Inspections</h1>
          <p>Submitted forms, safety outcomes, and exportable records.</p>
        </div>
        <Link className="button button-primary" href="/scan">
          <QrCode size={17} /> Start from vehicle QR
        </Link>
      </section>

      <section className="panel records-panel">
        <div className="panel-header">
          <div><span className="eyebrow">RECENT</span><h2>Inspection records</h2></div>
          <span className="record-count">{reports.length} records</span>
        </div>
        {reports.length ? (
          <div className="records-list">
            {reports.map((report) => (
              <article className="record-row" key={report.id}>
                <div className="record-icon"><FileText size={19} /></div>
                <div className="record-main">
                  <strong>{vehicleLabel(report)} - {report.templateName}</strong>
                  <span>{formatDateTime(report.submittedAt)} by {report.inspectorName}</span>
                  <small>Version {report.templateVersion} · {formatEnum(report.severity)} severity</small>
                </div>
                <StatusBadge value={report.disposition} compact />
                <a
                  className="button button-secondary button-small"
                  href={`/api/inspections/${report.id}/pdf`}
                  download
                >
                  <Download size={15} /> PDF
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={28} />
            <strong>No inspection records yet</strong>
            <p>Scan a vehicle QR code and submit its assigned form.</p>
          </div>
        )}
      </section>
    </div>
  );
}
