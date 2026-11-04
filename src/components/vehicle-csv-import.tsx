"use client";

import { FileDown, FileUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type VehicleClass = { id: string; code: string; name: string };
const headers = ["unitNumber", "displayCode", "vehicleClassCode", "year", "make", "model", "vin", "licenseState", "licensePlate", "currentOdometer", "assetTag", "fuelType", "ownershipType", "primaryLocation", "acquisitionDate", "inServiceDate", "purchaseCost", "notes", "lifecycleStatus"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (character !== "\r") field += character;
  }
  row.push(field);
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (row.some((value) => value.length) || rows.length === 0) rows.push(row);
  return rows;
}

export function VehicleCsvImport({ classes }: { classes: VehicleClass[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sample = `${headers.join(",")}\n03,DT-03,DT,2024,Mack,Granite,,IL,PW03,12500,PW-ASSET-003,Diesel,City owned,Public Works Yard,2024-01-15,2024-02-01,185000.00,Primary dump truck,active\n`;

  async function importFile() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const rows = parseCsv(await file.text());
      const csvHeaders = rows.shift()?.map((value) => value.trim()) ?? [];
      for (const required of ["unitNumber", "vehicleClassCode"]) if (!csvHeaders.includes(required)) throw new Error(`Missing required column: ${required}.`);
      if (new Set(csvHeaders).size !== csvHeaders.length) throw new Error("The CSV contains duplicate column names.");
      const classByCode = new Map(classes.map((item) => [item.code.toUpperCase(), item.id]));
      const vehicles = rows.filter((row) => row.some((value) => value.trim())).map((row, rowIndex) => {
        const record = Object.fromEntries(csvHeaders.map((header, index) => [header, row[index]?.trim() ?? ""]));
        const optionalNumber = (column: string, integer = true) => {
          if (!record[column]) return undefined;
          const value = Number(record[column]);
          if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) throw new Error(`Row ${rowIndex + 2}: ${column} must be a valid ${integer ? "whole number" : "number"}.`);
          return value;
        };
        const vehicleClassId = classByCode.get(record.vehicleClassCode?.toUpperCase() ?? "");
        if (!vehicleClassId) throw new Error(`Row ${rowIndex + 2}: unknown active vehicle class “${record.vehicleClassCode}”.`);
        return {
          unitNumber: record.unitNumber,
          displayCode: record.displayCode,
          vehicleClassId,
          year: optionalNumber("year"),
          make: record.make,
          model: record.model,
          vin: record.vin,
          licenseState: record.licenseState,
          licensePlate: record.licensePlate,
          currentOdometer: optionalNumber("currentOdometer"),
          assetTag: record.assetTag,
          fuelType: record.fuelType,
          ownershipType: record.ownershipType,
          primaryLocation: record.primaryLocation,
          acquisitionDate: record.acquisitionDate,
          inServiceDate: record.inServiceDate,
          purchaseCostCents: record.purchaseCost ? Math.round(optionalNumber("purchaseCost", false)! * 100) : undefined,
          notes: record.notes,
          lifecycleStatus: record.lifecycleStatus || "active",
        };
      });
      if (!vehicles.length) throw new Error("The CSV does not contain any vehicle rows.");
      const response = await fetch("/api/admin/vehicles/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicles }) });
      const payload = (await response.json()) as { imported?: number; error?: string; details?: { fieldErrors?: Record<string, string[]> } };
      if (!response.ok) throw new Error(Object.values(payload.details?.fieldErrors ?? {}).flat()[0] ?? payload.error ?? "The import could not be completed.");
      setFile(null);
      setMessage(`${payload.imported} vehicle${payload.imported === 1 ? "" : "s"} imported with active QR labels.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="button button-secondary" type="button" onClick={() => setOpen(true)}><FileUp size={16} /> Import CSV</button>
    {open ? <div className="modal-backdrop" role="presentation"><section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="vehicle-import-title"><header><div><span className="eyebrow">BULK REGISTRATION</span><h2 id="vehicle-import-title">Import vehicles</h2></div><button className="icon-button" disabled={busy} type="button" aria-label="Close dialog" onClick={() => setOpen(false)}><X size={19} /></button></header><div className="modal-body admin-form-grid"><p className="admin-form-hint admin-form-wide">The import is atomic: if any row is invalid, no vehicles are created. Every accepted vehicle receives its own active QR label.</p><a className="button button-secondary admin-form-wide" download="pwfleet-vehicle-import-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`}><FileDown size={15} /> Download CSV template</a><label className="admin-form-wide"><span>Completed CSV file *</span><input accept=".csv,text/csv" type="file" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); setMessage(null); }} /></label>{file ? <p className="admin-form-hint admin-form-wide">Ready: {file.name}</p> : null}{error ? <p className="modal-error admin-form-wide" role="alert">{error}</p> : null}{message ? <p className="form-feedback form-feedback-success admin-form-wide" role="status">{message}</p> : null}</div><footer><button className="button button-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Close</button><button className="button button-primary" type="button" disabled={busy || !file} onClick={() => void importFile()}>{busy ? "Importing…" : "Validate and import"}</button></footer></section></div> : null}
  </>;
}
