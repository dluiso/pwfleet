"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CirclePlus,
  Eye,
  FileText,
  GripVertical,
  Layers3,
  ListTree,
  Monitor,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { formatEnum } from "@/lib/format";

type FieldType = "pass_defect_na" | "text" | "textarea" | "number" | "odometer" | "fuel_level" | "photo" | "attestation" | "damage_map" | "select";
type Severity = "none" | "advisory" | "minor" | "major" | "critical";
type Disposition = "inspection_required" | "cleared" | "cleared_with_advisory" | "hold_for_review" | "out_of_service" | "maintenance_in_progress" | "ready_for_reinspection";
type VisibilityCondition = { sourceItemKey: string; operator: "equals" | "not_equals" | "is_truthy"; value: string };
type BuilderTab = "build" | "logic" | "preview" | "settings" | "publish";
type PreviewDevice = "phone" | "tablet" | "desktop";

export type DraftRuleDefinition = {
  whenResponse: string;
  severity: Severity;
  disposition: Disposition;
  blockDeparture: boolean;
  requireComment: boolean;
  requirePhoto: boolean;
  createDefect: boolean;
  notifyDriver: boolean;
  notifySupervisor: boolean;
  notifyMaintenance: boolean;
  driverMessage: string;
};

export type DraftItemDefinition = {
  itemKey: string;
  label: string;
  helpText: string;
  fieldType: FieldType;
  required: boolean;
  options: string[];
  visibilityCondition: VisibilityCondition | null;
  rules: DraftRuleDefinition[];
};

export type DraftSectionDefinition = {
  sectionKey: string;
  title: string;
  description: string;
  items: DraftItemDefinition[];
};

type DraftDefinition = {
  recordVersion: number;
  name: string;
  description: string;
  sections: DraftSectionDefinition[];
};

const fieldTypes: FieldType[] = ["pass_defect_na", "text", "textarea", "number", "odometer", "fuel_level", "photo", "attestation", "damage_map", "select"];
const severities: Severity[] = ["none", "advisory", "minor", "major", "critical"];
const dispositions: Disposition[] = ["cleared", "cleared_with_advisory", "hold_for_review", "out_of_service", "maintenance_in_progress", "inspection_required", "ready_for_reinspection"];
const blockingDispositions = new Set<Disposition>(["hold_for_review", "out_of_service", "maintenance_in_progress"]);
const blockingMessage = "Do not operate this vehicle until the reported condition is reviewed and the vehicle is released.";
const tabs: Array<{ id: BuilderTab; label: string; icon: typeof FileText }> = [
  { id: "build", label: "Build", icon: Layers3 },
  { id: "logic", label: "Logic", icon: ListTree },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "publish", label: "Publish", icon: ShieldCheck },
];

function newRule(): DraftRuleDefinition {
  return {
    whenResponse: "defect",
    severity: "major",
    disposition: "hold_for_review",
    blockDeparture: true,
    requireComment: true,
    requirePhoto: false,
    createDefect: true,
    notifyDriver: true,
    notifySupervisor: true,
    notifyMaintenance: false,
    driverMessage: blockingMessage,
  };
}

function newItem(): DraftItemDefinition {
  return {
    itemKey: `field_${Date.now()}`,
    label: "",
    helpText: "",
    fieldType: "pass_defect_na",
    required: true,
    options: [],
    visibilityCondition: null,
    rules: [],
  };
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}

function normalizeRule(rule: DraftRuleDefinition): DraftRuleDefinition {
  if (rule.severity === "critical") {
    return { ...rule, disposition: "out_of_service", blockDeparture: true, createDefect: true, notifyDriver: true, notifySupervisor: true, driverMessage: rule.driverMessage || blockingMessage };
  }
  if (rule.severity === "none") return { ...rule, disposition: "cleared", blockDeparture: false, createDefect: false };
  const blockDeparture = blockingDispositions.has(rule.disposition);
  return {
    ...rule,
    blockDeparture,
    createDefect: blockDeparture ? true : rule.createDefect,
    notifyDriver: blockDeparture ? true : rule.notifyDriver,
    notifySupervisor: blockDeparture ? true : rule.notifySupervisor,
    driverMessage: blockDeparture ? rule.driverMessage || blockingMessage : rule.driverMessage,
  };
}

