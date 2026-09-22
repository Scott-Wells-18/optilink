import { notFound, pdfResponse, serverError } from "@/lib/api";
import { buildPowerReport, loadPowerReport } from "@/lib/report/power";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await loadPowerReport(id);
    if (!data) return notFound("No recording has been loaded for this analysis yet.");
    const pdf = await buildPowerReport(data);
    const when = new Date(data.summary.from).toISOString().slice(0, 10);
    return pdfResponse(pdf, `Power Analysis - ${data.clientName} - ${when}.pdf`);
  } catch (error) {
    return serverError(error, "That report could not be built.");
  }
}
