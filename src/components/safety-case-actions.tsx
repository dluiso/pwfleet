"use client";

import {
  BadgeCheck,
  CirclePause,
  ClipboardCheck,
  Play,
  RotateCcw,
  ShieldCheck,
  UserRoundCog,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SafetyCaseActionsProps = {
  caseId: string;
  status: string;
  recordVersion: number;
  vehicleId: string;
  blockingDefectCount: number;
  actor: { canSupervise: boolean; canMaintain: boolean };
  assignedTechnician: { id: string; displayName: string; role: string } | null;
  technicians: Array<{ id: string; displayName: string; role: string }>;
};

export function SafetyCaseActions({
  caseId,
  status,
  recordVersion,
  vehicleId,
  blockingDefectCount,
  actor,
  assignedTechnician,
  technicians,
}: SafetyCaseActionsProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [technicianId, setTechnicianId] = useState(assignedTechnician?.id ?? technicians[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (action === "approve_release" && !window.confirm("Release this vehicle for operation? This decision is recorded in the audit history.")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/safety-cases/${caseId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, recordVersion, note, ...extra }),
      });
      const payload = (await response.json()) as { error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
      if (!response.ok) {
        const detail = [...(payload.details?.formErrors ?? []), ...Object.values(payload.details?.fieldErrors ?? {}).flat()][0];
        throw new Error([payload.error ?? "The action could not be completed.", detail].filter(Boolean).join(" "));
      }
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const supervisorIntake = actor.canSupervise && ["pending_supervisor_review", "acknowledged", "held"].includes(status);
  const releaseWithoutRepair = actor.canSupervise && ["acknowledged", "held"].includes(status) && blockingDefectCount === 0;

  return (
    <section className="panel case-actions-panel">
      <header><div><span className="eyebrow">AUTHORIZED ACTIONS</span><h2>Advance safety case</h2></div></header>
      <div className="case-actions-body">
        {supervisorIntake || status === "repair_in_progress" || status === "awaiting_release" ? <label><span>Decision or work note</span><textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record the operational basis for this action…" /></label> : null}

        {actor.canSupervise && status === "pending_supervisor_review" ? <button className="button button-secondary" disabled={busy} type="button" onClick={() => act("acknowledge")}><BadgeCheck size={16} /> Acknowledge review</button> : null}

        {actor.canSupervise && ["pending_supervisor_review", "acknowledged"].includes(status) ? <button className="button button-secondary" disabled={busy || note.trim().length < 3} type="button" onClick={() => act("hold")}><CirclePause size={16} /> Keep vehicle on hold</button> : null}

        {supervisorIntake ? <div className="case-assignment-control"><label><span>Assign maintenance technician</span><select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>{technicians.map((technician) => <option value={technician.id} key={technician.id}>{technician.displayName} · {technician.role.replaceAll("_", " ")}</option>)}</select></label><button className="button button-primary" disabled={busy || !technicianId} type="button" onClick={() => act("assign_maintenance", { assignedTechnicianUserId: technicianId })}><UserRoundCog size={16} /> Route to maintenance</button></div> : null}

        {releaseWithoutRepair ? <button className="button button-primary" disabled={busy || note.trim().length < 3} type="button" onClick={() => act("approve_release")}><ShieldCheck size={16} /> Approve release</button> : null}

        {actor.canMaintain && status === "maintenance_assigned" ? <div className="case-action-callout"><div><Wrench size={20} /><span><strong>Assigned to {assignedTechnician?.displayName ?? "maintenance"}</strong><small>Starting repair records technician custody and keeps the vehicle unavailable.</small></span></div><button className="button button-primary" disabled={busy} type="button" onClick={() => act("start_repair")}><Play size={16} /> Start repair</button></div> : null}

        {actor.canMaintain && status === "repair_in_progress" ? <button className="button button-primary" disabled={busy || note.trim().length < 3} type="button" onClick={() => act("complete_repair")}><ClipboardCheck size={16} /> Complete repair and request reinspection</button> : null}

        {status === "awaiting_reinspection" ? <div className="case-action-callout"><div><RotateCcw size={20} /><span><strong>Independent reinspection required</strong><small>A driver or authorized operator must complete an assigned inspection before a supervisor can release this vehicle.</small></span></div><Link className="button button-primary" href={`/vehicles/${vehicleId}`}><ClipboardCheck size={16} /> Open vehicle forms</Link></div> : null}

        {actor.canSupervise && status === "awaiting_release" ? <div className="case-release-actions"><button className="button button-secondary" disabled={busy || note.trim().length < 3} type="button" onClick={() => act("deny_release")}><RotateCcw size={16} /> Require another reinspection</button><button className="button button-primary" disabled={busy || note.trim().length < 3} type="button" onClick={() => act("approve_release")}><ShieldCheck size={16} /> Approve vehicle release</button></div> : null}

        {status === "released" ? <div className="case-released-note"><ShieldCheck size={19} /><div><strong>Vehicle release completed</strong><p>This case is closed to further actions. Its decision history remains available for audit.</p></div></div> : null}
        {error ? <p className="form-feedback form-feedback-error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
