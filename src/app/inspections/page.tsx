import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileText, QrCode, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, vehicleLabel } from "@/lib/format";
import { countInspectionReports, listInspectionReports } from "@/modules/reports/repository";

const pageSize = 50;

export default async function InspectionsPage({ searchParams }: PageProps<"/inspections">) {
  const params = await searchParams;
  const requestedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const totalReports = await countInspectionReports();
  const totalPages = Math.max(1, Math.ceil(totalReports / pageSize));
  const page = Math.min(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1, totalPages);
  const reports = await listInspectionReports(pageSize, (page - 1) * pageSize);

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
          <span className="record-count">{totalReports} records</span>
        </div>
        {reports.length ? (
          <div className="records-list">
            {reports.map((report) => (
              <article className="record-row" key={report.id}>
                <div className="record-icon"><FileText size={19} /></div>
                <div className="record-main">
                  <strong>{vehicleLabel(report)} - {report.templateName}</strong>
                  <span>{formatDateTime(report.submittedAt)} by {report.inspectorName}</span>
                  {report.defectCount ? (
                    <small className={report.blockingDefectCount ? "record-attention record-attention-blocking" : "record-attention"}>
                      <TriangleAlert size={12} /> {report.defectCount} reported {report.defectCount === 1 ? "defect" : "defects"}{report.blockingDefectCount ? " · departure blocked" : ""}
                    </small>
                  ) : <small>Version {report.templateVersion} · No reported defects</small>}
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
        {totalPages > 1 ? (
          <nav className="records-pagination" aria-label="Inspection record pages">
            {page > 1 ? <Link className="button button-secondary button-small" href={`/inspections?page=${page - 1}`}><ChevronLeft size={15} /> Previous</Link> : <span />}
            <span>Page {page} of {totalPages}</span>
            {page < totalPages ? <Link className="button button-secondary button-small" href={`/inspections?page=${page + 1}`}>Next <ChevronRight size={15} /></Link> : <span />}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
