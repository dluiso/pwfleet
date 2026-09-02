import type { Metadata } from "next";
import { Plus, QrCode } from "lucide-react";
import { VehicleDirectory } from "@/components/vehicle-directory";
import { listVehicles } from "@/modules/fleet/repository";

export const metadata: Metadata = { title: "Fleet" };

export default async function VehiclesPage() {
  const vehicles = await listVehicles();
  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div><span className="eyebrow">FLEET REGISTRY</span><h1>Vehicles</h1><p>Manage vehicle profiles, readiness, and QR access.</p></div>
        <div className="hero-actions">
          <button className="button button-secondary" type="button"><QrCode size={18} /> Print QR batch</button>
          <button className="button button-primary" type="button"><Plus size={18} /> Add vehicle</button>
        </div>
      </section>
      <VehicleDirectory vehicles={vehicles} />
    </div>
  );
}

