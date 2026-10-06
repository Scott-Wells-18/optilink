import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { badRequest, notFound, pdfResponse, serverError } from "@/lib/api";
import { personName } from "@/lib/contacts";
import { preparedByFor } from "@/lib/profiles.server";
import { readUpload } from "@/lib/storage";
import { safe } from "@/lib/report/theme";
import { buildInstallReport, installFileName, type InstallReport } from "@/lib/report/install";
import type { InstallRow } from "@/lib/install/parse";
import { anomaliesOf, groupPoints, kept, type Exclusion } from "@/lib/install/points";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const report = await prisma.installReport.findUnique({
      where: { id },
      include: {
        source: true,
        contact: { select: { name: true } },
        instrument: { select: { name: true, modelNo: true, serialNo: true } },
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

    const allRows = Array.isArray(report.rows) ? (report.rows as unknown as InstallRow[]) : [];
    if (allRows.length === 0) {
      return badRequest("There are no test records on this report.");
    }

    const exclusions = Array.isArray(report.exclusions)
      ? (report.exclusions as unknown as Exclusion[])
      : [];
    const names = (report.pointNames ?? {}) as Record<string, string>;
    const circuits = (report.circuits ?? {}) as Record<string, string>;

    const rows = kept(allRows, exclusions);
    const grouping = groupPoints(rows, names);

    // The instrument's export, bound into the back and attached.
    let original: Buffer | null = null;
    if (report.source) {
      try {
        original = await readUpload(report.source.storedName);
      } catch {
        // A report without the original is still a report.
      }
    }

    const header = (report.header ?? {}) as {
      title?: string | null;
      siteName?: string | null;
      boardNumber?: string | null;
      circuitRange?: string | null;
      createdAt?: string | null;
      notes?: string[];
    };

    const data: InstallReport = {
      clientName: safe(report.site.client.name),
      siteName: safe(report.site.name),
      siteLocation: report.site.location ? safe(report.site.location) : null,
      logo: await brandBytes("logo.jpg"),
      preparedBy: await preparedByFor(report.preparedBy),

      reportDate: new Date(),
      testedOn: report.date,
      phases: report.phases,
      installation: report.installation ? safe(report.installation) : null,
      circuitDetails: report.circuitDetails ? safe(report.circuitDetails) : null,
      contactName: report.contact ? safe(personName(report.contact.name)) : null,
      instrumentName: report.instrument
        ? safe(
            [report.instrument.name, report.instrument.serialNo ? `S/N ${report.instrument.serialNo}` : null]
              .filter(Boolean)
              .join("  ·  "),
          )
        : null,

      allRows,
      rows,
      points: grouping.points,
      stray: grouping.stray,
      exclusions,
      anomalies: anomaliesOf(rows, grouping, report.phases),
      circuits,

      header: {
        title: header.title ?? null,
        siteName: header.siteName ?? null,
        boardNumber: header.boardNumber ?? null,
        circuitRange: header.circuitRange ?? null,
        notes: header.notes ?? [],
      },

      original,
      originalName: report.source?.originalName ?? null,
    };

    const pdf = await buildInstallReport(data);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    return pdfResponse(pdf, installFileName(data), { inline: preview });
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
