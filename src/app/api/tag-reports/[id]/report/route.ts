import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { badRequest, notFound, pdfResponse, serverError } from "@/lib/api";
import { COMPANY } from "@/lib/company";
import { preparedByFor } from "@/lib/profiles.server";
import { safe } from "@/lib/report/theme";
import { buildRegisterReport } from "@/lib/report/tagging";
import { itemsIn } from "@/lib/tagging/register";
import { itemsOf } from "@/lib/tagging/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The register, as a PDF.
 *
 * Drawn from the rows stored on the report, never from the spreadsheet they
 * came out of — so a report downloaded today and again next year is the same
 * report, whatever has happened to the reference file in between.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const report = await prisma.tagReport.findUnique({
      where: { id },
      include: {
        source: { select: { originalName: true } },
        site: {
          select: {
            name: true,
            location: true,
            client: { select: { name: true } },
          },
        },
      },
    });
    if (!report) return notFound("That report could not be found.");

    const all = itemsOf(report.items);
    if (all.length === 0) {
      return badRequest("There is no equipment on this report.");
    }

    // Where a customer and site have been chosen, only their equipment is on
    // the report. Where they have not — because the file held only one — every
    // row is, which is the same set.
    const items =
      report.customer && report.siteLabel
        ? itemsIn(all, { customer: report.customer, site: report.siteLabel })
        : all;
    if (items.length === 0) {
      return badRequest(
        "No equipment in this spreadsheet belongs to the customer and site chosen for it.",
      );
    }

    const pdf = await buildRegisterReport({
      kind: report.kind,
      clientName: safe(
        report.site?.client.name ?? report.customer ?? COMPANY.legalName,
      ),
      siteName: safe(report.site?.name ?? report.siteLabel ?? COMPANY.name),
      siteLocation: report.site?.location ? safe(report.site.location) : null,
      logo: await brandBytes("logo.jpg"),
      preparedBy: await preparedByFor(report.preparedBy),
      reportDate: report.date,
      customer: report.customer ? safe(report.customer) : null,
      site: report.siteLabel ? safe(report.siteLabel) : null,
      items,
      // The whole file's pairings, so the report can say that it lists one of
      // them rather than telling its reader to go and choose.
      pairingsInFile: new Set(all.map((item) => `${item.customer}\u0000${item.site}`)).size,
      sourceName: report.source?.originalName ? safe(report.source.originalName) : null,
      notes: report.notes.map(safe),
    });

    const when = report.date.toISOString().slice(0, 10);
    const who = report.kind === "CLIENT" ? report.customer || report.site?.client.name : COMPANY.name;
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    return pdfResponse(pdf, `Test & Tag - ${who} - ${when}.pdf`, { inline: preview });
  } catch (error) {
    return serverError(error, "That report could not be built.");
  }
}

async function brandBytes(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}
