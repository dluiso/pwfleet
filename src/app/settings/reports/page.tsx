import { ReportSubscriptionManager } from "@/components/report-subscription-manager";
import { getEnvironment } from "@/lib/env";
import { getFleetReportOptions } from "@/modules/reports/fleet-report";
import { listReportSubscriptionData } from "@/modules/reports/subscriptions";

export default async function ReportSubscriptionsPage() {
  const [data, options] = await Promise.all([listReportSubscriptionData(), getFleetReportOptions()]);
  return <ReportSubscriptionManager {...data} options={options} timeZone={getEnvironment().APP_TIME_ZONE} />;
}
