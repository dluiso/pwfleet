"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleMinus, ClipboardPlus, Pencil, Plus, QrCode, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatEnum, vehicleLabel } from "@/lib/format";
import { StatusBadge } from "./status-badge";

type Vehicle = {
  id: string;
  unitNumber: string;
  displayCode: string | null;
  vehicleClassId: string;
  classCode: string;
  className: string;
  vin: string | null;
  licensePlate: string | null;
  licenseState: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  currentOdometer: number | null;
  assetTag: string | null;
  acquisitionDate: string | null;
  purchaseCostCents: number | null;
  inServiceDate: string | null;
  fuelType: string | null;
  ownershipType: string | null;
  primaryLocation: string | null;
  notes: string | null;
  lifecycleStatus: "active" | "inactive" | "disposed";
  disposition: string;
  recordVersion: number;
  qrPublicId: string | null;
  qrStatus: string | null;
};

type VehicleClass = { id: string; code: string; name: string };
type Template = { id: string; code: string; name: string; version: number; ruleSetStatus: string };
type Assignment = {
  id: string;
  vehicleId: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  frequency: string;
  autoLaunch: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

type ModalState =
  | { kind: "vehicle"; vehicle: Vehicle | null }
  | { kind: "qr"; vehicle: Vehicle }
  | { kind: "assignment"; vehicle: Vehicle }
  | null;

const emptyVehicle = {
  unitNumber: "",
  displayCode: "",
  vehicleClassId: "",
  vin: "",
  licensePlate: "",
  licenseState: "IL",
  year: "",
  make: "",
  model: "",
  currentOdometer: "",
  assetTag: "",
  acquisitionDate: "",
  purchaseCost: "",
  inServiceDate: "",
  fuelType: "",
  ownershipType: "",
  primaryLocation: "",
  notes: "",
  lifecycleStatus: "active",
};

async function requestJson(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The operation could not be completed.");
  return payload;
}

export function AdminVehicleManager({
  vehicles,
  classes,
  templates,
  assignments,
}: {
  vehicles: Vehicle[];
  classes: VehicleClass[];
  templates: Template[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [qrReason, setQrReason] = useState("");
  const [assignmentForm, setAssignmentForm] = useState({ templateId: "", frequency: "before_first_departure", autoLaunch: true });

  function openVehicleEditor(vehicle: Vehicle | null) {
    setVehicleForm(
      vehicle
        ? {
            unitNumber: vehicle.unitNumber,
            displayCode: vehicle.displayCode ?? "",
            vehicleClassId: vehicle.vehicleClassId,
            vin: vehicle.vin ?? "",
            licensePlate: vehicle.licensePlate ?? "",
            licenseState: vehicle.licenseState ?? "IL",
            year: vehicle.year?.toString() ?? "",
            make: vehicle.make ?? "",
            model: vehicle.model ?? "",
            currentOdometer: vehicle.currentOdometer?.toString() ?? "",
            assetTag: vehicle.assetTag ?? "",
            acquisitionDate: vehicle.acquisitionDate ?? "",
            purchaseCost: vehicle.purchaseCostCents == null ? "" : (vehicle.purchaseCostCents / 100).toFixed(2),
            inServiceDate: vehicle.inServiceDate ?? "",
            fuelType: vehicle.fuelType ?? "",
            ownershipType: vehicle.ownershipType ?? "",
            primaryLocation: vehicle.primaryLocation ?? "",
            notes: vehicle.notes ?? "",
            lifecycleStatus: vehicle.lifecycleStatus,
          }
        : { ...emptyVehicle, vehicleClassId: classes[0]?.id ?? "" },
    );
    setModal({ kind: "vehicle", vehicle });
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter((vehicle) =>
      [vehicle.unitNumber, vehicle.displayCode, vehicle.make, vehicle.model, vehicle.vin, vehicle.licensePlate]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [search, vehicles]);

  function closeModal() {
    if (busy) return;
    setModal(null);
    setError(null);
    setQrReason("");
  }

  async function saveVehicle(event: React.FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "vehicle") return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...vehicleForm,
        ...(vehicleForm.year ? { year: Number(vehicleForm.year) } : {}),
        ...(vehicleForm.currentOdometer ? { currentOdometer: Number(vehicleForm.currentOdometer) } : {}),
        ...(vehicleForm.purchaseCost ? { purchaseCostCents: Math.round(Number(vehicleForm.purchaseCost) * 100) } : {}),
        ...(modal.vehicle ? { recordVersion: modal.vehicle.recordVersion } : {}),
      };
      await requestJson(
        modal.vehicle ? `/api/admin/vehicles/${modal.vehicle.id}` : "/api/admin/vehicles",
        modal.vehicle ? "PATCH" : "POST",
        body,
      );
      closeModal();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The vehicle could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceQr(event: React.FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "qr") return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/admin/vehicles/${modal.vehicle.id}/qr`, "POST", { reason: qrReason });
      closeModal();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The QR label could not be replaced.");
    } finally {
      setBusy(false);
    }
  }

  async function assignForm(event: React.FormEvent) {
    event.preventDefault();
    if (modal?.kind !== "assignment") return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/admin/vehicles/${modal.vehicle.id}/assignments`, "POST", assignmentForm);
      closeModal();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The form could not be assigned.");
    } finally {
      setBusy(false);
    }
  }

  async function endAssignment(assignment: Assignment) {
    if (!window.confirm(`End the ${assignment.templateName} assignment for this vehicle? Inspection history will be preserved.`)) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/admin/assignments/${assignment.id}`, "PATCH", { action: "end" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The form assignment could not be ended.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div><span className="eyebrow">FLEET CONFIGURATION</span><h1>Vehicle administration</h1><p>Create fleet records, manage QR labels, and assign inspection forms.</p></div>
        <button className="button button-primary" type="button" onClick={() => openVehicleEditor(null)}><Plus size={17} /> Add vehicle</button>
      </section>
      <section className="panel admin-table-panel">
        <div className="directory-toolbar">
          <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search unit, VIN, plate, make…" /></label>
          <span className="record-count">{filtered.length} of {vehicles.length} vehicles</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Vehicle</th><th>Class</th><th>Plate / VIN</th><th>Operational status</th><th>Forms</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{filtered.map((vehicle) => {
              const vehicleAssignments = assignments.filter((assignment) => assignment.vehicleId === vehicle.id);
              return <tr key={vehicle.id}><td><div className="table-primary"><span className="vehicle-monogram">{vehicle.classCode}</span><div><strong>{vehicleLabel(vehicle)}</strong><span>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Description pending"}</span></div></div></td><td>{vehicle.className}<small>{formatEnum(vehicle.lifecycleStatus)}</small></td><td>{[vehicle.licenseState, vehicle.licensePlate].filter(Boolean).join(" ") || "Not recorded"}<small>{vehicle.vin ?? "VIN not recorded"}</small></td><td><StatusBadge value={vehicle.disposition} compact /></td><td><strong>{vehicleAssignments.length}</strong><small>{vehicleAssignments.map((assignment) => assignment.templateName).join(", ") || "No active form"}</small></td><td><div className="table-actions"><button type="button" title="Edit vehicle" onClick={() => openVehicleEditor(vehicle)}><Pencil size={15} /></button><button type="button" title="Manage QR" onClick={() => setModal({ kind: "qr", vehicle })}><QrCode size={15} /></button><button type="button" title="Assign form" onClick={() => { setAssignmentForm({ templateId: templates[0]?.id ?? "", frequency: "before_first_departure", autoLaunch: true }); setModal({ kind: "assignment", vehicle }); }}><ClipboardPlus size={15} /></button></div></td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      {modal ? <div className="modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title"><header><div><span className="eyebrow">ADMINISTRATION</span><h2 id="admin-modal-title">{modal.kind === "vehicle" ? `${modal.vehicle ? "Edit" : "Add"} vehicle` : modal.kind === "qr" ? `QR label · ${vehicleLabel(modal.vehicle)}` : `Assign form · ${vehicleLabel(modal.vehicle)}`}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={closeModal}><X size={19} /></button></header>
        {modal.kind === "vehicle" ? <form onSubmit={saveVehicle}>
          <div className="admin-form-grid">
            <label><span>Unit number *</span><input required maxLength={24} value={vehicleForm.unitNumber} onChange={(event) => setVehicleForm({ ...vehicleForm, unitNumber: event.target.value })} placeholder="03" /></label>
            <label><span>Display code</span><input maxLength={40} value={vehicleForm.displayCode} onChange={(event) => setVehicleForm({ ...vehicleForm, displayCode: event.target.value })} placeholder="DT-03" /></label>
            <label><span>Asset tag</span><input maxLength={64} value={vehicleForm.assetTag} onChange={(event) => setVehicleForm({ ...vehicleForm, assetTag: event.target.value })} placeholder="PW-ASSET-004" /></label>
            <label><span>Vehicle class *</span><select required value={vehicleForm.vehicleClassId} onChange={(event) => setVehicleForm({ ...vehicleForm, vehicleClassId: event.target.value })}>{classes.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label><span>Lifecycle status *</span><select value={vehicleForm.lifecycleStatus} onChange={(event) => setVehicleForm({ ...vehicleForm, lifecycleStatus: event.target.value as typeof vehicleForm.lifecycleStatus })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="disposed">Disposed</option></select></label>
            <label><span>Year</span><input type="number" min="1900" max={new Date().getFullYear() + 2} value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} /></label>
            <label><span>Make</span><input value={vehicleForm.make} maxLength={80} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} /></label>
            <label><span>Model</span><input value={vehicleForm.model} maxLength={120} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} /></label>
            <label><span>Current odometer</span><input type="number" min="0" value={vehicleForm.currentOdometer} onChange={(event) => setVehicleForm({ ...vehicleForm, currentOdometer: event.target.value })} /></label>
            <label><span>Fuel type</span><input list="fuel-types" maxLength={40} value={vehicleForm.fuelType} onChange={(event) => setVehicleForm({ ...vehicleForm, fuelType: event.target.value })} placeholder="Diesel" /><datalist id="fuel-types"><option value="Diesel" /><option value="Gasoline" /><option value="Electric" /><option value="Hybrid" /><option value="CNG" /></datalist></label>
            <label><span>Ownership</span><input list="ownership-types" maxLength={40} value={vehicleForm.ownershipType} onChange={(event) => setVehicleForm({ ...vehicleForm, ownershipType: event.target.value })} placeholder="City owned" /><datalist id="ownership-types"><option value="City owned" /><option value="Leased" /><option value="Rented" /></datalist></label>
            <label><span>Primary location</span><input maxLength={160} value={vehicleForm.primaryLocation} onChange={(event) => setVehicleForm({ ...vehicleForm, primaryLocation: event.target.value })} placeholder="Public Works Yard" /></label>
            <label className="admin-form-wide"><span>VIN</span><input value={vehicleForm.vin} minLength={17} maxLength={17} onChange={(event) => setVehicleForm({ ...vehicleForm, vin: event.target.value })} placeholder="17-character VIN" /></label>
            <label><span>License state</span><input value={vehicleForm.licenseState} minLength={2} maxLength={3} onChange={(event) => setVehicleForm({ ...vehicleForm, licenseState: event.target.value })} /></label>
            <label><span>License plate</span><input value={vehicleForm.licensePlate} maxLength={32} onChange={(event) => setVehicleForm({ ...vehicleForm, licensePlate: event.target.value })} /></label>
            <label><span>Acquisition date</span><input type="date" value={vehicleForm.acquisitionDate} onChange={(event) => setVehicleForm({ ...vehicleForm, acquisitionDate: event.target.value })} /></label>
            <label><span>In-service date</span><input type="date" value={vehicleForm.inServiceDate} onChange={(event) => setVehicleForm({ ...vehicleForm, inServiceDate: event.target.value })} /></label>
            <label><span>Purchase cost (USD)</span><input type="number" min="0" max="21474836.47" step="0.01" value={vehicleForm.purchaseCost} onChange={(event) => setVehicleForm({ ...vehicleForm, purchaseCost: event.target.value })} /></label>
            <label className="admin-form-wide"><span>Fleet notes</span><textarea rows={4} maxLength={4000} value={vehicleForm.notes} onChange={(event) => setVehicleForm({ ...vehicleForm, notes: event.target.value })} placeholder="Non-sensitive asset notes and operating context" /></label>
          </div>
          {error ? <p className="modal-error">{error}</p> : null}
          <footer><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save vehicle"}</button></footer>
        </form> : null}
        {modal.kind === "qr" ? <form onSubmit={replaceQr}><div className="modal-body"><div className="qr-admin-summary"><QrCode size={30} /><div><strong>{modal.vehicle.qrPublicId ? "Active QR label" : "No active QR label"}</strong><p>{modal.vehicle.qrPublicId ?? "A new public identifier will be issued."}</p></div></div>{modal.vehicle.qrPublicId ? <div className="inline-links"><Link href={`/vehicles/${modal.vehicle.id}/qr/print`} target="_blank">Open printable label</Link><Link href={`/api/qr/${modal.vehicle.qrPublicId}`} target="_blank">Download SVG</Link></div> : null}<div className="danger-zone"><strong>Replace QR label</strong><p>The current QR will stop working immediately. Existing inspection history remains unchanged.</p><label><span>Replacement reason *</span><textarea required minLength={3} maxLength={240} rows={3} value={qrReason} onChange={(event) => setQrReason(event.target.value)} placeholder="Damaged, unreadable, or vehicle label replacement" /></label></div>{error ? <p className="modal-error">{error}</p> : null}</div><footer><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-danger" disabled={busy} type="submit">{busy ? "Replacing…" : "Replace and issue new QR"}</button></footer></form> : null}
        {modal.kind === "assignment" ? <form onSubmit={assignForm}><div className="modal-body"><div className="existing-assignments"><span className="eyebrow">CURRENT FORMS</span>{assignments.filter((assignment) => assignment.vehicleId === modal.vehicle.id).length === 0 ? <p className="assignment-empty">No active forms assigned.</p> : null}{assignments.filter((assignment) => assignment.vehicleId === modal.vehicle.id).map((assignment) => <div key={assignment.id}><span className="assignment-summary"><strong>{assignment.templateName} · v{assignment.templateVersion}</strong><small>{formatEnum(assignment.frequency)}{assignment.autoLaunch ? " · Auto-launch" : ""}</small></span><button className="assignment-end-button" type="button" disabled={busy} onClick={() => endAssignment(assignment)} title="End assignment"><CircleMinus size={14} /> End</button></div>)}</div><div className="admin-form-grid"><label className="admin-form-wide"><span>Published form *</span><select required value={assignmentForm.templateId} onChange={(event) => setAssignmentForm({ ...assignmentForm, templateId: event.target.value })}>{templates.map((template) => <option value={template.id} key={template.id} disabled={assignments.some((assignment) => assignment.vehicleId === modal.vehicle.id && assignment.templateId === template.id)}>{template.name} · v{template.version} · {formatEnum(template.ruleSetStatus)} rules</option>)}</select></label><label><span>Frequency *</span><select value={assignmentForm.frequency} onChange={(event) => setAssignmentForm({ ...assignmentForm, frequency: event.target.value })}><option value="before_first_departure">Before first departure</option><option value="end_of_shift">End of shift</option><option value="daily">Daily</option><option value="per_handover">Per handover</option><option value="on_demand">On demand</option></select></label><label className="checkbox-field"><input type="checkbox" checked={assignmentForm.autoLaunch} onChange={(event) => setAssignmentForm({ ...assignmentForm, autoLaunch: event.target.checked })} /><span>Auto-launch after QR scan</span></label></div>{error ? <p className="modal-error">{error}</p> : null}</div><footer><button className="button button-secondary" type="button" onClick={closeModal}>Cancel</button><button className="button button-primary" disabled={busy || !assignmentForm.templateId || assignments.some((assignment) => assignment.vehicleId === modal.vehicle.id && assignment.templateId === assignmentForm.templateId)} type="submit">{busy ? "Working…" : "Assign form"}</button></footer></form> : null}
      </section></div> : null}
    </div>
  );
}
