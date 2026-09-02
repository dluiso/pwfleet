"use client";

import Link from "next/link";
import { ArrowRight, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { vehicleLabel } from "@/lib/format";
import { StatusBadge } from "./status-badge";

type VehicleDirectoryItem = {
  id: string;
  unitNumber: string;
  displayCode: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  currentOdometer: number | null;
  lifecycleStatus: string;
  disposition: string;
  classCode: string;
  className: string;
  qrPublicId: string | null;
};

export function VehicleDirectory({ vehicles }: { vehicles: VehicleDirectoryItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const matchesStatus = status === "all" || vehicle.disposition === status;
      const searchText = [
        vehicle.unitNumber,
        vehicle.displayCode,
        vehicle.make,
        vehicle.model,
        vehicle.className,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [query, status, vehicles]);

  return (
    <>
      <div className="directory-toolbar">
        <label className="search-box">
          <Search size={17} />
          <span className="sr-only">Search vehicles</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search unit, code, make, or model"
          />
        </label>
        <label className="select-box">
          <span className="sr-only">Filter by status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="inspection_required">Inspection required</option>
            <option value="cleared">Cleared</option>
            <option value="cleared_with_advisory">Cleared with advisory</option>
            <option value="hold_for_review">Hold for review</option>
            <option value="out_of_service">Out of service</option>
          </select>
        </label>
      </div>

      <div className="vehicle-grid">
        {filtered.map((vehicle) => (
          <Link className="vehicle-card" href={`/vehicles/${vehicle.id}`} key={vehicle.id}>
            <div className="vehicle-card-top">
              <div className="vehicle-class-icon"><Truck size={22} /></div>
              <StatusBadge value={vehicle.disposition} compact />
            </div>
            <div className="vehicle-card-main">
              <span>{vehicle.className}</span>
              <h2>{vehicleLabel(vehicle)}</h2>
              <p>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle details pending"}</p>
            </div>
            <div className="vehicle-card-footer">
              <div><span>Unit</span><strong>{vehicle.unitNumber}</strong></div>
              <div><span>Odometer</span><strong>{vehicle.currentOdometer?.toLocaleString() ?? "—"}</strong></div>
              <div><span>QR</span><strong>{vehicle.qrPublicId ? "Active" : "Missing"}</strong></div>
              <ArrowRight size={18} />
            </div>
          </Link>
        ))}
      </div>

      {!filtered.length ? (
        <div className="empty-state">
          <Truck size={30} />
          <h2>No vehicles match these filters</h2>
          <p>Change the search text or status filter and try again.</p>
        </div>
      ) : null}
    </>
  );
}
