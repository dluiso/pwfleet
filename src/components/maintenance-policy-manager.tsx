"use client";

import { Save, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Policy = { priority: "routine" | "urgent" | "critical"; acknowledgmentMinutes: number; assignmentMinutes: number; overdueRepeatMinutes: number; estimateApprovalThresholdCents: number; active: boolean; recordVersion: number };

function PolicyCard({ initial }: { initial: Policy }) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initial);
  const [threshold, setThreshold] = useState((initial.estimateApprovalThresholdCents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setMessage(null); setError(null);
    try {
      const response = await fetch(`/api/admin/maintenance-policies/${policy.priority}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...policy, estimateApprovalThresholdCents: Math.round(Number(threshold) * 100) }) });
      const payload = (await response.json()) as Policy & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The policy could not be saved.");
      setPolicy(payload); setThreshold((payload.estimateApprovalThresholdCents / 100).toFixed(2)); setMessage("Policy saved."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The policy could not be saved."); } finally { setBusy(false); }
  }
  return <article className={`panel policy-card priority-border-${policy.priority}`}><header><div><span className="eyebrow">{policy.priority.toUpperCase()}</span><h2>{policy.priority[0]!.toUpperCase() + policy.priority.slice(1)} response policy</h2></div><label className="policy-active"><input checked={policy.active} type="checkbox" onChange={(event) => setPolicy({ ...policy, active: event.target.checked })} /> Active</label></header><div className="policy-fields"><label><span>Acknowledge within (minutes)</span><input min="1" max="43200" type="number" value={policy.acknowledgmentMinutes} onChange={(event) => setPolicy({ ...policy, acknowledgmentMinutes: Number(event.target.value) })} /></label><label><span>Assign within (minutes)</span><input min="1" max="43200" type="number" value={policy.assignmentMinutes} onChange={(event) => setPolicy({ ...policy, assignmentMinutes: Number(event.target.value) })} /></label><label><span>Repeat overdue alert (minutes)</span><input min="1" max="43200" type="number" value={policy.overdueRepeatMinutes} onChange={(event) => setPolicy({ ...policy, overdueRepeatMinutes: Number(event.target.value) })} /></label><label><span>Estimate approval threshold (USD)</span><input min="0" max="1000000" step="0.01" type="number" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></label></div><footer><div>{message ? <span className="form-feedback form-feedback-success">{message}</span> : null}{error ? <span className="form-feedback form-feedback-error">{error}</span> : null}</div><button className="button button-primary" disabled={busy} type="button" onClick={save}><Save size={15} /> {busy ? "Saving…" : "Save policy"}</button></footer></article>;
}

export function MaintenancePolicyManager({ policies }: { policies: Policy[] }) {
  return <div className="page-stack"><section className="page-heading-row"><div><span className="eyebrow">OPERATIONAL GOVERNANCE</span><h1>Maintenance policies</h1><p>Configure acknowledgment, assignment, overdue escalation, and cost-approval thresholds by priority.</p></div></section><article className="safety-callout safety-callout-wide"><ShieldAlert size={22} /><div><strong>Policy changes affect active cases</strong><p>The next escalation worker run evaluates every active case against these values. Every change is audit logged.</p></div></article><section className="policy-card-grid">{policies.map((policy) => <PolicyCard initial={policy} key={`${policy.priority}-${policy.recordVersion}`} />)}</section></div>;
}
