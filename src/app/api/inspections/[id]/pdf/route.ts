import { renderInspectionPdf } from "@/modules/reports/inspection-pdf";
import {
  getInspectionReport,
  ReportNotFoundError,
} from "@/modules/reports/repository";
import { requirePermission } from "@/lib/auth";
import { enforceActorRateLimit, enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { ReportRenderCapacityError } from "@/modules/reports/render-admission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/inspections/[id]/pdf">) {
  const { id } = await context.params;
  try {
    const ipLimit = await enforceRateLimit(request, "report.inspection.pdf", 10, 600);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit);
    const actor = await requirePermission("reports:read");
    const actorLimit = await enforceActorRateLimit(actor.id, "report.inspection.pdf.actor", 10, 600);
    if (!actorLimit.allowed) return rateLimitResponse(actorLimit);
    const report = await getInspectionReport(id);
    const buffer = await renderInspectionPdf(report);
    const unit = (report.displayCode ?? `unit-${report.unitNumber}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-");

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${unit}-inspection-${report.id}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ReportNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ReportRenderCapacityError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
