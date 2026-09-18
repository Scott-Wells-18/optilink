import { loadReport } from "@/lib/report/data";
import { buildReport } from "@/lib/report/pdf";
import { notFound, pdfResponse, serverError } from "@/lib/api";

export const runtime = "nodejs";

/** The whole survey as a PDF, laid out the way the trade expects it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await loadReport(id);
    if (!data) return notFound("That inspection could not be found.");

    const pdf = await buildReport(data);
    const name = `${data.clientName} - ${data.siteName} - ${data.inspectionDate
      .toISOString()
      .slice(0, 10)}.pdf`;

    return pdfResponse(pdf, name);
  } catch (error) {
    return serverError(error, "The report could not be built.");
  }
}
