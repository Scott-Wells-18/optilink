import { badRequest, notFound, pdfResponse, serverError } from "@/lib/api";
import { buildPowerReport, loadPowerReport } from "@/lib/report/power";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const load = await loadPowerReport(id);
    // Something still to fill in is a different answer from something gone
    // wrong, and the person reading it can act on the first one.
    if (!load.ok) return load.missing ? badRequest(load.reason) : notFound(load.reason);

    const pdf = await buildPowerReport(load.report);
    const when = new Date(load.report.summary.from).toISOString().slice(0, 10);
    return pdfResponse(pdf, `Power Analysis - ${load.report.clientName} - ${when}.pdf`);
  } catch (error) {
    return serverError(error, "That report could not be built.");
  }
}
