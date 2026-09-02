import Image from "next/image";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { getVehicleById } from "@/modules/fleet/repository";
import { vehicleLabel } from "@/lib/format";

export default async function PrintQrPage({ params }: { params: Promise<{ id: string }> }) {
  const vehicle = await getVehicleById((await params).id);
  if (!vehicle?.qrPublicId) notFound();

  return (
    <div className="print-label-page">
      <PrintButton />
      <article className="printable-qr-label">
        <div className="print-label-seal">H</div>
        <div className="print-label-title"><span>CITY OF HARVEY</span><strong>PUBLIC WORKS FLEET</strong></div>
        <div className="print-label-rule" />
        <span className="print-label-vehicle">VEHICLE</span>
        <strong className="print-label-code">{vehicleLabel(vehicle)}</strong>
        <Image src={`/api/qr/${vehicle.qrPublicId}`} alt={`QR label for ${vehicleLabel(vehicle)}`} width={390} height={390} unoptimized />
        <strong className="print-label-instruction">SCAN BEFORE OPERATING</strong>
        <span className="print-label-subtitle">Sign in to complete the required vehicle inspection</span>
        <span className="print-label-reference">UNIT {vehicle.unitNumber} · LABEL {vehicle.qrPublicId.slice(0, 8).toUpperCase()}</span>
      </article>
    </div>
  );
}

