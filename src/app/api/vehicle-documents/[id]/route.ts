import { administrativeErrorResponse } from "@/lib/admin-api";
import { readVehicleDocument } from "@/modules/fleet/vehicle-documents";

function disposition(name: string): string {
  const safe = name.replace(/[\r\n"\\]/g, "_").slice(0, 180);
  return `inline; filename="${safe}"`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const document = await readVehicleDocument(id);
    return new Response(document.bytes, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": disposition(document.originalName),
        "Content-Type": document.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return administrativeErrorResponse(error);
  }
}
