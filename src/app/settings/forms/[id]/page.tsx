import { ArrowLeft, CheckCircle2, CopyPlus, FileCog, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateTemplateVersionButton } from "@/components/create-template-version-button";
import { DeleteDraftTemplateButton } from "@/components/delete-draft-template-button";
import { DraftTemplateEditor } from "@/components/draft-template-editor";
import { TemplateWorkflowPanel } from "@/components/template-workflow-panel";
import { formatEnum } from "@/lib/format";
import { getAdministrationTemplate } from "@/modules/administration/service";

export default async function FormVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const detail = await getAdministrationTemplate((await params).id);
  if (!detail) notFound();
  const { template, sections, items, rules, versions, reviews, actor } = detail;
  const existingDraft = versions.find((version) => version.status === "draft");
  const draftIsEditable = template.status === "draft" && (template.reviewStatus === "draft" || template.reviewStatus === "changes_requested") && actor.role === "administrator";
  const draftDefinition = draftIsEditable ? {
    recordVersion: template.recordVersion,
    name: template.name,
    description: template.description ?? "",
    sections: sections.map((section) => ({
      sectionKey: section.sectionKey,
      title: section.title,
      description: section.description ?? "",
      items: items.filter((item) => item.sectionId === section.id).map((item) => ({
        itemKey: item.itemKey,
        label: item.label,
        helpText: item.helpText ?? "",
        fieldType: item.fieldType,
        required: item.required,
        options: item.options ?? [],
        visibilityCondition: item.visibilityCondition ? {
          sourceItemKey: item.visibilityCondition.sourceItemKey,
          operator: item.visibilityCondition.operator,
          value: item.visibilityCondition.value ?? "",
        } : null,
        rules: rules.filter((rule) => rule.inspectionItemId === item.id).map((rule) => ({
          whenResponse: rule.whenResponse,
          severity: rule.severity,
          disposition: rule.disposition,
          blockDeparture: rule.blockDeparture,
          requireComment: rule.requireComment,
          requirePhoto: rule.requirePhoto,
          createDefect: rule.createDefect,
          notifyDriver: rule.notifyDriver,
          notifySupervisor: rule.notifySupervisor,
          notifyMaintenance: rule.notifyMaintenance,
          driverMessage: rule.driverMessage ?? "",
        })),
      })),
    })),
  } : null;

  return (
    <div className="page-stack">
      <Link className="back-link" href="/settings/forms"><ArrowLeft size={16} /> Back to form catalog</Link>
      <section className="form-version-hero">
        <span className="record-icon"><FileCog size={20} /></span>
        <div><span className="eyebrow">{template.code}</span><h1>{template.name}</h1><p>Version {template.version} · {formatEnum(template.status)} · {items.length} fields</p></div>
        <span className={`severity-chip ${template.ruleSetStatus === "approved" ? "severity-minor" : "severity-critical"}`}>{formatEnum(template.ruleSetStatus)} rules</span>
        {template.status === "published" && !existingDraft && actor.role === "administrator" ? <CreateTemplateVersionButton templateId={template.id} /> : null}
        {template.status === "published" && existingDraft ? <Link className="button button-secondary" href={`/settings/forms/${existingDraft.id}`}><CopyPlus size={17} /> Open draft v{existingDraft.version}</Link> : null}
      </section>
      <article className="safety-callout safety-callout-wide">
        {template.status === "draft" ? <ShieldAlert size={22} /> : <CheckCircle2 size={22} />}
        <div>
          <strong>{template.status === "draft" ? "Safe draft workspace" : "Immutable published version"}</strong>
          <p>{template.status === "draft" ? "Only this draft can be edited. Saving returns its rules to Draft status; it remains unavailable for vehicle assignment until a separate review and publication workflow is completed." : "Create a successor draft to make changes. Existing inspections and assignments remain pinned to this exact version."}</p>
        </div>
      </article>
      {!draftDefinition ? <TemplateWorkflowPanel templateId={template.id} template={{ status: template.status, reviewStatus: template.reviewStatus, reviewRound: template.reviewRound, reviewRequestedByUserId: template.reviewRequestedByUserId }} actor={actor} reviews={reviews} /> : null}
      <section className={draftDefinition ? "form-version-layout form-version-layout-builder" : "form-version-layout"}>
        {draftDefinition ? <DraftTemplateEditor templateId={template.id} initial={draftDefinition} workflow={<div key="draft-review-workflow"><TemplateWorkflowPanel templateId={template.id} template={{ status: template.status, reviewStatus: template.reviewStatus, reviewRound: template.reviewRound, reviewRequestedByUserId: template.reviewRequestedByUserId }} actor={actor} reviews={reviews} /></div>} /> : <div className="form-section-list">
          {sections.map((section) => {
            const sectionItems = items.filter((item) => item.sectionId === section.id);
            return (
              <article className="panel form-definition-section" key={section.id}>
                <header><div><span className="eyebrow">SECTION {section.sortOrder + 1}</span><h2>{section.title}</h2></div><span>{sectionItems.length} fields</span></header>
                {section.description ? <p className="form-section-description">{section.description}</p> : null}
                <div className="form-definition-items">
                  {sectionItems.map((item) => {
                    const itemRules = rules.filter((rule) => rule.inspectionItemId === item.id);
                    return (
                      <div className="form-definition-item" key={item.id}>
                        <div><strong>{item.label}</strong><span>{formatEnum(item.fieldType)} · {item.required ? "Required" : "Optional"}{item.visibilityCondition ? ` · Conditional on ${item.visibilityCondition.sourceItemKey}` : ""}</span></div>
                        <div className="form-rule-summary">
                          {itemRules.length ? itemRules.map((rule) => <span className={`severity-chip severity-${rule.severity}`} key={rule.id}>{formatEnum(rule.severity)} → {formatEnum(rule.disposition)}{rule.blockDeparture ? " · Blocks" : ""}</span>) : <span className="policy-pill">No exception rule</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>}
        <aside className="panel version-history-card">
          <div><span className="eyebrow">VERSION HISTORY</span><h2>{template.code}</h2></div>
          {versions.map((version) => <Link className={version.id === template.id ? "version-history-row version-current" : "version-history-row"} href={`/settings/forms/${version.id}`} key={version.id}><span>Version {version.version}</span><strong>{formatEnum(version.status)}</strong></Link>)}
        </aside>
      </section>
      {draftIsEditable ? <section className="panel draft-danger-panel"><div><span className="eyebrow">DRAFT ADMINISTRATION</span><h2>Remove an unused draft</h2><p>Deletion is available only for an unpublished draft without assignments or inspection history. Published versions must be retired.</p></div><DeleteDraftTemplateButton templateId={template.id} code={template.code} recordVersion={template.recordVersion} /></section> : null}
    </div>
  );
}
