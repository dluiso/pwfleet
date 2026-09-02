"use client";

import { useRouter } from "next/navigation";
import { Download, FileImage, FileText, LoaderCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { formatEnum } from "@/lib/format";

type VehicleDocument = {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  category: "profile_photo" | "registration" | "insurance" | "title" | "warranty" | "service_record" | "other";
  caption: string | null;
  effectiveDate: string | null;
  expiresOn: string | null;
  isPrimary: boolean;
  createdAt: Date;
};

function expirationLabel(expiresOn: string | null): { text: string; tone: string } | null {
  if (!expiresOn) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${expiresOn}T00:00:00`);
  const days = Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`, tone: "expired" };
  if (days <= 30) return { text: `Expires in ${days} day${days === 1 ? "" : "s"}`, tone: "warning" };
  return { text: `Expires ${date.toLocaleDateString("en-US")}`, tone: "current" };
}

export function VehicleDossierDocuments({ vehicleId, documents, mayManage }: { vehicleId: string; documents: VehicleDocument[]; mayManage: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "registration", caption: "", effectiveDate: "", expiresOn: "", isPrimary: false });

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Select a file to upload.");
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      Object.entries(form).forEach(([key, value]) => body.append(key, String(value)));
      const response = await fetch(`/api/admin/vehicles/${vehicleId}/documents`, { method: "POST", body });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The vehicle document could not be uploaded.");
      setShowForm(false);
      setForm({ category: "registration", caption: "", effectiveDate: "", expiresOn: "", isPrimary: false });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The vehicle document could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function retire(document: VehicleDocument) {
    const reason = window.prompt(`Why should ${document.originalName} be retired from the active dossier?`);
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/vehicles/${vehicleId}/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The document could not be retired.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The document could not be retired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel detail-panel vehicle-documents-panel">
      <div className="panel-header">
        <div><span className="eyebrow">CONTROLLED RECORDS</span><h2>Documents & photos</h2></div>
        {mayManage ? <button className="button button-secondary button-small" type="button" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Add file</button> : null}
      </div>
      {showForm ? <form className="vehicle-document-form" onSubmit={upload}>
        <label className="admin-form-wide"><span>File *</span><input ref={fileRef} required type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" /></label>
        <label><span>Category *</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="profile_photo">Profile photo</option><option value="registration">Registration</option><option value="insurance">Insurance</option><option value="title">Title</option><option value="warranty">Warranty</option><option value="service_record">Service record</option><option value="other">Other</option></select></label>
        <label><span>Effective date</span><input type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} /></label>
        <label><span>Expiration date</span><input type="date" value={form.expiresOn} onChange={(event) => setForm({ ...form, expiresOn: event.target.value })} /></label>
        <label className="admin-form-wide"><span>Caption</span><input maxLength={500} value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} /></label>
        <label className="checkbox-field"><input type="checkbox" checked={form.isPrimary} disabled={form.category !== "profile_photo"} onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })} /><span>Use as primary vehicle photo</span></label>
        <div className="vehicle-document-form-actions"><button className="button button-secondary button-small" type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="button button-primary button-small" disabled={busy} type="submit">{busy ? <><LoaderCircle className="spin" size={15} /> Uploading…</> : "Upload file"}</button></div>
      </form> : null}
      {error ? <p className="modal-error">{error}</p> : null}
      {documents.length ? <div className="vehicle-document-list">{documents.map((document) => {
        const expiration = expirationLabel(document.expiresOn);
        const Icon = document.mimeType.startsWith("image/") ? FileImage : FileText;
        return <div className="vehicle-document-row" key={document.id}>
          <span className="vehicle-document-icon"><Icon size={19} /></span>
          <div><strong>{document.caption || document.originalName}</strong><span>{formatEnum(document.category)} · {(document.byteSize / 1_048_576).toFixed(2)} MB{document.effectiveDate ? ` · Effective ${new Date(`${document.effectiveDate}T00:00:00`).toLocaleDateString("en-US")}` : ""}</span>{expiration ? <small className={`document-expiration ${expiration.tone}`}>{expiration.text}</small> : null}</div>
          {document.isPrimary ? <span className="primary-file-pill"><ShieldCheck size={13} /> Primary</span> : null}
          <a className="icon-button" href={`/api/vehicle-documents/${document.id}`} target="_blank" title="Open document"><Download size={16} /></a>
          {mayManage ? <button className="icon-button" type="button" disabled={busy} onClick={() => retire(document)} title="Retire document"><Trash2 size={16} /></button> : null}
        </div>;
      })}</div> : <div className="inline-empty"><span>No controlled files</span><p>Registration, insurance, title, warranty, service records, and vehicle photos can be stored here.</p></div>}
    </article>
  );
}
