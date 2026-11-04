import Link from "next/link";
import { Search } from "lucide-react";
import { formatDateTime, formatEnum } from "@/lib/format";
import { listAuditTrail } from "@/modules/administration/service";

export default async function AuditTrailPage({ searchParams }: { searchParams: Promise<{ eventType?: string; entityType?: string }> }) {
  const filters = await searchParams;
  const events = await listAuditTrail(filters);
  return <div className="page-stack">
    <section className="page-heading-row"><div><span className="eyebrow">ACCOUNTABILITY</span><h1>Audit trail</h1><p>Review administrative and operational changes recorded by the application.</p></div></section>
    <form className="panel audit-filter-bar" method="get"><label><span>Event type</span><input name="eventType" defaultValue={filters.eventType ?? ""} placeholder="vehicle.updated" /></label><label><span>Entity type</span><input name="entityType" defaultValue={filters.entityType ?? ""} placeholder="vehicle" /></label><button className="button button-secondary" type="submit"><Search size={15} /> Filter</button><Link className="button button-secondary" href="/settings/audit">Reset</Link></form>
    <section className="panel records-panel"><div className="panel-header"><div><span className="eyebrow">LATEST EVENTS</span><h2>Recorded activity</h2></div><span className="record-count">{events.length} events · latest 250</span></div>{events.length ? <div className="audit-table-wrap"><table className="admin-table"><thead><tr><th>Time</th><th>Event</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDateTime(event.createdAt)}</td><td><strong>{event.eventType}</strong></td><td>{formatEnum(event.entityType)}{event.entityId ? <small>{event.entityId}</small> : null}</td><td>{event.actorName ?? "System"}<small>{event.actorEmail ?? "Automated event"}</small></td><td><code>{JSON.stringify(event.metadata)}</code></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No matching audit events</strong><p>Change the filters or perform an auditable operation.</p></div>}</section>
  </div>;
}
