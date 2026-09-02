"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DamageMap, type DamageMarker } from "./damage-map";
import { PhotoUpload, type UploadedPhoto } from "./photo-upload";
import { visibilityConditionMatches, type VisibilityCondition } from "@/modules/inspections/visibility";

type FormItem = {
  id: string;
  itemKey: string;
  label: string;
  helpText: string | null;
  fieldType: string;
  required: boolean;
  options: string[] | null;
  visibilityCondition: VisibilityCondition | null;
};

type FormSection = {
  id: string;
  title: string;
  description: string | null;
  items: FormItem[];
};

type DefectRule = {
  itemId: string;
  whenResponse: string;
  severity: string;
  blockDeparture: boolean;
  requireComment: boolean;
  requirePhoto: boolean;
};

type AnswerState = {
  response: string | number | boolean | DamageMarker[] | null;
  comment: string;
  photos: UploadedPhoto[];
};

type InspectionResult = {
  inspectionId: string;
  severity: string;
  disposition: string;
  blockDeparture: boolean;
  requiresSupervisorReview: boolean;
  driverMessages: string[];
};

export function InspectionForm({
  vehicle,
  template,
  qrCodeId,
}: {
  vehicle: { id: string; label: string; description: string; disposition: string; currentOdometer: number | null };
  template: { id: string; name: string; version: number; ruleSetStatus: string; sections: FormSection[]; rules: DefectRule[] };
  qrCodeId?: string;
}) {
  const router = useRouter();
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [uploadingCount, setUploadingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const section = template.sections[currentSection]!;
  const ruleByItemResponse = useMemo(
    () => new Map(template.rules.map((rule) => [`${rule.itemId}:${rule.whenResponse.toLowerCase()}`, rule])),
    [template.rules],
  );

  const itemByKey = useMemo(
    () => new Map(template.sections.flatMap((candidate) => candidate.items).map((item) => [item.itemKey, item])),
    [template.sections],
  );

  function responsesByItemKey() {
    const effective = new Map<string, unknown>();
    for (const [itemKey, item] of itemByKey) {
      effective.set(
        itemKey,
        visibilityConditionMatches(item.visibilityCondition, effective) ? answerFor(item.id).response : null,
      );
    }
    return effective;
  }

  function itemVisible(item: FormItem): boolean {
    return visibilityConditionMatches(item.visibilityCondition, responsesByItemKey());
  }

  function ruleFor(itemId: string, response: AnswerState["response"]): DefectRule | undefined {
    return typeof response === "string" ? ruleByItemResponse.get(`${itemId}:${response.toLowerCase()}`) : undefined;
  }

  function answerFor(itemId: string): AnswerState {
    return answers[itemId] ?? { response: null, comment: "", photos: [] };
  }

  function updateAnswer(itemId: string, patch: Partial<AnswerState>) {
    setAnswers((current) => ({
      ...current,
      [itemId]: { ...answerForFrom(current, itemId), ...patch },
    }));
    setError(null);
  }

  function validateSection(target: FormSection): string | null {
    for (const item of target.items) {
      if (!itemVisible(item)) continue;
      const answer = answerFor(item.id);
      const missing =
        answer.response === null ||
        answer.response === "" ||
        (item.fieldType === "attestation" && answer.response !== true);
      if (item.required && missing) return `Complete “${item.label}” before continuing.`;
      const rule = ruleFor(item.id, answer.response);
      if (rule?.requireComment && !answer.comment.trim()) return `Add a comment for “${item.label}.”`;
      if (rule?.requirePhoto && !answer.photos.length) return `Add a photo for “${item.label}.”`;
    }
    return null;
  }

  function nextSection() {
    const validationError = validateSection(section);
    if (validationError) return setError(validationError);
    setError(null);
    setCurrentSection((value) => Math.min(value + 1, template.sections.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    for (const candidate of template.sections) {
      const validationError = validateSection(candidate);
      if (validationError) {
        setCurrentSection(template.sections.indexOf(candidate));
        setError(validationError);
        return;
      }
    }
    if (uploadingCount) return setError("Wait for all photos to finish uploading.");

    setSubmitting(true);
    setError(null);
    const odometerItem = template.sections
      .flatMap((candidate) => candidate.items)
      .find((item) => item.fieldType === "odometer" && ["odometer", "odometer_start"].includes(item.itemKey));
    const odometerAnswer = odometerItem ? answerFor(odometerItem.id).response : undefined;

    try {
      const response = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          templateId: template.id,
          qrCodeId,
          ...(typeof odometerAnswer === "number" ? { odometer: odometerAnswer } : {}),
          answers: template.sections.flatMap((candidate) =>
            candidate.items.filter(itemVisible).map((item) => {
              const answer = answerFor(item.id);
              return {
                itemId: item.id,
                response: answer.response,
                ...(answer.comment.trim() ? { comment: answer.comment.trim() } : {}),
                ...(answer.photos.length ? { photoReferences: answer.photos.map((photo) => photo.id) } : {}),
              };
            }),
          ),
        }),
      });
      const payload = (await response.json()) as InspectionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The inspection could not be submitted.");
      setResult(payload);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The inspection could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const critical = result.severity === "critical" || result.disposition === "out_of_service";
    return (
      <div className={`inspection-result ${result.blockDeparture ? "inspection-result-blocked" : "inspection-result-cleared"}`} role="alert">
        <div className="result-icon">{critical ? <AlertOctagon size={42} /> : result.blockDeparture ? <ShieldAlert size={42} /> : <CheckCircle2 size={42} />}</div>
        <span className="eyebrow">INSPECTION SUBMITTED</span>
        <h1>{critical ? "Do not operate this vehicle" : result.blockDeparture ? "Wait for supervisor review" : "Vehicle inspection complete"}</h1>
        <p>{vehicle.label} has been placed in <strong>{result.disposition.replaceAll("_", " ")}</strong> status.</p>
        {result.driverMessages.map((message) => <div className="result-message" key={message}>{message}</div>)}
        {result.blockDeparture ? <div className="driver-acknowledgment"><Check size={17} /> Your submission and alert were recorded. A responsible party will be notified.</div> : null}
        <div className="result-actions">
          <Link className="button button-secondary" href={`/vehicles/${vehicle.id}`}>Vehicle profile</Link>
          <button className="button button-primary" type="button" onClick={() => router.push("/")}>Return to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="inspection-shell">
      <aside className="inspection-sidebar">
        <Link href={`/vehicles/${vehicle.id}`}><ArrowLeft size={15} /> Exit inspection</Link>
        <div className="inspection-vehicle-block"><span>VEHICLE</span><strong>{vehicle.label}</strong><small>{vehicle.description}</small></div>
        <div className="inspection-progress-copy"><span>FORM PROGRESS</span><strong>{Math.round(((currentSection + 1) / template.sections.length) * 100)}%</strong></div>
        <div className="progress-track"><span style={{ width: `${((currentSection + 1) / template.sections.length) * 100}%` }} /></div>
        <nav aria-label="Inspection sections">
          {template.sections.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className={index === currentSection ? "active" : index < currentSection ? "completed" : ""}
              onClick={() => {
                if (index <= currentSection) setCurrentSection(index);
              }}
            >
              <span>{index < currentSection ? <Check size={13} /> : index + 1}</span>
              {candidate.title}
            </button>
          ))}
        </nav>
        <div className="draft-policy-note"><TriangleAlert size={16} /><span>Safety rules are in draft and force supervisor review.</span></div>
      </aside>

      <section className="inspection-content">
        <header className="inspection-header">
          <div><span className="eyebrow">{template.name.toUpperCase()} · VERSION {template.version}</span><h1>{section.title}</h1>{section.description ? <p>{section.description}</p> : null}</div>
          <span className="section-count">{currentSection + 1} of {template.sections.length}</span>
        </header>

        <div className="inspection-fields">
          {section.items.filter(itemVisible).map((item) => {
            const answer = answerFor(item.id);
            const defectRule = ruleFor(item.id, answer.response);
            return (
              <div className={`inspection-field ${answer.response === "defect" ? "inspection-field-defect" : ""}`} key={item.id}>
                <div className="field-heading"><div><label>{item.label}{item.required ? <span aria-label="Required"> *</span> : null}</label>{item.helpText ? <p>{item.helpText}</p> : null}</div>{defectRule ? <span className={`severity-chip severity-${defectRule.severity}`}>{defectRule.severity}</span> : null}</div>
                <FieldControl item={item} answer={answer} onChange={(patch) => updateAnswer(item.id, patch)} onUploadingChange={(uploading) => setUploadingCount((count) => Math.max(0, count + (uploading ? 1 : -1)))} />
                {defectRule ? (
                  <div className="defect-evidence">
                    {defectRule.blockDeparture ? <div className="blocking-rule-warning"><ShieldAlert size={17} /><span>This condition blocks vehicle departure and requires supervisor review.</span></div> : null}
                    <label><span>Defect comment{defectRule.requireComment ? " *" : ""}</span><textarea value={answer.comment} onChange={(event) => updateAnswer(item.id, { comment: event.target.value })} placeholder="Describe what you observed…" rows={3} /></label>
                    <PhotoUpload value={answer.photos} onChange={(photos) => updateAnswer(item.id, { photos })} onUploadingChange={(uploading) => setUploadingCount((count) => Math.max(0, count + (uploading ? 1 : -1)))} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {error ? <div className="form-error" role="alert"><TriangleAlert size={17} /> {error}</div> : null}
        <footer className="inspection-footer">
          <button className="button button-secondary" type="button" disabled={currentSection === 0} onClick={() => setCurrentSection((value) => Math.max(0, value - 1))}><ArrowLeft size={17} /> Previous</button>
          {currentSection < template.sections.length - 1 ? (
            <button className="button button-primary" type="button" onClick={nextSection}>Continue <ArrowRight size={17} /></button>
          ) : (
            <button className="button button-primary" type="button" disabled={submitting || uploadingCount > 0} onClick={() => void submit()}>{submitting ? <LoaderCircle className="spin" size={17} /> : <ClipboardCheck size={17} />}{submitting ? "Submitting…" : "Submit inspection"}</button>
          )}
        </footer>
      </section>
    </div>
  );
}

function answerForFrom(state: Record<string, AnswerState>, itemId: string): AnswerState {
  return state[itemId] ?? { response: null, comment: "", photos: [] };
}

function FieldControl({
  item,
  answer,
  onChange,
}: {
  item: FormItem;
  answer: AnswerState;
  onChange: (patch: Partial<AnswerState>) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  if (item.fieldType === "pass_defect_na") {
    return (
      <div className="response-segmented">
        {[{ value: "pass", label: "Pass", icon: CheckCircle2 }, { value: "defect", label: "Defect", icon: TriangleAlert }, { value: "not_applicable", label: "N/A", icon: ChevronRight }].map((option) => {
          const Icon = option.icon;
          return <button key={option.value} type="button" className={answer.response === option.value ? `selected selected-${option.value}` : ""} onClick={() => onChange({ response: option.value })}><Icon size={16} /> {option.label}</button>;
        })}
      </div>
    );
  }
  if (item.fieldType === "damage_map") {
    return <DamageMap value={Array.isArray(answer.response) ? answer.response : []} onChange={(markers) => onChange({ response: markers })} />;
  }
  if (item.fieldType === "attestation") {
    return <label className={`attestation-control ${answer.response === true ? "checked" : ""}`}><input type="checkbox" checked={answer.response === true} onChange={(event) => onChange({ response: event.target.checked })} /><span><Check size={15} /></span><strong>{answer.response === true ? "Attestation accepted" : "Select to accept this attestation"}</strong></label>;
  }
  if (["select", "fuel_level"].includes(item.fieldType)) {
    return <select className="field-control" value={typeof answer.response === "string" ? answer.response : ""} onChange={(event) => onChange({ response: event.target.value })}><option value="">Select an option</option>{item.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  }
  if (["number", "odometer"].includes(item.fieldType)) {
    return <input className="field-control" type="number" min={0} inputMode="numeric" value={typeof answer.response === "number" ? answer.response : ""} onChange={(event) => onChange({ response: event.target.value === "" ? null : Number(event.target.value) })} placeholder={item.fieldType === "odometer" ? "Enter current odometer" : "Enter value"} />;
  }
  if (item.fieldType === "textarea") {
    return <textarea className="field-control" value={typeof answer.response === "string" ? answer.response : ""} onChange={(event) => onChange({ response: event.target.value })} rows={4} placeholder="Enter details…" />;
  }
  return <input className="field-control" type="text" value={typeof answer.response === "string" ? answer.response : ""} onChange={(event) => onChange({ response: event.target.value })} placeholder="Enter value" />;
}
