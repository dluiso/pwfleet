"use client";

import {
  BadgeCheck,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  MessageSquareWarning,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatEnum } from "@/lib/format";

type ReviewStatus = "draft" | "in_review" | "changes_requested" | "approved";
type TemplateStatus = "draft" | "published" | "retired";
type ReviewLane = "operations" | "governance";

type Review = {
  id: string;
  reviewRound: number;
  reviewLane: ReviewLane;
  decision: "approved" | "changes_requested";
  comment: string | null;
  reviewerUserId: string;
  reviewerName: string;
  reviewerRole: string;
  createdAt: Date | string;
};

type TemplateWorkflowPanelProps = {
  templateId: string;
  template: {
    status: TemplateStatus;
    reviewStatus: ReviewStatus;
    reviewRound: number;
    reviewRequestedByUserId: string | null;
  };
  actor: { id: string; role: string };
  reviews: Review[];
};

const laneCopy: Record<ReviewLane, { title: string; description: string }> = {
  operations: {
    title: "Operations approval",
    description: "Supervisor or fleet manager validates field usability and operating policy.",
  },
  governance: {
    title: "Governance approval",
    description: "Administrator validates configuration, auditability, and publication readiness.",
  },
};

function laneForRole(role: string): ReviewLane | null {
  if (role === "supervisor" || role === "fleet_manager") return "operations";
  if (role === "administrator") return "governance";
  return null;
}

export function TemplateWorkflowPanel({ templateId, template, actor, reviews }: TemplateWorkflowPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [retirementReason, setRetirementReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const currentReviews = reviews.filter((review) => review.reviewRound === template.reviewRound);
  const actorLane = laneForRole(actor.role);
  const requestedByActor = template.reviewRequestedByUserId === actor.id;
  const displayedStatus = template.status === "draft" ? template.reviewStatus : template.status;

  async function transition(payload: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/forms/${templateId}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      };
      if (!response.ok) {
        const detail = [
          ...(result.details?.formErrors ?? []),
          ...Object.values(result.details?.fieldErrors ?? {}).flat(),
        ][0];
        throw new Error([result.error ?? "The workflow action could not be completed.", detail].filter(Boolean).join(" "));
      }
      setComment("");
      setRetirementReason("");
      setMessage(successMessage);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The workflow action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel template-workflow-panel" aria-labelledby="template-workflow-heading">
      <header className="template-workflow-header">
        <div>
          <span className="eyebrow">CONTROLLED FORM LIFECYCLE</span>
          <h2 id="template-workflow-heading">Review and publication</h2>
        </div>
        <span className={`workflow-status workflow-status-${displayedStatus}`}>
          {formatEnum(displayedStatus)}
        </span>
      </header>

      {template.status === "draft" ? (
        <div className="workflow-lanes">
          {(["operations", "governance"] as const).map((lane) => {
            const review = currentReviews.find((entry) => entry.reviewLane === lane);
            return (
              <article className={review?.decision === "approved" ? "workflow-lane workflow-lane-approved" : review?.decision === "changes_requested" ? "workflow-lane workflow-lane-changes" : "workflow-lane"} key={lane}>
                <span className="workflow-lane-icon">
                  {review?.decision === "approved" ? <CheckCircle2 size={19} /> : review?.decision === "changes_requested" ? <MessageSquareWarning size={19} /> : <CircleDashed size={19} />}
                </span>
                <div>
                  <strong>{laneCopy[lane].title}</strong>
                  <p>{laneCopy[lane].description}</p>
                  {review ? <small>{formatEnum(review.decision)} by {review.reviewerName}{review.comment ? ` · ${review.comment}` : ""}</small> : <small>Awaiting a decision for review round {Math.max(template.reviewRound, 1)}.</small>}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {template.status === "draft" && (template.reviewStatus === "draft" || template.reviewStatus === "changes_requested") && actor.role === "administrator" ? (
        <div className="workflow-action-box">
          <div><strong>Submit the saved definition for independent review</strong><p>Submitting locks this version. Only changes already saved in the builder are included.</p></div>
          <button className="button button-primary" disabled={busy} type="button" onClick={() => transition({ action: "request_review" }, "Review requested and this draft is now locked.")}><Send size={16} /> Request review</button>
        </div>
      ) : null}

      {template.status === "draft" && template.reviewStatus === "in_review" && actorLane ? (
        <div className="workflow-review-box">
          <label><span>Reviewer comment</span><textarea rows={3} maxLength={1200} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional for approval; required when requesting changes." /></label>
          {requestedByActor ? <p className="workflow-guard-note"><ShieldCheck size={16} /> You requested this review round, so another eligible person must record the {actorLane} decision.</p> : currentReviews.some((review) => review.reviewLane === actorLane) ? <p className="workflow-guard-note"><BadgeCheck size={16} /> The {actorLane} lane already recorded its decision for this round.</p> : <div className="workflow-button-row"><button className="button button-secondary" disabled={busy || comment.trim().length < 3} type="button" onClick={() => transition({ action: "review", decision: "request_changes", comment }, "Changes were requested and the draft is unlocked for its author.")}><MessageSquareWarning size={16} /> Request changes</button><button className="button button-primary" disabled={busy} type="button" onClick={() => transition({ action: "review", decision: "approve", comment }, `${laneCopy[actorLane].title} recorded.`)}><UserRoundCheck size={16} /> Approve {actorLane}</button></div>}
        </div>
      ) : null}

      {template.status === "draft" && template.reviewStatus === "approved" && actor.role === "administrator" ? (
        <div className="workflow-action-box workflow-publish-box">
          <div><strong>Both approval lanes are complete</strong><p>Publication makes this exact version available for vehicle assignment and keeps it immutable.</p></div>
          <button className="button button-primary" disabled={busy} type="button" onClick={() => transition({ action: "publish" }, "The approved form version was published.")}><FileCheck2 size={16} /> Publish version</button>
        </div>
      ) : null}

      {template.status === "published" && actor.role === "administrator" ? (
        <div className="workflow-review-box workflow-retire-box">
          <label><span>Retirement reason</span><textarea rows={2} maxLength={500} value={retirementReason} onChange={(event) => setRetirementReason(event.target.value)} placeholder="Explain why this published version should no longer be assigned." /></label>
          <div className="workflow-button-row"><button className="button button-secondary" disabled={busy || retirementReason.trim().length < 3} type="button" onClick={() => transition({ action: "retire", reason: retirementReason }, "The form version was retired.")}><ShieldCheck size={16} /> Retire version</button></div>
          <p className="workflow-guard-note">Retirement is rejected while any vehicle still has an active assignment to this version.</p>
        </div>
      ) : null}

      {error ? <p className="form-feedback form-feedback-error" role="alert">{error}</p> : null}
      {message ? <p className="form-feedback form-feedback-success" role="status">{message}</p> : null}

      {reviews.length ? (
        <details className="workflow-history">
          <summary>Review history · {reviews.length} decision{reviews.length === 1 ? "" : "s"}</summary>
          <div>{reviews.map((review) => <article key={review.id}><span>{formatEnum(review.reviewLane)} · Round {review.reviewRound}</span><strong>{formatEnum(review.decision)}</strong><small>{review.reviewerName} · {formatEnum(review.reviewerRole)} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(review.createdAt))}</small>{review.comment ? <p>{review.comment}</p> : null}</article>)}</div>
        </details>
      ) : null}
    </section>
  );
}
