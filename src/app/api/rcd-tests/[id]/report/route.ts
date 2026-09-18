import { NextResponse } from "next/server";
import { buildRcdReport, loadRcdReport } from "@/lib/report/rcd";
import { notFound, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** The test results as a PDF, with the instrument's own export bound in. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await loadRcdReport(id);
    if (!data) return notFound("That test could not be found.");

    const pdf = await buildRcdReport(data);
    const name = `${data.clientName} - ${data.boardName} - RCD ${data.testDate
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
