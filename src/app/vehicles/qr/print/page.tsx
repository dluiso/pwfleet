import Image from "next/image";
import { PrintButton } from "@/components/print-button";
import { vehicleLabel } from "@/lib/format";
import { listVehicles } from "@/modules/fleet/repository";

export default async function PrintQrBatchPage() {
  const vehicles = (await listVehicles()).filter((vehicle) => vehicle.qrPublicId);

  return (
    <div className="print-label-page print-label-batch-page">
      <PrintButton />
      {vehicles.length ? (
        <div className="print-label-batch">
          {vehicles.map((vehicle) => (
            <article className="printable-qr-label" key={vehicle.id}>
              <div className="print-label-seal">H</div>
              <div className="print-label-title"><span>CITY OF HARVEY</span><strong>PUBLIC WORKS FLEET</strong></div>
              <div className="print-label-rule" />
              <span className="print-label-vehicle">VEHICLE</span>
              <strong className="print-label-code">{vehicleLabel(vehicle)}</strong>
              <Image src={`/api/qr/${vehicle.qrPublicId}`} alt={`QR label for ${vehicleLabel(vehicle)}`} width={390} height={390} unoptimized />
              <strong className="print-label-instruction">SCAN BEFORE OPERATING</strong>
              <span className="print-label-subtitle">Sign in to complete the required vehicle inspection</span>
              <span className="print-label-reference">UNIT {vehicle.unitNumber} · LABEL {vehicle.qrPublicId!.slice(0, 8).toUpperCase()}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><strong>No active QR labels</strong><p>Issue a QR label from Vehicle administration before printing a batch.</p></div>
      )}
    </div>
  );
}
