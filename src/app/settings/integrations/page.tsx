import { IntegrationSettingsManager } from "@/components/integration-settings-manager";
import { getIntegrationSettingsForAdministration } from "@/modules/integrations/settings";

export default async function IntegrationSettingsPage() {
  return <IntegrationSettingsManager initial={await getIntegrationSettingsForAdministration()} />;
}
