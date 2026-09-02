import QRCode from "qrcode";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getEnvironment } from "@/lib/env";
import { getQrLabel } from "@/modules/fleet/repository";

const publicIdSchema = z.uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  await requirePermission("fleet:read");
  const parsedPublicId = publicIdSchema.safeParse((await context.params).publicId);
  if (!parsedPublicId.success) {
    return new Response("Invalid QR identifier.", { status: 400 });
  }

  const label = await getQrLabel(parsedPublicId.data);
  if (!label || label.qrStatus !== "active") {
    return new Response("QR label not found.", { status: 404 });
  }

  const scanUrl = new URL(`/scan/${label.publicId}`, getEnvironment().APP_BASE_URL).toString();
  const svg = await QRCode.toString(scanUrl, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: { dark: "#092f2a", light: "#ffffff" },
    width: 520,
  });

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...(download
        ? {
            "Content-Disposition": `attachment; filename="${label.displayCode ?? `unit-${label.unitNumber}`}-qr.svg"`,
          }
        : {}),
    },
  });
}

