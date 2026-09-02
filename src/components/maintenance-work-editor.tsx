"use client";

import { Camera, CircleDollarSign, Clock3, Plus, Save, Trash2, Upload, Wrench } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type WorkEntry = {
  id: string;
  entryType: string;
  description: string;
  partNumber: string | null;
  quantity: number;
  costCents: number;
  laborMinutes: number;
  vendorName: string | null;
  createdAt: Date;
  enteredByUserId: string;
  enteredByName: string;
};

type Evidence = {
  attachmentId: string;
  category: string;
  caption: string | null;
  createdAt: Date;
  originalName: string;
  byteSize: number;
  linkedByName: string;
};

type Props = {
  caseId: string;
  recordVersion: number;
  status: string;
  priority: string;
  targetResolutionAt: string | null;
  serviceProvider: string | null;
  externalReference: string | null;
  actor: { id: string; canSupervise: boolean; canMaintain: boolean };
  workEntries: WorkEntry[];
  evidence: Evidence[];
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function apiError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
  const detail = [...(payload.details?.formErrors ?? []), ...Object.values(payload.details?.fieldErrors ?? {}).flat()][0];
  return [payload.error ?? "The request could not be completed.", detail].filter(Boolean).join(" ");
}

export function MaintenanceWorkEditor(props: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(props.recordVersion);
  const [priority, setPriority] = useState(props.priority);
  const [targetResolutionAt, setTargetResolutionAt] = useState(localDateTime(props.targetResolutionAt));
  const [serviceProvider, setServiceProvider] = useState(props.serviceProvider ?? "");
  const [externalReference, setExternalReference] = useState(props.externalReference ?? "");
  const [entryType, setEntryType] = useState("labor");
  const [description, setDescription] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cost, setCost] = useState("0.00");
  const [laborMinutes, setLaborMinutes] = useState("0");
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState("after_repair");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const readOnly = props.status === "released";
  const mayEditDetails = !readOnly && (props.actor.canSupervise || props.actor.canMaintain);
  const mayAddWork = !readOnly && props.actor.canMaintain;
  const totals = useMemo(() => props.workEntries.reduce((result, entry) => ({ cost: result.cost + entry.costCents, labor: result.labor + entry.laborMinutes }), { cost: 0, labor: 0 }), [props.workEntries]);

  async function mutate(url: string, method: string, body: unknown, success: string) {
    setError(null);
    setMessage(null);
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await apiError(response));
    const payload = (await response.json()) as { recordVersion?: number };
    if (payload.recordVersion) setVersion(payload.recordVersion);
    setMessage(success);
    router.refresh();
  }

  async function saveDetails() {
    setBusy("details");
    try {
      await mutate(`/api/safety-cases/${props.caseId}/details`, "PATCH", {
        recordVersion: version,
        priority,
        targetResolutionAt: targetResolutionAt ? new Date(targetResolutionAt).toISOString() : null,
        serviceProvider: serviceProvider.trim() || null,
        externalReference: externalReference.trim() || null,
      }, "Maintenance plan saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The maintenance plan could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function addEntry() {
    setBusy("entry");
    try {
      const numericCost = Number(cost);
      if (!Number.isFinite(numericCost) || numericCost < 0) throw new Error("Enter a valid non-negative cost.");
      await mutate(`/api/safety-cases/${props.caseId}/work-entries`, "POST", {
        recordVersion: version,
        entryType,
        description,
        partNumber: partNumber.trim() || null,
        quantity: Number(quantity),
        costCents: Math.round(numericCost * 100),
        laborMinutes: Number(laborMinutes),
        vendorName: vendorName.trim() || null,
      }, "Work entry added.");
      setDescription("");
      setPartNumber("");
      setQuantity("1");
      setCost("0.00");
      setLaborMinutes("0");
      setVendorName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The work entry could not be added.");
    } finally {
      setBusy(null);
    }
  }

  async function removeEntry(entryId: string) {
    if (!window.confirm("Remove this work entry? The removal is recorded in the audit trail.")) return;
    setBusy(entryId);
    try {
      await mutate(`/api/safety-cases/${props.caseId}/work-entries/${entryId}`, "DELETE", { recordVersion: version }, "Work entry removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The work entry could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadEvidence() {
    if (!file) return;
    setBusy("evidence");
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const upload = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!upload.ok) throw new Error(await apiError(upload));
      const uploaded = (await upload.json()) as { id: string };
      await mutate(`/api/safety-cases/${props.caseId}/evidence`, "POST", { recordVersion: version, attachmentId: uploaded.id, category, caption: caption.trim() || null }, "Evidence added to the case.");
      setFile(null);
      setCaption("");
      const input = document.getElementById("maintenance-evidence-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The evidence could not be uploaded.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel maintenance-work-panel">
      <header><div><span className="eyebrow">MAINTENANCE RECORD</span><h2>Plan, work, cost, and evidence</h2></div><div className="maintenance-totals"><span><CircleDollarSign size={15} /> {formatMoney(totals.cost)}</span><span><Clock3 size={15} /> {totals.labor} min</span></div></header>

      <div className="maintenance-plan-grid">
        <label><span>Priority</span><select disabled={!mayEditDetails || busy !== null} value={priority} onChange={(event) => setPriority(event.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="critical">Critical</option></select></label>
        <label><span>Target resolution</span><input disabled={!mayEditDetails || busy !== null} type="datetime-local" value={targetResolutionAt} onChange={(event) => setTargetResolutionAt(event.target.value)} /></label>
        <label><span>Service provider</span><input disabled={!mayEditDetails || busy !== null} maxLength={180} value={serviceProvider} onChange={(event) => setServiceProvider(event.target.value)} placeholder="City garage or outside vendor" /></label>
        <label><span>External work order / reference</span><input disabled={!mayEditDetails || busy !== null} maxLength={120} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="WO-2026-0001" /></label>
        {mayEditDetails ? <button className="button button-secondary" disabled={busy !== null} type="button" onClick={saveDetails}><Save size={15} /> {busy === "details" ? "Saving…" : "Save plan"}</button> : null}
      </div>

      <div className="maintenance-subsection">
        <div className="maintenance-subsection-heading"><div><span className="eyebrow">WORK LOG</span><h3>Labor, parts, and services</h3></div></div>
        {mayAddWork ? <div className="work-entry-form">
          <label><span>Type</span><select value={entryType} onChange={(event) => setEntryType(event.target.value)}><option value="labor">Labor</option><option value="part">Part</option><option value="external_service">External service</option><option value="note">Note</option></select></label>
          <label className="work-description"><span>Description</span><input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the work performed" /></label>
          <label><span>Part number</span><input disabled={entryType !== "part"} maxLength={120} value={partNumber} onChange={(event) => setPartNumber(event.target.value)} /></label>
          <label><span>Quantity</span><input min="1" max="9999" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label><span>Cost (USD)</span><input min="0" max="999999.99" step="0.01" type="number" value={cost} onChange={(event) => setCost(event.target.value)} /></label>
          <label><span>Labor minutes</span><input min="0" max="100000" type="number" value={laborMinutes} onChange={(event) => setLaborMinutes(event.target.value)} /></label>
          <label><span>Vendor</span><input maxLength={180} value={vendorName} onChange={(event) => setVendorName(event.target.value)} /></label>
          <button className="button button-primary" disabled={busy !== null || description.trim().length < 2} type="button" onClick={addEntry}><Plus size={15} /> {busy === "entry" ? "Adding…" : "Add entry"}</button>
        </div> : null}
        {props.workEntries.length ? <div className="work-entry-list">{props.workEntries.map((entry) => <article key={entry.id}><span className="record-icon"><Wrench size={16} /></span><div><strong>{entry.description}</strong><p>{entry.entryType.replaceAll("_", " ")}{entry.partNumber ? ` · Part ${entry.partNumber}` : ""}{entry.vendorName ? ` · ${entry.vendorName}` : ""}</p><small>{entry.quantity} qty · {entry.laborMinutes} min · {formatMoney(entry.costCents)} · {entry.enteredByName} · {formatDate(entry.createdAt)}</small></div>{mayAddWork && (props.actor.canSupervise || entry.enteredByUserId === props.actor.id) ? <button aria-label="Remove work entry" className="icon-button" disabled={busy !== null} type="button" onClick={() => removeEntry(entry.id)}><Trash2 size={15} /></button> : null}</article>)}</div> : <div className="inline-empty"><span>No work entries yet</span><p>Labor, parts, services, and notes will appear here.</p></div>}
      </div>

      <div className="maintenance-subsection">
        <div className="maintenance-subsection-heading"><div><span className="eyebrow">EVIDENCE</span><h3>Repair photos and receipts</h3></div></div>
        {mayEditDetails ? <div className="evidence-upload-form">
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="before_repair">Before repair</option><option value="after_repair">After repair</option><option value="invoice">Invoice</option><option value="receipt">Receipt</option><option value="other">Other</option></select></label>
          <label className="evidence-caption"><span>Caption</span><input maxLength={300} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="What does this image document?" /></label>
          <label className="file-picker"><span>Image</span><input id="maintenance-evidence-file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <button className="button button-secondary" disabled={busy !== null || !file} type="button" onClick={uploadEvidence}><Upload size={15} /> {busy === "evidence" ? "Uploading…" : "Add evidence"}</button>
        </div> : null}
        {props.evidence.length ? <div className="evidence-gallery">{props.evidence.map((item) => <article key={item.attachmentId}><a href={`/api/attachments/${item.attachmentId}`} target="_blank" rel="noreferrer"><Image alt={item.caption ?? item.category.replaceAll("_", " ")} height={300} src={`/api/attachments/${item.attachmentId}`} unoptimized width={420} /></a><div><strong>{item.category.replaceAll("_", " ")}</strong><p>{item.caption ?? item.originalName}</p><small>{item.linkedByName} · {formatDate(item.createdAt)} · {Math.ceil(item.byteSize / 1024)} KB</small></div></article>)}</div> : <div className="inline-empty"><Camera size={22} /><span>No evidence attached</span><p>Add before/after repair photos, invoices, or receipts.</p></div>}
      </div>
      {message ? <p className="form-feedback form-feedback-success" role="status">{message}</p> : null}
      {error ? <p className="form-feedback form-feedback-error" role="alert">{error}</p> : null}
    </section>
  );
}