function fieldsBefore(sections: DraftSectionDefinition[], sectionIndex: number, itemIndex: number) {
  return sections.flatMap((section, currentSection) =>
    section.items
      .filter((_, currentItem) => currentSection < sectionIndex || (currentSection === sectionIndex && currentItem < itemIndex))
      .map((item) => ({ itemKey: item.itemKey, label: item.label })),
  );
}

function PreviewField({ item }: { item: DraftItemDefinition }) {
  if (item.fieldType === "pass_defect_na") return <div className="builder-preview-choice"><span>Pass</span><span>Defect</span><span>N/A</span></div>;
  if (item.fieldType === "select" || item.fieldType === "fuel_level") return <select disabled defaultValue=""><option value="">Select an option</option>{item.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (item.fieldType === "textarea") return <textarea disabled rows={3} placeholder="Enter details" />;
  if (item.fieldType === "photo") return <div className="builder-preview-upload">Add photo evidence</div>;
  if (item.fieldType === "damage_map") return <div className="builder-preview-damage">Interactive vehicle damage map</div>;
  if (item.fieldType === "attestation") return <div className="builder-preview-attestation"><input disabled type="checkbox" /> <span>I confirm this statement</span></div>;
  return <input disabled type={item.fieldType === "number" || item.fieldType === "odometer" ? "number" : "text"} placeholder={item.fieldType === "odometer" ? "Enter current odometer" : "Enter response"} />;
}

export function DraftTemplateEditor({ templateId, initial, workflow }: { templateId: string; initial: DraftDefinition; workflow?: ReactNode }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<BuilderTab>("build");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState<number | null>(initial.sections[0]?.items.length ? 0 : null);
  const [search, setSearch] = useState("");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("phone");

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const activeSection = draft.sections[sectionIndex] ?? null;
  const activeItem = itemIndex === null ? null : activeSection?.items[itemIndex] ?? null;
  const allFields = useMemo(() => draft.sections.flatMap((section, currentSection) => section.items.map((item, currentItem) => ({ section, item, sectionIndex: currentSection, itemIndex: currentItem }))), [draft.sections]);
  const allRules = allFields.flatMap(({ item }) => item.rules);
  const blockingRules = allRules.filter((rule) => rule.blockDeparture).length;
  const criticalRules = allRules.filter((rule) => rule.severity === "critical").length;
  const mandatoryAttestations = allFields.filter(({ item }) => item.fieldType === "attestation" && item.required).length;
  const missingDefectRules = allFields.filter(({ item }) => item.fieldType === "pass_defect_na" && !item.rules.some((rule) => rule.whenResponse === "defect")).length;
  const readiness = [
    { label: "At least one section", ready: draft.sections.length > 0 },
    { label: "At least one field", ready: allFields.length > 0 },
    { label: "Required attestation", ready: mandatoryAttestations > 0 },
    { label: "Defect rules configured", ready: missingDefectRules === 0 },
    { label: "All changes saved", ready: !dirty },
  ];
  const readyForReview = readiness.every((item) => item.ready);

  function change(next: DraftDefinition) {
    setDraft(next);
    setDirty(true);
    setSaved(null);
  }

  function selectSection(nextIndex: number) {
    setSectionIndex(nextIndex);
    setItemIndex(draft.sections[nextIndex]?.items.length ? 0 : null);
  }

  function updateSection(index: number, patch: Partial<DraftSectionDefinition>) {
    change({ ...draft, sections: draft.sections.map((section, current) => current === index ? { ...section, ...patch } : section) });
  }

  function updateItem(targetSection: number, targetItem: number, patch: Partial<DraftItemDefinition>) {
    const section = draft.sections[targetSection]!;
    change({
      ...draft,
      sections: draft.sections.map((entry, current) => current === targetSection ? { ...entry, items: section.items.map((item, itemPosition) => itemPosition === targetItem ? { ...item, ...patch } : item) } : entry),
    });
  }

  function updateRule(ruleIndex: number, patch: Partial<DraftRuleDefinition>) {
    if (!activeItem || itemIndex === null) return;
    updateItem(sectionIndex, itemIndex, { rules: activeItem.rules.map((rule, current) => current === ruleIndex ? normalizeRule({ ...rule, ...patch }) : rule) });
  }

  function addSection() {
    const nextIndex = draft.sections.length;
    change({ ...draft, sections: [...draft.sections, { sectionKey: `section_${Date.now()}`, title: "", description: "", items: [] }] });
    setSectionIndex(nextIndex);
    setItemIndex(null);
    setTab("build");
  }

  function removeSection(index: number) {
    const section = draft.sections[index]!;
    if (!window.confirm(`Remove section “${section.title || "Untitled section"}” and all of its fields from this draft?`)) return;
    const nextSections = draft.sections.filter((_, current) => current !== index);
    change({ ...draft, sections: nextSections });
    const nextIndex = Math.max(0, Math.min(index, nextSections.length - 1));
    setSectionIndex(nextIndex);
    setItemIndex(nextSections[nextIndex]?.items.length ? 0 : null);
  }

  function moveSection(direction: -1 | 1) {
    const target = sectionIndex + direction;
    if (target < 0 || target >= draft.sections.length) return;
    change({ ...draft, sections: move(draft.sections, sectionIndex, direction) });
    setSectionIndex(target);
  }

  function addItem() {
    if (!activeSection) return;
    updateSection(sectionIndex, { items: [...activeSection.items, newItem()] });
    setItemIndex(activeSection.items.length);
  }

  function removeItem(targetItem: number) {
    if (!activeSection) return;
    const item = activeSection.items[targetItem]!;
    if (!window.confirm(`Remove field “${item.label || "Untitled field"}” from this draft?`)) return;
    const nextItems = activeSection.items.filter((_, current) => current !== targetItem);
    updateSection(sectionIndex, { items: nextItems });
    setItemIndex(nextItems.length ? Math.min(targetItem, nextItems.length - 1) : null);
  }

  function moveItem(direction: -1 | 1) {
    if (!activeSection || itemIndex === null) return;
    const target = itemIndex + direction;
    if (target < 0 || target >= activeSection.items.length) return;
    updateSection(sectionIndex, { items: move(activeSection.items, itemIndex, direction) });
    setItemIndex(target);
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch(`/api/admin/forms/${templateId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const payload = (await response.json()) as { recordVersion?: number; fieldCount?: number; ruleCount?: number; error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
      if (!response.ok || !payload.recordVersion) {
        const detail = [...(payload.details?.formErrors ?? []), ...Object.values(payload.details?.fieldErrors ?? {}).flat()][0];
        throw new Error([payload.error ?? "The draft could not be saved.", detail].filter(Boolean).join(" "));
      }
      setDraft((current) => ({ ...current, recordVersion: payload.recordVersion! }));
      setDirty(false);
      setSaved(`Saved ${payload.fieldCount} fields and ${payload.ruleCount} rules.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function renderFieldProperties() {
    if (!activeItem || itemIndex === null) return <div className="builder-inspector-empty"><FileText size={24} /><strong>Select a field</strong><p>Choose a field from the canvas to edit its label, type, options, and requirements.</p></div>;
    return <div className="builder-inspector-body">
      <div className="builder-inspector-title"><div><span className="eyebrow">FIELD PROPERTIES</span><h3>{activeItem.label || "Untitled field"}</h3></div><span className="draft-field-number">{itemIndex + 1}</span></div>
      <label><span>Field label *</span><input value={activeItem.label} maxLength={240} onChange={(event) => updateItem(sectionIndex, itemIndex, { label: event.target.value })} /></label>
      <label><span>Stable key *</span><input value={activeItem.itemKey} maxLength={100} onChange={(event) => updateItem(sectionIndex, itemIndex, { itemKey: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></label>
      <label><span>Field type *</span><select value={activeItem.fieldType} onChange={(event) => updateItem(sectionIndex, itemIndex, { fieldType: event.target.value as FieldType, options: event.target.value === "select" || event.target.value === "fuel_level" ? activeItem.options : [] })}>{fieldTypes.map((fieldType) => <option key={fieldType} value={fieldType}>{formatEnum(fieldType)}</option>)}</select></label>
      <label><span>Help text</span><textarea rows={3} maxLength={500} value={activeItem.helpText} onChange={(event) => updateItem(sectionIndex, itemIndex, { helpText: event.target.value })} /></label>
      {activeItem.fieldType === "select" || activeItem.fieldType === "fuel_level" ? <label><span>Options * · one per line</span><textarea rows={6} value={activeItem.options.join("\n")} onChange={(event) => updateItem(sectionIndex, itemIndex, { options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean) })} /></label> : null}
      <label className="checkbox-field builder-checkbox"><input type="checkbox" checked={activeItem.required} onChange={(event) => updateItem(sectionIndex, itemIndex, { required: event.target.checked })} /><span>Required field</span></label>
      <div className="builder-property-actions"><button type="button" title="Move field up" disabled={itemIndex === 0} onClick={() => moveItem(-1)}><ArrowUp size={14} /> Move up</button><button type="button" title="Move field down" disabled={itemIndex === activeSection!.items.length - 1} onClick={() => moveItem(1)}><ArrowDown size={14} /> Move down</button><button className="builder-delete-action" type="button" onClick={() => removeItem(itemIndex)}><Trash2 size={14} /> Delete</button></div>
    </div>;
  }

  function renderLogicEditor() {
    if (!activeItem || itemIndex === null) return <div className="panel builder-inspector-empty"><ListTree size={24} /><strong>Select a field</strong><p>Choose a field to configure visibility and exception rules.</p></div>;
    const sources = fieldsBefore(draft.sections, sectionIndex, itemIndex);
    return <div className="builder-logic-editor">
      <article className="panel builder-logic-card">
        <header><div><span className="eyebrow">CONDITIONAL VISIBILITY</span><h3>{activeItem.label || "Untitled field"}</h3></div><label className="builder-switch"><input type="checkbox" checked={Boolean(activeItem.visibilityCondition)} disabled={sources.length === 0} onChange={(event) => updateItem(sectionIndex, itemIndex, { visibilityCondition: event.target.checked && sources[0] ? { sourceItemKey: sources[0].itemKey, operator: "equals", value: "yes" } : null })} /><span>{activeItem.visibilityCondition ? "Enabled" : "Always visible"}</span></label></header>
        {activeItem.visibilityCondition ? <div className="draft-visibility-grid"><label><span>Earlier source field *</span><select value={activeItem.visibilityCondition.sourceItemKey} onChange={(event) => updateItem(sectionIndex, itemIndex, { visibilityCondition: { ...activeItem.visibilityCondition!, sourceItemKey: event.target.value } })}>{sources.map((source) => <option value={source.itemKey} key={source.itemKey}>{source.label || "Untitled field"} · {source.itemKey}</option>)}</select></label><label><span>Condition *</span><select value={activeItem.visibilityCondition.operator} onChange={(event) => updateItem(sectionIndex, itemIndex, { visibilityCondition: { ...activeItem.visibilityCondition!, operator: event.target.value as VisibilityCondition["operator"] } })}><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="is_truthy">Is selected / true</option></select></label>{activeItem.visibilityCondition.operator !== "is_truthy" ? <label><span>Comparison value *</span><input maxLength={240} value={activeItem.visibilityCondition.value} onChange={(event) => updateItem(sectionIndex, itemIndex, { visibilityCondition: { ...activeItem.visibilityCondition!, value: event.target.value } })} /></label> : null}</div> : <p className="builder-logic-help">Conditional fields can reference only an earlier field, preventing circular dependencies.{sources.length === 0 ? " Move this field after another field to enable conditions." : ""}</p>}
      </article>
      <article className="panel builder-logic-card">
        <header><div><span className="eyebrow">EXCEPTION RULES</span><h3>{activeItem.rules.length} configured</h3></div><button className="button button-secondary button-small" type="button" onClick={() => updateItem(sectionIndex, itemIndex, { rules: [...activeItem.rules, newRule()] })}><CirclePlus size={14} /> Add rule</button></header>
        <p className="builder-logic-help">No matching rule still triggers fail-safe supervisor review for a reported defect.</p>
        <div className="draft-rule-list">{activeItem.rules.length === 0 ? <div className="builder-inline-empty"><ShieldAlert size={18} /><span>No explicit exception rules for this field.</span></div> : null}{activeItem.rules.map((rule, ruleIndex) => <article className="draft-rule-card" key={`${rule.whenResponse}-${ruleIndex}`}><header><strong>Rule {ruleIndex + 1}</strong><span className={`severity-chip severity-${rule.severity}`}>{formatEnum(rule.severity)}{rule.blockDeparture ? " · Blocks departure" : ""}</span><button type="button" title="Remove rule" onClick={() => updateItem(sectionIndex, itemIndex, { rules: activeItem.rules.filter((_, current) => current !== ruleIndex) })}><Trash2 size={13} /></button></header><div className="draft-rule-grid"><label><span>When response equals *</span><input value={rule.whenResponse} maxLength={80} onChange={(event) => updateRule(ruleIndex, { whenResponse: event.target.value.toLowerCase() })} /></label><label><span>Severity *</span><select value={rule.severity} onChange={(event) => updateRule(ruleIndex, { severity: event.target.value as Severity })}>{severities.map((severity) => <option value={severity} key={severity}>{formatEnum(severity)}</option>)}</select></label><label><span>Vehicle disposition *</span><select value={rule.disposition} disabled={rule.severity === "critical" || rule.severity === "none"} onChange={(event) => updateRule(ruleIndex, { disposition: event.target.value as Disposition })}>{dispositions.map((disposition) => <option value={disposition} key={disposition}>{formatEnum(disposition)}</option>)}</select></label><div className="draft-rule-flags"><label><input type="checkbox" checked={rule.requireComment} onChange={(event) => updateRule(ruleIndex, { requireComment: event.target.checked })} /><span>Require comment</span></label><label><input type="checkbox" checked={rule.requirePhoto} onChange={(event) => updateRule(ruleIndex, { requirePhoto: event.target.checked })} /><span>Require photo</span></label><label><input type="checkbox" checked={rule.createDefect} disabled={rule.blockDeparture || rule.severity === "none"} onChange={(event) => updateRule(ruleIndex, { createDefect: event.target.checked })} /><span>Create defect</span></label><label><input type="checkbox" checked={rule.notifyDriver} disabled={rule.blockDeparture} onChange={(event) => updateRule(ruleIndex, { notifyDriver: event.target.checked })} /><span>Notify driver</span></label><label><input type="checkbox" checked={rule.notifySupervisor} disabled={rule.blockDeparture} onChange={(event) => updateRule(ruleIndex, { notifySupervisor: event.target.checked })} /><span>Notify supervisor</span></label><label><input type="checkbox" checked={rule.notifyMaintenance} onChange={(event) => updateRule(ruleIndex, { notifyMaintenance: event.target.checked })} /><span>Notify maintenance</span></label></div><label className="draft-wide"><span>Driver instruction {rule.blockDeparture ? "*" : ""}</span><textarea rows={2} maxLength={500} value={rule.driverMessage} onChange={(event) => updateRule(ruleIndex, { driverMessage: event.target.value })} /></label>{rule.blockDeparture ? <p className="draft-block-note"><ShieldAlert size={14} /> This disposition automatically blocks departure.</p> : null}</div></article>)}</div>
      </article>
    </div>;
  }

  const filteredItems = activeSection?.items.map((item, index) => ({ item, index })).filter(({ item }) => !search.trim() || `${item.label} ${item.itemKey} ${item.fieldType}`.toLowerCase().includes(search.toLowerCase())) ?? [];

  return (
    <section className="draft-editor builder-shell">
      <div className="panel draft-editor-toolbar builder-toolbar"><div><span className="eyebrow">DRAFT BUILDER</span><h2>{draft.name}</h2><p>{dirty ? "Unsaved changes" : "All changes saved"} · Version definition #{draft.recordVersion}</p></div><div className="draft-save-area">{error ? <span className="draft-save-error">{error}</span> : null}{saved ? <span className="draft-save-success">{saved}</span> : null}<button className="button button-primary" type="button" disabled={busy || !dirty} onClick={saveDraft}><Save size={16} /> {busy ? "Saving…" : dirty ? "Save draft" : "Saved"}</button></div></div>

      <nav className="panel builder-tabs" aria-label="Form builder areas">{tabs.map((entry) => { const Icon = entry.icon; return <button className={tab === entry.id ? "builder-tab builder-tab-active" : "builder-tab"} type="button" key={entry.id} onClick={() => setTab(entry.id)}><Icon size={16} /><span>{entry.label}</span>{entry.id === "publish" && !readyForReview ? <i>{readiness.filter((item) => !item.ready).length}</i> : null}</button>; })}</nav>

      {tab === "build" ? <div className="builder-workspace">
        <aside className="panel builder-sections-panel"><header><div><span className="eyebrow">FORM OUTLINE</span><h3>Sections</h3></div><span>{draft.sections.length}</span></header><div className="builder-section-list">{draft.sections.map((section, index) => <button className={sectionIndex === index ? "builder-section-option builder-section-option-active" : "builder-section-option"} type="button" key={`${section.sectionKey}-${index}`} onClick={() => selectSection(index)}><span>{index + 1}</span><span><strong>{section.title || "Untitled section"}</strong><small>{section.items.length} field{section.items.length === 1 ? "" : "s"}</small></span></button>)}</div><button className="builder-panel-add" type="button" onClick={addSection}><CirclePlus size={15} /> Add section</button></aside>
        <main className="panel builder-canvas">{activeSection ? <><header className="builder-canvas-header"><div><span className="eyebrow">SECTION {sectionIndex + 1}</span><h3>{activeSection.title || "Untitled section"}</h3><p>{activeSection.description || "No section instructions."}</p></div><div className="draft-order-actions"><button type="button" title="Move section up" disabled={sectionIndex === 0} onClick={() => moveSection(-1)}><ArrowUp size={14} /></button><button type="button" title="Move section down" disabled={sectionIndex === draft.sections.length - 1} onClick={() => moveSection(1)}><ArrowDown size={14} /></button><button className="draft-delete" type="button" title="Delete section" onClick={() => removeSection(sectionIndex)}><Trash2 size={14} /></button></div></header><div className="builder-section-config"><label><span>Section title *</span><input value={activeSection.title} maxLength={180} onChange={(event) => updateSection(sectionIndex, { title: event.target.value })} /></label><label><span>Stable key *</span><input value={activeSection.sectionKey} maxLength={80} onChange={(event) => updateSection(sectionIndex, { sectionKey: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></label><label className="draft-wide"><span>Instructions</span><textarea rows={2} maxLength={800} value={activeSection.description} onChange={(event) => updateSection(sectionIndex, { description: event.target.value })} /></label></div><div className="builder-field-toolbar"><label><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fields in this section" /></label><span>{filteredItems.length} shown</span></div><div className="builder-field-list">{filteredItems.length === 0 ? <div className="builder-canvas-empty"><FileText size={25} /><strong>{activeSection.items.length ? "No matching fields" : "This section is empty"}</strong><p>{activeSection.items.length ? "Clear the search to see every field." : "Add the first field and configure its properties."}</p></div> : filteredItems.map(({ item, index }) => <button className={itemIndex === index ? "builder-field-row builder-field-row-active" : "builder-field-row"} type="button" key={`${item.itemKey}-${index}`} onClick={() => setItemIndex(index)}><GripVertical size={15} /><span className="draft-field-number">{index + 1}</span><span><strong>{item.label || "Untitled field"}</strong><small>{formatEnum(item.fieldType)} · {item.required ? "Required" : "Optional"}{item.visibilityCondition ? " · Conditional" : ""}</small></span><span className="builder-field-badges">{item.rules.length ? <i>{item.rules.length} rule{item.rules.length === 1 ? "" : "s"}</i> : null}{item.rules.some((rule) => rule.blockDeparture) ? <i className="builder-blocking-badge">Blocking</i> : null}</span></button>)}</div><button className="draft-add-row" type="button" onClick={addItem}><CirclePlus size={15} /> Add field to {activeSection.title || "this section"}</button></> : <div className="builder-canvas-empty"><Layers3 size={28} /><strong>No sections yet</strong><p>Add a section to begin building this form.</p><button className="button button-primary" type="button" onClick={addSection}><CirclePlus size={15} /> Add first section</button></div>}</main>
        <aside className="panel builder-inspector">{renderFieldProperties()}</aside>
      </div> : null}

      {tab === "logic" ? <div className="builder-logic-workspace"><aside className="panel builder-logic-nav"><header><span className="eyebrow">FIELDS</span><h3>Logic targets</h3></header><div>{allFields.map((entry, index) => <button className={entry.sectionIndex === sectionIndex && entry.itemIndex === itemIndex ? "builder-logic-option builder-logic-option-active" : "builder-logic-option"} type="button" key={`${entry.item.itemKey}-${index}`} onClick={() => { setSectionIndex(entry.sectionIndex); setItemIndex(entry.itemIndex); }}><span><strong>{entry.item.label || "Untitled field"}</strong><small>{entry.section.title || "Untitled section"}</small></span><span>{entry.item.rules.length}</span></button>)}</div></aside>{renderLogicEditor()}</div> : null}

      {tab === "preview" ? <section className="panel builder-preview-panel"><header><div><span className="eyebrow">LIVE PREVIEW</span><h3>Driver experience</h3><p>Preview uses the current unsaved draft and does not create an inspection.</p></div><div className="builder-device-switch"><button className={previewDevice === "phone" ? "active" : ""} type="button" onClick={() => setPreviewDevice("phone")} title="Phone preview"><Smartphone size={16} /></button><button className={previewDevice === "tablet" ? "active" : ""} type="button" onClick={() => setPreviewDevice("tablet")} title="Tablet preview"><Tablet size={16} /></button><button className={previewDevice === "desktop" ? "active" : ""} type="button" onClick={() => setPreviewDevice("desktop")} title="Desktop preview"><Monitor size={16} /></button></div></header><div className="builder-preview-stage"><div className={`builder-preview-frame builder-preview-${previewDevice}`}><div className="builder-preview-appbar"><span>PW Fleet</span><strong>Inspection preview</strong></div><div className="builder-preview-content"><span className="eyebrow">PRE-TRIP INSPECTION</span><h2>{draft.name || "Untitled inspection"}</h2><p>{draft.description || "No form description."}</p>{draft.sections.map((section, currentSection) => <section key={`${section.sectionKey}-${currentSection}`}><header><span>{currentSection + 1}</span><div><strong>{section.title || "Untitled section"}</strong><small>{section.description}</small></div></header>{section.items.map((item, currentItem) => <label className="builder-preview-field" key={`${item.itemKey}-${currentItem}`}><span>{item.label || "Untitled field"}{item.required ? " *" : ""}</span>{item.helpText ? <small>{item.helpText}</small> : null}<PreviewField item={item} /></label>)}</section>)}</div></div></div></section> : null}

      {tab === "settings" ? <div className="builder-settings-layout"><article className="panel builder-settings-card"><header><span className="eyebrow">FORM SETTINGS</span><h3>Identity and instructions</h3></header><div className="draft-metadata-grid"><label><span>Form name *</span><input value={draft.name} maxLength={180} onChange={(event) => change({ ...draft, name: event.target.value })} /></label><label className="draft-wide"><span>Description</span><textarea rows={5} maxLength={1200} value={draft.description} onChange={(event) => change({ ...draft, description: event.target.value })} /></label></div></article><section className="draft-readiness-grid builder-stat-grid" aria-label="Draft definition summary"><article className="panel"><span>Sections</span><strong>{draft.sections.length}</strong></article><article className="panel"><span>Fields</span><strong>{allFields.length}</strong></article><article className="panel"><span>Rules</span><strong>{allRules.length}</strong></article><article className="panel"><span>Blocking</span><strong>{blockingRules}</strong></article><article className="panel"><span>Critical</span><strong>{criticalRules}</strong></article><article className={mandatoryAttestations ? "panel draft-readiness-ok" : "panel draft-readiness-alert"}><span>Attestations</span><strong>{mandatoryAttestations}</strong></article></section></div> : null}

      {tab === "publish" ? <div className="builder-publish-workspace"><section className="panel builder-publish-panel"><header><span className={readyForReview ? "builder-readiness-icon builder-ready" : "builder-readiness-icon"}>{readyForReview ? <CheckCircle2 size={25} /> : <AlertTriangle size={25} />}</span><div><span className="eyebrow">PUBLICATION READINESS</span><h3>{readyForReview ? "Draft is ready for review" : "Complete the draft before review"}</h3><p>Publication remains controlled by independent Operations and Governance approvals.</p></div></header><div className="builder-readiness-list">{readiness.map((item) => <div className={item.ready ? "builder-readiness-row builder-readiness-row-ready" : "builder-readiness-row"} key={item.label}>{item.ready ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}<span>{item.label}</span><strong>{item.ready ? "Ready" : "Required"}</strong></div>)}</div><footer><div><strong>Next step</strong><p>{dirty ? "Save the current changes before requesting review." : readyForReview ? "Use the controlled workflow below to request independent review." : "Return to Build or Logic to resolve the missing requirements."}</p></div><a className="button button-primary" href="#template-workflow-heading"><ShieldCheck size={16} /> Review workflow</a></footer></section>{workflow}</div> : null}
    </section>
  );
}
