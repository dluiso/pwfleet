import { getFleetOperationalReport, renderFleetReportCsv } from "@/modules/reports/fleet-report";
import { reportErrorResponse } from "@/modules/reports/api";
import { filtersFromSearchParams } from "@/modules/reports/validation";
import { requirePermission } from "@/lib/auth";
import { enforceActorRateLimit, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ipLimit = await enforceRateLimit(request, "report.export.csv", 20, 600);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit);
    const actor = await requirePermission("reports:read");
    const actorLimit = await enforceActorRateLimit(actor.id, "report.export.csv.actor", 20, 600);
    if (!actorLimit.allowed) return rateLimitResponse(actorLimit);
    const filters = filtersFromSearchParams(new URL(request.url).searchParams);
    const csv = renderFleetReportCsv(await getFleetOperationalReport(filters));
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="harvey-fleet-${filters.from}-to-${filters.to}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return reportErrorResponse(error); }
}
