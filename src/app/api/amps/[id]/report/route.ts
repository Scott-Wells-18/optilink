import { badRequest, notFound, pdfResponse, serverError } from "@/lib/api";
import { buildAmpReport, loadAmpReport } from "@/lib/report/amps";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The report, as a PDF.
 *
 * `?preview=1` hands back the same bytes to be shown rather than saved, so the
 * report can be read before it is sent to anybody.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const load = await loadAmpReport(id);
    // Something still to fill in is a different answer from something gone
    // wrong, and the person reading it can act on the first one.
    if (!load.ok) return load.missing ? badRequest(load.reason) : notFound(load.reason);

    const pdf = await buildAmpReport(load.report);
    const when = load.report.takenOn.toISOString().slice(0, 10);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    return pdfResponse(pdf, `Amp Readings - ${load.report.clientName} - ${when}.pdf`, {
      inline: preview,
    });
  } catch (error) {
    return serverError(error, "That report could not be built.");
  }
}
