import { ArrowRight, FileCog, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { CreateInspectionFormButton } from "@/components/create-inspection-form-button";
import { formatEnum } from "@/lib/format";
import { getCurrentActor } from "@/lib/auth";
import { listAdministrationTemplates } from "@/modules/administration/service";

export default async function FormCatalogPage() {
  const [templates, actor] = await Promise.all([listAdministrationTemplates(), getCurrentActor()]);
  const unavailableCount = templates.filter((template) => template.status === "published" && template.ruleSetStatus !== "approved").length;
  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <span className="eyebrow">FORM CONFIGURATION</span>
          <h1>Form catalog</h1>
          <p>Review immutable published forms, draft successors, and pending approval rounds.</p>
        </div>
        {actor.role === "administrator" ? <CreateInspectionFormButton /> : null}
      </section>
      {unavailableCount ? <article className="safety-callout safety-callout-wide">
        <ShieldAlert size={22} />
        <div><strong>{unavailableCount} published {unavailableCount === 1 ? "version is" : "versions are"} not assignable</strong><p>These legacy versions contain draft safety rules. Open each version, create its successor draft, complete Operations and Governance review, then publish it. Only that approved successor can be assigned to vehicles.</p></div>
      </article> : null}
      <section className="form-lifecycle-grid" aria-label="Form lifecycle">
        <article className="panel"><strong>1. Create</strong><span>Start an empty form family with its own permanent code.</span></article>
        <article className="panel"><strong>2. Build</strong><span>Add sections, fields, choices, conditional visibility, and exception rules.</span></article>
        <article className="panel"><strong>3. Review and publish</strong><span>Operations and governance approve the exact saved version.</span></article>
        <article className="panel"><strong>4. Assign</strong><span>Link the published version to any compatible vehicle from Fleet Administration.</span></article>
      </section>
      <section className="panel records-panel">
        <div className="panel-header"><div><span className="eyebrow">TEMPLATES</span><h2>All form versions</h2></div></div>
        <div className="records-list">
          {templates.length === 0 ? <div className="inline-empty"><span>No forms configured</span><p>Create the first draft to begin building the inspection catalog.</p></div> : null}
          {templates.map((template) => (
            <Link className="record-row form-catalog-row" href={`/settings/forms/${template.id}`} key={template.id}>
              <div className="record-icon"><FileCog size={18} /></div>
              <div className="record-main"><strong>{template.name}</strong><span>{template.code} · Version {template.version} · {template.itemCount} fields</span></div>
              <span className={`workflow-status workflow-status-${template.status === "draft" ? template.reviewStatus : template.status}`}>{formatEnum(template.status === "draft" ? template.reviewStatus : template.status)}</span>
              <span className={`severity-chip ${template.status === "published" && template.ruleSetStatus === "approved" ? "severity-minor" : "severity-critical"}`}>{template.status === "published" && template.ruleSetStatus === "approved" ? "Assignable" : "Not assignable"}</span>
              <ArrowRight className="form-catalog-arrow" size={17} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
