"use client";

import { BadgeDollarSign, CheckCircle2, RefreshCw, UserRoundCog, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  caseId: string;
  recordVersion: number;
  status: string;
  actor: { canSupervise: boolean; canMaintain: boolean };
  estimateStatus: string;
  estimatedCostCents: number | null;
  estimateNote: string | null;
  estimateSubmittedAt: string | null;
  approvalThresholdCents: number | null;
  assignedTechnicianId: string | null;
  technicians: Array<{ id: string; displayName: string; role: string }>;
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function request(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as { error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
  if (!response.ok) {
    const detail = [...(payload.details?.formErrors ?? []), ...Object.values(payload.details?.fieldErrors ?? {}).flat()][0];
    throw new Error([payload.error ?? "The operation could not be completed.", detail].filter(Boolean).join(" "));
  }
}

export function MaintenanceGovernancePanel(props: Props) {
  const router = useRouter();
  const [estimate, setEstimate] = useState(props.estimatedCostCents === null ? "" : (props.estimatedCostCents / 100).toFixed(2));
  const [estimateNote, setEstimateNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [technicianId, setTechnicianId] = useState(props.technicians.find((item) => item.id !== props.assignedTechnicianId)?.id ?? "");
  const [reassignmentNote, setReassignmentNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = props.status === "released";

  async function perform(key: string, url: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      await request(url, body);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The operation could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  function submitEstimate() {
    const amount = Number(estimate);
    if (!Number.isFinite(amount) || amount < 0) return setError("Enter a valid non-negative estimate.");
    return perform("estimate", `/api/safety-cases/${props.caseId}/estimate`, { recordVersion: props.recordVersion, estimatedCostCents: Math.round(amount * 100), note: estimateNote });
  }

  const mayReassign = props.actor.canSupervise && ["maintenance_assigned", "repair_in_progress"].includes(props.status);
  return <section className="panel maintenance-governance-panel">
    <header><div><span className="eyebrow">COST & CUSTODY CONTROL</span><h2>Estimate approval and assignment</h2></div><span className={`workflow-status workflow-status-${props.estimateStatus}`}>{props.estimateStatus.replaceAll("_", " ")}</span></header>
    <div className="governance-grid">
      <div className="governance-section">
        <div className="governance-summary"><BadgeDollarSign size={20} /><div><strong>{props.estimatedCostCents === null ? "No estimate submitted" : money(props.estimatedCostCents)}</strong><p>{props.approvalThresholdCents === null ? "No active approval threshold" : `Supervisor approval threshold: ${money(props.approvalThresholdCents)}`}</p>{props.estimateNote ? <small>{props.estimateNote}</small> : null}{props.estimateSubmittedAt ? <small>Submitted {new Date(props.estimateSubmittedAt).toLocaleString("en-US")}</small> : null}</div></div>
        {!readOnly && props.actor.canMaintain ? <div className="governance-form"><label><span>Estimated total (USD)</span><input min="0" max="1000000" step="0.01" type="number" value={estimate} onChange={(event) => setEstimate(event.target.value)} /></label><label><span>Estimate basis</span><textarea maxLength={1000} rows={2} value={estimateNote} onChange={(event) => setEstimateNote(event.target.value)} placeholder="Parts, labor, vendor quote, and assumptions" /></label><button className="button button-secondary" disabled={busy !== null || estimateNote.trim().length < 3} type="button" onClick={submitEstimate}><RefreshCw size={15} /> {busy === "estimate" ? "Submitting…" : props.estimateStatus === "not_required" ? "Submit estimate" : "Revise estimate"}</button></div> : null}
        {props.actor.canSupervise && props.estimateStatus === "pending" ? <div className="estimate-review"><label><span>Decision note</span><textarea maxLength={1000} rows={2} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Document the approval or rejection basis" /></label><div><button className="button button-secondary" disabled={busy !== null || reviewNote.trim().length < 3} type="button" onClick={() => perform("reject", `/api/safety-cases/${props.caseId}/estimate-review`, { action: "reject", recordVersion: props.recordVersion, note: reviewNote })}><XCircle size={15} /> Reject</button><button className="button button-primary" disabled={busy !== null || reviewNote.trim().length < 3} type="button" onClick={() => perform("approve", `/api/safety-cases/${props.caseId}/estimate-review`, { action: "approve", recordVersion: props.recordVersion, note: reviewNote })}><CheckCircle2 size={15} /> Approve estimate</button></div></div> : null}
      </div>
      {mayReassign ? <div className="governance-section governance-reassignment"><div className="governance-summary"><UserRoundCog size={20} /><div><strong>Reassign maintenance custody</strong><p>The case remains in its current workflow state and the change is audited.</p></div></div><div className="governance-form"><label><span>New technician</span><select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><option value="">Select a technician</option>{props.technicians.filter((item) => item.id !== props.assignedTechnicianId).map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.role.replaceAll("_", " ")}</option>)}</select></label><label><span>Reason for reassignment</span><textarea maxLength={1000} rows={2} value={reassignmentNote} onChange={(event) => setReassignmentNote(event.target.value)} /></label><button className="button button-secondary" disabled={busy !== null || !technicianId || reassignmentNote.trim().length < 3} type="button" onClick={() => perform("reassign", `/api/safety-cases/${props.caseId}/reassign`, { recordVersion: props.recordVersion, assignedTechnicianUserId: technicianId, note: reassignmentNote })}><UserRoundCog size={15} /> {busy === "reassign" ? "Reassigning…" : "Reassign case"}</button></div></div> : null}
    </div>
    {error ? <p className="form-feedback form-feedback-error" role="alert">{error}</p> : null}
  </section>;
}
