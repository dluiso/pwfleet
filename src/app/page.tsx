import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  QrCode,
  ShieldAlert,
  TriangleAlert,
  Truck,
  Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { getFleetDashboard } from "@/modules/fleet/repository";
import { vehicleLabel } from "@/lib/format";

export default async function DashboardPage() {
  const dashboard = await getFleetDashboard();

  return (
    <div className="page-stack">
      <section className="hero-row">
        <div>
          <span className="eyebrow">FLEET COMMAND</span>
          <h1>Good afternoon.</h1>
          <p>Here is the current readiness picture for Harvey Public Works.</p>
        </div>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/vehicles">
            <Truck size={18} /> View fleet
          </Link>
          <Link className="button button-primary" href="/scan">
            <QrCode size={18} /> Scan vehicle
          </Link>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Fleet readiness metrics">
        <article className="metric-card metric-card-strong">
          <div className="metric-icon"><Truck size={21} /></div>
          <div><span>Active vehicles</span><strong>{dashboard.metrics.totalActive}</strong></div>
          <small>Registered fleet</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon metric-icon-success"><CheckCircle2 size={21} /></div>
          <div><span>Cleared</span><strong>{dashboard.metrics.cleared}</strong></div>
          <small>Ready for service</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon metric-icon-warning"><Clock3 size={21} /></div>
          <div><span>Inspection due</span><strong>{dashboard.metrics.inspectionRequired}</strong></div>
          <small>Action required</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon metric-icon-danger"><ShieldAlert size={21} /></div>
          <div><span>Out of service</span><strong>{dashboard.metrics.outOfService}</strong></div>
          <small>Do not operate</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel fleet-readiness-panel">
          <div className="panel-header">
            <div><span className="eyebrow">LIVE STATUS</span><h2>Fleet readiness</h2></div>
            <Link className="text-link" href="/vehicles">View all <ArrowRight size={15} /></Link>
          </div>
          <div className="fleet-status-list">
            {dashboard.fleet.map((vehicle) => (
              <Link className="fleet-status-row" href={`/vehicles/${vehicle.id}`} key={vehicle.id}>
                <div className="vehicle-monogram">{vehicle.classCode}</div>
                <div className="fleet-status-main">
                  <strong>{vehicleLabel(vehicle)}</strong>
                  <span>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}</span>
                </div>
                <div className="fleet-status-meta">
                  {vehicle.openDefects ? (
                    <span className="defect-count"><TriangleAlert size={14} /> {vehicle.openDefects}</span>
                  ) : null}
                  <StatusBadge value={vehicle.disposition} compact />
                </div>
                <ArrowRight className="row-arrow" size={17} />
              </Link>
            ))}
          </div>
        </article>

        <aside className="dashboard-side-stack">
          <article className="panel action-panel">
            <div className="panel-header compact"><div><span className="eyebrow">TODAY</span><h2>Action center</h2></div></div>
            <Link className="action-item" href="/vehicles?status=inspection_required">
              <span className="action-icon action-icon-blue"><ClipboardCheck size={18} /></span>
              <div><strong>{dashboard.metrics.inspectionRequired} inspections due</strong><span>Before first departure</span></div>
              <ArrowRight size={16} />
            </Link>
            <Link className="action-item" href="/maintenance">
              <span className="action-icon action-icon-amber"><Wrench size={18} /></span>
              <div><strong>{dashboard.metrics.openDefects} open defects</strong><span>Review maintenance queue</span></div>
              <ArrowRight size={16} />
            </Link>
            <Link className="action-item" href="/settings/forms">
              <span className="action-icon action-icon-red"><ShieldAlert size={18} /></span>
              <div><strong>Safety rules are draft</strong><span>Approval required before production</span></div>
              <ArrowRight size={16} />
            </Link>
          </article>

          <article className="safety-callout">
            <ShieldAlert size={22} />
            <div><strong>Safety first</strong><p>Any unconfigured defect is automatically held for supervisor review.</p></div>
          </article>
        </aside>
      </section>
    </div>
  );
}

