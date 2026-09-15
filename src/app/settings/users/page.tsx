import { AdminUserManager } from "@/components/admin-user-manager";
import { getCurrentActor } from "@/lib/auth";
import { listAdministrationUsers } from "@/modules/administration/service";
import { getRuntimeIntegrationModes } from "@/modules/integrations/settings";

export default async function UserAdministrationPage() {
  const [users, actor, integrations] = await Promise.all([listAdministrationUsers(), getCurrentActor(), getRuntimeIntegrationModes()]);
  return <AdminUserManager users={users} currentActorId={actor.id} currentActorRole={actor.role} authenticationMode={integrations.authenticationMode} />;
}
