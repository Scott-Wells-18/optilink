import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { readAmpRecording } from "@/lib/amps/parse";
import { readDevice, readPhase, readRating, storedSummary } from "@/lib/amps/store";

export const runtime = "nodejs";

/**
 * Adds one named recording to a report.
 *
 * The file is read straight away rather than at download time, so a file that
 * cannot be read is said so while the person who chose it is still looking at
 * it — and so the count, the period and the highest reading can be shown back
 * to them before anything is issued. Whatever could not be read is kept with
 * it, word for word, and travels through to the report.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      fileId?: string;
      name?: string;
      rating?: number | string | null;
      device?: string | null;
      phase?: string | null;
    };
    if (!body.fileId) return badRequest("No recording was supplied.");

    const report = await prisma.ampReport.findUnique({ where: { id } });
    if (!report) return notFound("That report could not be found.");

    const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
    if (!file) return badRequest("That file could not be found.");

    const reading = readAmpRecording(await readUpload(file.storedName), file.originalName);
    const summary = storedSummary(reading);
    if (!summary) {
      return badRequest(
        reading.notes[0] ??
          "No readings could be read out of that file. It needs a column of times and a column of current.",
      );
    }

    const last = await prisma.ampRecording.findFirst({
      where: { reportId: id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    // The first recording dates the report. A meter that writes the date into
    // its file knows when the readings were taken better than the day somebody
    // got around to uploading them does; a later recording does not move it,
    // because by then the date may have been set by hand.
    if (last === null && summary.dated) {
      await prisma.ampReport.update({
        where: { id },
        data: { date: new Date(Math.floor(summary.from / 86_400_000) * 86_400_000) },
      });
    }

    const recording = await prisma.ampRecording.create({
      data: {
        reportId: id,
        fileId: file.id,
        // A recording without a name of its own is still a recording; it is
        // named after the file it came out of until it is given one.
        name: body.name?.trim().slice(0, 120) || stem(file.originalName),
        rating: readRating(body.rating),
        device: readDevice(body.device),
        phase: readPhase(body.phase),
        position: (last?.position ?? -1) + 1,
        summary: JSON.parse(JSON.stringify(summary)),
      },
      include: { file: { select: { id: true, originalName: true } } },
    });

    return NextResponse.json({ recording, summary });
  } catch (error) {
    return serverError(error, "That recording could not be read.");
  }
}

/** The file's name without its extension, for a recording nobody named. */
function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "").slice(0, 120) || "Recording";
}
