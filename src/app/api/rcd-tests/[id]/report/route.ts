import { buildRcdReport, loadRcdReport } from "@/lib/report/rcd";
import { notFound, pdfResponse, serverError } from "@/lib/api";

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

    return pdfResponse(pdf, name);
  } catch (error) {
    return serverError(error, "The report could not be built.");
  }
}
