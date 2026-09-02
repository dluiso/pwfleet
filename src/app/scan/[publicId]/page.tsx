import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertOctagon, ArrowRight, CheckCircle2, ClipboardCheck, ShieldAlert, Truck } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { vehicleLabel } from "@/lib/format";
import { getVehicleByQrPublicId } from "@/modules/fleet/repository";

export default async function ScannedVehiclePage({ params }: { params: Promise<{ publicId: string }> }) {
  const vehicle = await getVehicleByQrPublicId((await params).publicId);
  if (!vehicle) notFound();
  const label = vehicleLabel(vehicle);
  const blocking = !["cleared", "cleared_with_advisory"].includes(vehicle.disposition);
  const assignment = vehicle.assignments[0];
  const reinspectionRequested = vehicle.activeSafetyCase?.status === "awaiting_reinspection";
  const canStartInspection = !vehicle.activeSafetyCase || reinspectionRequested;

  return (
    <div className="scanned-vehicle-page">
      <section className="scan-confirmation-card">
        <div className="scan-confirmation-icon"><Truck size={38} /></div>
        <span className="eyebrow">QR VERIFIED</span>
        <h1>{label}</h1>
        <p>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}</p>
        <StatusBadge value={vehicle.disposition} />
      </section>

      {blocking ? (
        <section className="vehicle-stop-alert" role="alert">
          <AlertOctagon size={34} />
          <div>
            <span>DO NOT OPERATE</span>
            <h2>This vehicle is not cleared for departure</h2>
            <p>{reinspectionRequested
              ? "Maintenance has requested a reinspection. The vehicle remains restricted until an authorized supervisor approves release."
              : vehicle.activeSafetyCase
                ? "An active safety case is open. Wait for instructions from a supervisor or Fleet Management before starting another inspection."
                : "Complete the assigned pre-trip inspection and follow every hold or supervisor instruction before departure."}</p>
          </div>
        </section>
      ) : vehicle.openDefects.length ? (
        <section className="vehicle-review-alert"><ShieldAlert size={25} /><div><strong>{vehicle.openDefects.length} open defect{vehicle.openDefects.length === 1 ? "" : "s"}</strong><p>Review existing items before operating this vehicle.</p></div></section>
      ) : (
        <section className="vehicle-clear-note"><CheckCircle2 size={22} /><div><strong>No open defects found</strong><p>A current inspection is still required before departure.</p></div></section>
      )}

      <section className="panel assigned-form-card">
        <div className="panel-header"><div><span className="eyebrow">REQUIRED NOW</span><h2>Assigned inspection</h2></div></div>
        {assignment ? (
          <div className="assigned-form-main">
            <div className="assignment-icon"><ClipboardCheck size={23} /></div>
            <div><strong>{assignment.templateName}</strong><span>Version {assignment.templateVersion} · {assignment.frequency.replaceAll("_", " ")}</span><p>{assignment.templateDescription}</p></div>
            {canStartInspection
              ? <Link className="button button-primary" href={`/inspections/new?vehicleId=${vehicle.id}&templateId=${assignment.templateId}&qrCodeId=${vehicle.qrId}`}>{reinspectionRequested ? "Start reinspection" : "Start inspection"} <ArrowRight size={17} /></Link>
              : <span className="button button-secondary" aria-disabled="true">Await safety-case action</span>}
          </div>
        ) : <div className="inline-empty"><span>No inspection assigned</span><p>Contact Fleet Management before operating this vehicle.</p></div>}
      </section>
    </div>
  );
}
