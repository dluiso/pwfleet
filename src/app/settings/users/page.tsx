import { AdminUserManager } from "@/components/admin-user-manager";
import { getCurrentActor } from "@/lib/auth";
import { listAdministrationUsers } from "@/modules/administration/service";

export default async function UserAdministrationPage() {
  const [users, actor] = await Promise.all([listAdministrationUsers(), getCurrentActor()]);
  return <AdminUserManager users={users} currentActorId={actor.id} />;
}
