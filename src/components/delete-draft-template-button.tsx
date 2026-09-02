"use client";

import { Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function DeleteDraftTemplateButton({ templateId, code, recordVersion }: { templateId: string; code: string; recordVersion: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function deleteDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/forms/${templateId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordVersion, confirmationCode, reason }),
      });
      const result = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error ?? "The draft could not be deleted.");
      router.push("/settings/forms");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The draft could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button button-danger" type="button" onClick={() => setOpen(true)}><Trash2 size={16} /> Delete unused draft</button>
      {open ? <div className="modal-backdrop" role="presentation"><section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="delete-draft-title">
        <header><div><span className="eyebrow">PERMANENT DRAFT REMOVAL</span><h2 id="delete-draft-title">Delete unused draft</h2></div><button className="icon-button" disabled={busy} type="button" aria-label="Close dialog" onClick={() => setOpen(false)}><X size={19} /></button></header>
        <form onSubmit={deleteDraft}><div className="modal-body"><div className="danger-zone"><strong>This removes only this draft version</strong><p>Published forms, assignments, and inspection history cannot be deleted. This action is rejected if the draft has ever been assigned or used.</p><label><span>Reason *</span><textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><label><span>Type {code} to confirm *</span><input required value={confirmationCode} onChange={(event) => setConfirmationCode(event.target.value.toUpperCase())} /></label></div>{error ? <p className="modal-error" role="alert">{error}</p> : null}</div><footer><button className="button button-secondary" disabled={busy} type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button button-danger" disabled={busy || confirmationCode !== code || reason.trim().length < 3} type="submit">{busy ? "Deleting…" : "Delete draft"}</button></footer></form>
      </section></div> : null}
    </>
  );
}
