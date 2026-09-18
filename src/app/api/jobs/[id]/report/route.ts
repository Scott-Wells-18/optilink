import { NextResponse } from "next/server";
import { buildJobReport, loadJobReport } from "@/lib/report/ba";
import { notFound, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** The day's work as a PDF — what was found, what was done, and the photos. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await loadJobReport(id);
    if (!data) return notFound("That job could not be found.");

    const pdf = await buildJobReport(data);
    const name = `${data.clientName} - ${data.siteName} - works ${data.jobDate
      .toISOString()
      .slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(pdf.byteLength),
        "content-disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return serverError(error, "The report could not be built.");
  }
}
