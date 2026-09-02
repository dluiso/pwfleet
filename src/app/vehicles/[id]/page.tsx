import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  DollarSign,
  Download,
  Fuel,
  Gauge,
  Hash,
  IdCard,
  MapPin,
  Printer,
  QrCode,
  ShieldAlert,
  Truck,
  Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { VehicleDossierDocuments } from "@/components/vehicle-dossier-documents";
import { formatDateTime, formatEnum, vehicleLabel } from "@/lib/format";
import { getVehicleById } from "@/modules/fleet/repository";

export const metadata: Metadata = { title: "Vehicle Profile" };

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const vehicle = await getVehicleById((await params).id);
  if (!vehicle) notFound();
  const primaryPhoto = vehicle.documents.find((document) => document.isPrimary);

  return (
    <div className="page-stack">
      <Link className="back-link" href="/vehicles"><ArrowLeft size={16} /> Back to fleet</Link>

      <section className="vehicle-profile-hero">
        {primaryPhoto ? <div className="vehicle-profile-photo"><Image src={`/api/vehicle-documents/${primaryPhoto.id}`} alt={`${vehicleLabel(vehicle)} profile`} width={62} height={62} unoptimized /></div> : <div className="vehicle-profile-icon"><Truck size={30} /></div>}
        <div className="vehicle-profile-heading">
          <span>{vehicle.className}</span>
          <h1>{vehicleLabel(vehicle)}</h1>
          <p>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}</p>
        </div>
        <StatusBadge value={vehicle.disposition} />
        <div className="hero-actions">
          {vehicle.assignments[0] ? (
            <Link
              className="button button-primary"
              href={`/inspections/new?vehicleId=${vehicle.id}&templateId=${vehicle.assignments[0].templateId}`}
            >
              <ClipboardCheck size={18} /> Start inspection
            </Link>
          ) : null}
        </div>
      </section>

      <section className="profile-layout">
        <div className="profile-main">
          <article className="panel detail-panel">
            <div className="panel-header"><div><span className="eyebrow">ASSET RECORD</span><h2>Vehicle information</h2></div></div>
            <dl className="detail-grid">
              <div><dt><Hash size={15} /> Unit number</dt><dd>{vehicle.unitNumber}</dd></div>
              <div><dt><IdCard size={15} /> Display code</dt><dd>{vehicle.displayCode ?? "Not assigned"}</dd></div>
              <div><dt><Truck size={15} /> Vehicle class</dt><dd>{vehicle.className} · {vehicle.classCode}</dd></div>
              <div><dt><CalendarDays size={15} /> Year</dt><dd>{vehicle.year ?? "Not recorded"}</dd></div>
              <div><dt><Gauge size={15} /> Odometer</dt><dd>{vehicle.currentOdometer?.toLocaleString() ?? "Not recorded"}</dd></div>
              <div><dt><IdCard size={15} /> Asset tag</dt><dd>{vehicle.assetTag ?? "Not recorded"}</dd></div>
              <div><dt><IdCard size={15} /> License plate</dt><dd>{[vehicle.licenseState, vehicle.licensePlate].filter(Boolean).join(" · ") || "Not recorded"}</dd></div>
              <div><dt><Fuel size={15} /> Fuel type</dt><dd>{vehicle.fuelType ?? "Not recorded"}</dd></div>
              <div><dt><MapPin size={15} /> Primary location</dt><dd>{vehicle.primaryLocation ?? "Not recorded"}</dd></div>
              <div><dt><CalendarDays size={15} /> Acquisition</dt><dd>{vehicle.acquisitionDate ? new Date(`${vehicle.acquisitionDate}T00:00:00`).toLocaleDateString("en-US") : "Not recorded"}</dd></div>
              <div><dt><CalendarDays size={15} /> In service</dt><dd>{vehicle.inServiceDate ? new Date(`${vehicle.inServiceDate}T00:00:00`).toLocaleDateString("en-US") : "Not recorded"}</dd></div>
              <div><dt><DollarSign size={15} /> Purchase cost</dt><dd>{vehicle.purchaseCostCents == null ? "Not recorded" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(vehicle.purchaseCostCents / 100)}</dd></div>
              <div><dt><IdCard size={15} /> Ownership</dt><dd>{vehicle.ownershipType ?? "Not recorded"}</dd></div>
              <div className="detail-grid-wide"><dt>VIN</dt><dd>{vehicle.vin ?? "Not recorded"}</dd></div>
              {vehicle.notes ? <div className="detail-grid-wide"><dt>Fleet notes</dt><dd>{vehicle.notes}</dd></div> : null}
            </dl>
          </article>

          {vehicle.mayViewDocuments ? <VehicleDossierDocuments vehicleId={vehicle.id} documents={vehicle.documents} mayManage={vehicle.mayManageDocuments} /> : null}

          <article className="panel detail-panel">
            <div className="panel-header"><div><span className="eyebrow">INSPECTION PROGRAMS</span><h2>Assigned forms</h2></div></div>
            <div className="assignment-list">
              {vehicle.assignments.map((assignment) => (
                <div className="assignment-row" key={assignment.id}>
                  <div className="assignment-icon"><ClipboardCheck size={20} /></div>
                  <div><strong>{assignment.templateName}</strong><span>Version {assignment.templateVersion} · {formatEnum(assignment.frequency)}</span></div>
                  <span className={assignment.ruleSetStatus === "approved" ? "policy-pill approved" : "policy-pill draft"}>{formatEnum(assignment.ruleSetStatus)} rules</span>
                  <Link className="button button-secondary button-small" href={`/inspections/new?vehicleId=${vehicle.id}&templateId=${assignment.templateId}`}>Open</Link>
                </div>
              ))}
            </div>
          </article>

          <article className="panel detail-panel">
            <div className="panel-header"><div><span className="eyebrow">OPERATING HISTORY</span><h2>Recent inspections</h2></div></div>
            {vehicle.recentInspections.length ? <div className="dossier-timeline">{vehicle.recentInspections.map((inspection) => <div key={inspection.id}><span className="timeline-icon"><ClipboardCheck size={17} /></span><div><strong>{inspection.templateName} · v{inspection.templateVersion}</strong><span>{inspection.driverName} · {formatDateTime(inspection.submittedAt)}</span></div><StatusBadge value={inspection.disposition} compact /><a className="button button-secondary button-small" href={`/api/inspections/${inspection.id}/pdf`} target="_blank">PDF</a></div>)}</div> : <div className="inline-empty"><span>No completed inspections</span><p>Submitted inspections will build the vehicle operating history.</p></div>}
          </article>

          <article className="panel detail-panel">
            <div className="panel-header"><div><span className="eyebrow">MAINTENANCE HISTORY</span><h2>Safety cases & costs</h2></div></div>
            {vehicle.safetyHistory.length ? <div className="dossier-timeline">{vehicle.safetyHistory.map((item) => <div key={item.id}><span className="timeline-icon"><Wrench size={17} /></span><div><strong>{item.summary || "Vehicle safety case"}</strong><span>{formatEnum(item.priority)} priority · Opened {formatDateTime(item.createdAt)} · {(item.totalLaborMinutes / 60).toFixed(1)} labor hours</span></div><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.totalCostCents / 100)}</strong><Link className="button button-secondary button-small" href={`/maintenance/${item.id}`}>Open</Link></div>)}</div> : <div className="inline-empty"><span>No maintenance cases</span><p>Repair history, labor, parts, and costs will appear here.</p></div>}
          </article>

          <article className="panel detail-panel">
            <div className="panel-header"><div><span className="eyebrow">EXCEPTIONS</span><h2>Open defects</h2></div></div>
            {vehicle.openDefects.length ? (
              <div className="defect-list">{vehicle.openDefects.map((defect) => <div className="defect-row" key={defect.id}><ShieldAlert size={18} /><div><strong>{defect.title}</strong><span>{formatEnum(defect.severity)} · {formatEnum(defect.status)}</span></div></div>)}</div>
            ) : (
              <div className="inline-empty"><span>No open defects</span><p>New defects will appear here after an inspection.</p></div>
            )}
          </article>
        </div>

        <aside className="profile-sidebar">
          <article className="qr-label-card">
            <div className="qr-label-heading"><span>CITY OF HARVEY</span><strong>PUBLIC WORKS</strong></div>
            <div className="qr-label-unit">VEHICLE {vehicleLabel(vehicle)}</div>
            {vehicle.qrPublicId ? (
              <Image
                className="qr-image"
                src={`/api/qr/${vehicle.qrPublicId}`}
                alt={`QR code for ${vehicleLabel(vehicle)}`}
                width={230}
                height={230}
                unoptimized
                priority
              />
            ) : <div className="qr-placeholder"><QrCode size={48} /><span>QR not generated</span></div>}
            <strong className="qr-instruction">SCAN BEFORE OPERATING</strong>
            <span className="qr-label-id">Unit {vehicle.unitNumber} · {vehicle.classCode}</span>
          </article>
          {vehicle.qrPublicId ? (
            <div className="qr-actions">
              <Link className="button button-primary" href={`/vehicles/${vehicle.id}/qr/print`}><Printer size={17} /> Print label</Link>
              <a className="button button-secondary" href={`/api/qr/${vehicle.qrPublicId}?download=1`}><Download size={17} /> Download SVG</a>
            </div>
          ) : null}
          <div className="metadata-note"><span>QR status</span><strong>{formatEnum(vehicle.qrStatus ?? "missing")}</strong><p>Activated {formatDateTime(vehicle.qrActivatedAt)}</p><p>Last scanned {formatDateTime(vehicle.qrLastScannedAt)}</p></div>
        </aside>
      </section>
    </div>
  );
}
