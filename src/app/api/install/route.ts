import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { parseInstallExport } from "@/lib/install/parse";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Starting an installation report from a tester's export.
 *
 * The file is read now rather than at download time, so a file that cannot be
 * read is said so while the person who chose it is still looking at it, and
 * the rows are kept on the report so it says the same thing next year. The
 * export itself is kept and bound into the back of the report.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      siteId?: string;
      fileId?: string;
      phases?: string;
      name?: string;
    };
    if (!body.siteId) return badRequest("Which site is this installation at?");
    if (!body.fileId) return badRequest("Upload the tester's export for this report.");

    const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
    if (!file) return badRequest("That file could not be found.");

    let parsed;
    try {
      parsed = await parseInstallExport(await readUpload(file.storedName));
    } catch {
      return badRequest("That file could not be read as a tester export.");
    }

    if (parsed.rows.length === 0) {
      return badRequest(
        "No test records could be read out of that file. Check it is the tester's own PDF export.",
      );
    }

    const report = await prisma.installReport.create({
      data: {
        siteId: body.siteId,
        sourceId: file.id,
        phases: body.phases === "THREE" ? "THREE" : "SINGLE",
        name: body.name?.trim().slice(0, 180) || null,
        rows: JSON.parse(JSON.stringify(parsed.rows)),
        recordCount: parsed.rows.length,
        header: {
          title: parsed.title,
          siteName: parsed.siteName,
          boardNumber: parsed.boardNumber,
          circuitRange: parsed.circuitRange,
          company: parsed.company,
          createdAt: parsed.createdAt?.toISOString() ?? null,
          notes: parsed.notes,
        },
        pointNames: {},
        exclusions: [],
        circuits: {},
      },
    });

    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "That report could not be started.");
  }
}
