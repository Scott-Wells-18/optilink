import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { badRequest, notFound, pdfResponse, serverError } from "@/lib/api";
import { personName } from "@/lib/contacts";
import { preparedByFor } from "@/lib/profiles.server";
import { readUpload } from "@/lib/storage";
import { safe } from "@/lib/report/theme";
import { readCertificate } from "@/lib/report/certificate";
import { readInstrument } from "@/lib/report/instrument";
import { buildInstallReport, installFileName, type InstallReport } from "@/lib/report/install";
import { analyse } from "@/lib/install/session";
import { inputOf } from "@/lib/install/stored";

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
        instrument: { include: { certFile: true, photoFile: true } },
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

    const input = inputOf(report);
    if (input.files.every((file) => file.rows.length === 0)) {
      return badRequest("There are no tester records on this report yet.");
    }
    const analysis = analyse(input);

    /*
     * Each tester file, reproduced on our pages in the confirmed order and
     * attached whole. A file that will not open is left out of the
     * reproduction; its records are still in the report.
     */
    const ids = input.files.map((file) => file.fileId);
    const stored = await prisma.uploadedFile.findMany({ where: { id: { in: ids } } });
    const files = await Promise.all(
      input.files.map(async (file) => {
        const held = stored.find((candidate) => candidate.id === file.fileId);
        if (!held) return { ...file, pages: null, bytes: null };
        try {
          const bytes = await readUpload(held.storedName);
          return { ...file, pages: await readCertificate(bytes), bytes };
        } catch {
          return { ...file, pages: null, bytes: null };
        }
      }),
    );

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
      // The instrument itself, with its photograph and the certificate that
      // says it read true when it took these readings.
      instrument: await readInstrument(report.instrument),

      analysis,
      files,
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
