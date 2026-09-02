"use client";

import { CirclePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function CreateInspectionFormButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function createForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, description }),
      });
      const result = (await response.json()) as { id?: string; error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
      if (!response.ok || !result.id) {
        const detail = [...(result.details?.formErrors ?? []), ...Object.values(result.details?.fieldErrors ?? {}).flat()][0];
        throw new Error([result.error ?? "The form could not be created.", detail].filter(Boolean).join(" "));
      }
      router.push(`/settings/forms/${result.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The form could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button button-primary" type="button" onClick={() => setOpen(true)}><CirclePlus size={17} /> New form</button>
      {open ? <div className="modal-backdrop" role="presentation">
        <section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="new-form-title">
          <header><div><span className="eyebrow">FORM CONFIGURATION</span><h2 id="new-form-title">Create a new inspection form</h2></div><button className="icon-button" disabled={busy} type="button" aria-label="Close dialog" onClick={() => setOpen(false)}><X size={19} /></button></header>
          <form onSubmit={createForm}>
            <div className="modal-body admin-form-grid">
              <label><span>Form code *</span><input required minLength={2} maxLength={64} pattern="[A-Z0-9_]+" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="STREET_SWEEPER_PRETRIP" /></label>
              <label><span>Form name *</span><input required minLength={3} maxLength={180} value={name} onChange={(event) => setName(event.target.value)} placeholder="Street Sweeper Pre-Trip Inspection" /></label>
              <label className="admin-form-wide"><span>Description</span><textarea rows={4} maxLength={1200} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Daily safety and operating inspection for street sweepers." /></label>
              <p className="admin-form-wide form-builder-help">The code is the permanent identifier for this form family. The new form starts as an empty draft so its sections, fields, options, conditions, and safety rules can be defined in the builder.</p>
              {error ? <p className="modal-error admin-form-wide" role="alert">{error}</p> : null}
            </div>
            <footer><button className="button button-secondary" disabled={busy} type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? "Creating…" : "Create draft"}</button></footer>
          </form>
        </section>
      </div> : null}
    </>
  );
}
