"use client";

import { Check, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NotificationAction({ id, requiresAcknowledgment, read, acknowledged }: { id: string; requiresAcknowledgment: boolean; read: boolean; acknowledged: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(action: "read" | "acknowledge") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The notification could not be updated.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The notification could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  if (acknowledged || (read && !requiresAcknowledgment)) return <span className="notification-state"><CheckCheck size={14} /> {acknowledged ? "Acknowledged" : "Read"}</span>;
  return <div className="notification-action-wrap"><button className="button button-secondary button-small" disabled={busy} type="button" onClick={() => act(requiresAcknowledgment ? "acknowledge" : "read")}><Check size={14} /> {requiresAcknowledgment ? "Acknowledge" : "Mark read"}</button>{error ? <small role="alert">{error}</small> : null}</div>;
}

export function MarkAllNotificationsRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function markAll() {
    setBusy(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <button className="button button-secondary button-small" disabled={busy} type="button" onClick={markAll}><CheckCheck size={15} /> {busy ? "Updating…" : "Mark all read"}</button>;
}
