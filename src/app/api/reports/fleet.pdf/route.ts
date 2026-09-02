import { getFleetOperationalReport } from "@/modules/reports/fleet-report";
import { renderFleetOperationalPdf } from "@/modules/reports/fleet-report-pdf";
import { reportErrorResponse } from "@/modules/reports/api";
import { filtersFromSearchParams } from "@/modules/reports/validation";
import { requirePermission } from "@/lib/auth";
import { enforceActorRateLimit, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ipLimit = await enforceRateLimit(request, "report.export.pdf", 10, 600);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit);
    const actor = await requirePermission("reports:read");
    const actorLimit = await enforceActorRateLimit(actor.id, "report.export.pdf.actor", 10, 600);
    if (!actorLimit.allowed) return rateLimitResponse(actorLimit);
    const filters = filtersFromSearchParams(new URL(request.url).searchParams);
    const buffer = await renderFleetOperationalPdf(await getFleetOperationalReport(filters));
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="harvey-fleet-${filters.from}-to-${filters.to}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return reportErrorResponse(error); }
}
