import { AdminVehicleManager } from "@/components/admin-vehicle-manager";
import { VehicleClassManager } from "@/components/vehicle-class-manager";
import { can, getCurrentActor } from "@/lib/auth";
import {
  getAdministrationReferences,
  listAdministrationAssignments,
  listAdministrationVehicleClasses,
  listAdministrationVehicles,
} from "@/modules/administration/service";

export default async function VehicleAdministrationPage({ searchParams }: { searchParams: Promise<{ assign?: string; create?: string }> }) {
  const { assign, create } = await searchParams;
  const [vehicles, references, assignments, classes, actor] = await Promise.all([
    listAdministrationVehicles(),
    getAdministrationReferences(),
    listAdministrationAssignments(),
    listAdministrationVehicleClasses(),
    getCurrentActor(),
  ]);
  return (
    <div className="page-stack">
      <AdminVehicleManager
        vehicles={vehicles}
        classes={references.classes}
        templates={references.templates}
        assignments={assignments}
        initialAssignmentVehicleId={assign}
        initialCreateVehicle={create === "1"}
      />
      <VehicleClassManager classes={classes} mayManage={can(actor, "configuration:manage")} />
    </div>
  );
}
