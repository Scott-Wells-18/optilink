import { buildRcdReport, loadRcdReport } from "@/lib/report/rcd";
import { badRequest, notFound, pdfResponse, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The visit's results as a PDF, with each board's own export bound in. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await loadRcdReport(id);
    if (!data) return notFound("That report could not be found.");
    if (data.boards.length === 0) {
      return badRequest("No switchboards have been tested on this report yet.");
    }

    const pdf = await buildRcdReport(data);
    const when = data.boards
      .map((board) => board.testDate)
      .reduce((held, at) => (at < held ? at : held))
      .toISOString()
      .slice(0, 10);

    return pdfResponse(pdf, `${data.clientName} - RCD ${when}.pdf`);
  } catch (error) {
    return serverError(error, "The report could not be built.");
  }
}
