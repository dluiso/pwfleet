import { notFound } from "next/navigation";
import { InspectionForm } from "@/components/inspection-form";
import { getTemplateDefinition, getVehicleById } from "@/modules/fleet/repository";
import { vehicleLabel } from "@/lib/format";

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; templateId?: string; qrCodeId?: string }>;
}) {
  const query = await searchParams;
  if (!query.vehicleId || !query.templateId) notFound();
  const [vehicle, template] = await Promise.all([
    getVehicleById(query.vehicleId),
    getTemplateDefinition(query.templateId),
  ]);
  if (!vehicle || !template) notFound();
  if (!vehicle.assignments.some((assignment) => assignment.templateId === template.id)) notFound();

  return (
    <InspectionForm
      vehicle={{
        id: vehicle.id,
        label: vehicleLabel(vehicle),
        description: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
        disposition: vehicle.disposition,
        currentOdometer: vehicle.currentOdometer,
      }}
      template={{
        id: template.id,
        name: template.name,
        version: template.version,
        ruleSetStatus: template.ruleSetStatus,
        sections: template.sections.map((section) => ({
          id: section.id,
          title: section.title,
          description: section.description,
          items: section.items.map((item) => ({
            id: item.id,
            itemKey: item.itemKey,
            label: item.label,
            helpText: item.helpText,
            fieldType: item.fieldType,
            required: item.required,
            options: item.options ?? null,
            visibilityCondition: item.visibilityCondition ?? null,
          })),
        })),
        rules: template.rules.map((rule) => ({
          itemId: rule.itemId,
          whenResponse: rule.whenResponse,
          severity: rule.severity,
          blockDeparture: rule.blockDeparture,
          requireComment: rule.requireComment,
          requirePhoto: rule.requirePhoto,
        })),
      }}
      qrCodeId={query.qrCodeId}
    />
  );
}
