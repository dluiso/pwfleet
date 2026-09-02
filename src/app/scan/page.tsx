import Link from "next/link";
import { Camera, ChevronRight, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { listVehicles } from "@/modules/fleet/repository";
import { vehicleLabel } from "@/lib/format";

export default async function ScanLandingPage() {
  const fleet = (await listVehicles()).filter((vehicle) => vehicle.qrPublicId);
  return (
    <div className="scan-page">
      <section className="scan-intro">
        <div className="scan-graphic"><Smartphone size={54} /><QrCode size={30} /></div>
        <span className="eyebrow">VEHICLE ACCESS</span>
        <h1>Scan a vehicle label</h1>
        <p>Use your phone or tablet camera to scan the QR label installed on the vehicle. The secure link will identify the unit and open its assigned inspection.</p>
        <div className="scan-security-note"><ShieldCheck size={18} /><span>The QR identifies a vehicle. It does not authenticate a user or expose vehicle data.</span></div>
      </section>
      <section className="panel scan-demo-panel">
        <div className="panel-header"><div><span className="eyebrow">DEVELOPMENT ACCESS</span><h2>Available test labels</h2></div><Camera size={20} /></div>
        <div className="scan-vehicle-list">
          {fleet.map((vehicle) => (
            <Link href={`/scan/${vehicle.qrPublicId}`} key={vehicle.id}>
              <span className="vehicle-monogram">{vehicle.classCode}</span>
              <div><strong>{vehicleLabel(vehicle)}</strong><small>{vehicle.className} · Unit {vehicle.unitNumber}</small></div>
              <ChevronRight size={18} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

