"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type VehicleClass = { id: string; code: string; name: string; description: string | null; active: boolean; recordVersion: number; vehicleCount: number };
type Editor = { id?: string; code: string; name: string; description: string; active: boolean; recordVersion?: number };
const blank: Editor = { code: "", name: "", description: "", active: true };

export function VehicleClassManager({ classes, mayManage }: { classes: VehicleClass[]; mayManage: boolean }) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(editor.id ? `/api/admin/vehicle-classes/${editor.id}` : "/api/admin/vehicle-classes", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const payload = (await response.json()) as { error?: string; details?: { fieldErrors?: Record<string, string[]> } };
      if (!response.ok) throw new Error(Object.values(payload.details?.fieldErrors ?? {}).flat()[0] ?? payload.error ?? "The vehicle class could not be saved.");
      setEditor(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The vehicle class could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel admin-table-panel">
    <div className="panel-header"><div><span className="eyebrow">FLEET TAXONOMY</span><h2>Vehicle classes</h2><p>Control the vehicle types available when registering an asset.</p></div>{mayManage ? <button className="button button-secondary button-small" type="button" onClick={() => setEditor({ ...blank })}><Plus size={15} /> New class</button> : null}</div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Vehicles</th><th>Status</th>{mayManage ? <th><span className="sr-only">Actions</span></th> : null}</tr></thead><tbody>{classes.map((item) => <tr key={item.id}><td><strong>{item.code}</strong></td><td>{item.name}</td><td>{item.description ?? "—"}</td><td>{item.vehicleCount}</td><td><span className={`workflow-status workflow-status-${item.active ? "approved" : "retired"}`}>{item.active ? "active" : "inactive"}</span></td>{mayManage ? <td><div className="table-actions"><button type="button" title={`Edit ${item.code}`} onClick={() => setEditor({ id: item.id, code: item.code, name: item.name, description: item.description ?? "", active: item.active, recordVersion: item.recordVersion })}><Pencil size={15} /></button></div></td> : null}</tr>)}</tbody></table></div>
    {editor ? <div className="modal-backdrop" role="presentation"><section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="vehicle-class-title"><header><div><span className="eyebrow">FLEET TAXONOMY</span><h2 id="vehicle-class-title">{editor.id ? "Edit" : "Create"} vehicle class</h2></div><button className="icon-button" disabled={busy} type="button" aria-label="Close dialog" onClick={() => setEditor(null)}><X size={19} /></button></header><form onSubmit={save}><div className="modal-body admin-form-grid"><label><span>Class code *</span><input required minLength={2} maxLength={12} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="SV" /></label><label><span>Class name *</span><input required minLength={2} maxLength={120} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Street Sweeper" /></label><label className="admin-form-wide"><span>Description</span><textarea rows={3} maxLength={1000} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label><label className="checkbox-field admin-form-wide"><input type="checkbox" checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })} /><span>Available for new vehicle records</span></label>{editor.id && editor.active ? <p className="admin-form-hint admin-form-wide">Deactivate a class to prevent new assignments. Existing vehicles retain their historical class.</p> : null}{error ? <p className="modal-error admin-form-wide" role="alert">{error}</p> : null}</div><footer><button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save class"}</button></footer></form></section></div> : null}
  </section>;
}
