import { ArrowRight, FileCheck2, FileCog } from "lucide-react";
import Link from "next/link";
import { CreateInspectionFormButton } from "@/components/create-inspection-form-button";
import { formatEnum } from "@/lib/format";
import { getCurrentActor } from "@/lib/auth";
import { listAdministrationTemplates } from "@/modules/administration/service";

export default async function FormCatalogPage() {
  const [templates, actor] = await Promise.all([listAdministrationTemplates(), getCurrentActor()]);
  return (
    <div className="page-stack">
      <section className="page-heading-row">
        <div>
          <span className="eyebrow">FORM CONFIGURATION</span>
          <h1>Form catalog</h1>
          <p>Build forms, publish them when ready, and assign every published version to vehicles.</p>
        </div>
        {actor.role === "administrator" ? <CreateInspectionFormButton /> : null}
      </section>
      <article className="safety-callout safety-callout-wide">
        <FileCheck2 size={22} />
        <div><strong>Published means ready to assign</strong><p>Publication validates the saved structure, required attestation, and defect rules. No additional approval state blocks a published form from vehicle assignment.</p></div>
      </article>
      <section className="form-lifecycle-grid" aria-label="Form lifecycle">
        <article className="panel"><strong>1. Create and build</strong><span>Add sections, fields, choices, conditional visibility, and exception rules.</span></article>
        <article className="panel"><strong>2. Publish</strong><span>One action validates the form and makes the exact saved version assignable.</span></article>
        <article className="panel"><strong>3. Assign</strong><span>Link the published version from Fleet Administration or a vehicle profile.</span></article>
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
              <span className={`severity-chip ${template.status === "published" ? "severity-minor" : "severity-critical"}`}>{template.status === "published" ? "Ready to assign" : "Not published"}</span>
              <ArrowRight className="form-catalog-arrow" size={17} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
