"use client";

import { CopyPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateTemplateVersionButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createVersion() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/forms/${templateId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_draft_version" }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error ?? "The draft version could not be created.");
      router.push(`/settings/forms/${payload.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The draft version could not be created.");
      setBusy(false);
    }
  }

  return (
    <div className="template-version-action">
      <button className="button button-primary" type="button" disabled={busy} onClick={createVersion}>
        <CopyPlus size={17} /> {busy ? "Creating draft…" : "Create draft version"}
      </button>
      {error ? <p>{error}</p> : null}
    </div>
  );
}
