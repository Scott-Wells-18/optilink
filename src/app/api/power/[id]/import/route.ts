import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { midnight, readRecording, summarise } from "@/lib/power/parse";

export const runtime = "nodejs";

/**
 * Reads a logger's recording into an analysis.
 *
 * The file is kept as it came and the readings are re-read from it whenever
 * the report is drawn; what is stored here is only what the tree needs to
 * describe the row, and the date the recording actually started — which is the
 * date the analysis is filed under, rather than the day it was uploaded.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as { fileId?: string; location?: string };
    if (!body.fileId) return badRequest("No recording was supplied.");

    const run = await prisma.powerAnalysis.findUnique({ where: { id } });
    if (!run) return notFound("That analysis could not be found.");

    const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
    if (!file) return badRequest("That file could not be found.");

    const recording = readRecording(await readUpload(file.storedName), file.originalName);
    const summary = summarise(recording);
    if (!summary) {
      return badRequest(
        "No readings could be read out of that file. It needs a column of timestamps and a column per phase.",
      );
    }

    const updated = await prisma.powerAnalysis.update({
      where: { id },
      data: {
        sourceFileId: file.id,
        date: new Date(midnight(summary.from)),
        location: body.location?.slice(0, 200) || run.location,
        summary: JSON.parse(JSON.stringify(summary)),
      },
    });

    return NextResponse.json({ run: updated, summary, headings: recording.headings });
  } catch (error) {
    return serverError(error, "That recording could not be read.");
  }
}
