import { AdminVehicleManager } from "@/components/admin-vehicle-manager";
import {
  getAdministrationReferences,
  listAdministrationAssignments,
  listAdministrationVehicles,
} from "@/modules/administration/service";

export default async function VehicleAdministrationPage() {
  const [vehicles, references, assignments] = await Promise.all([
    listAdministrationVehicles(),
    getAdministrationReferences(),
    listAdministrationAssignments(),
  ]);
  return (
    <AdminVehicleManager
      vehicles={vehicles}
      classes={references.classes}
      templates={references.templates}
      assignments={assignments}
    />
  );
}
