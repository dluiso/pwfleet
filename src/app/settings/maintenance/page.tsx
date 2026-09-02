import { MaintenancePolicyManager } from "@/components/maintenance-policy-manager";
import { listMaintenancePolicies } from "@/modules/maintenance/policy";

export default async function MaintenancePoliciesPage() {
  return <MaintenancePolicyManager policies={await listMaintenancePolicies()} />;
}
