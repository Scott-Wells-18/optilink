import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { expiry, readCalibration } from "@/lib/report/calibration";

export const runtime = "nodejs";
// Character recognition on a scanned certificate takes a few seconds.
export const maxDuration = 60;

/**
 * What a certificate says, read the moment it is filed.
 *
 * Done here and handed straight back to the dialog rather than quietly at
 * report time, for two reasons. A scanned certificate has to be put through
 * character recognition, which is slow enough that no report should wait on
 * it. And a date read off a scan is a reading, not a quotation: the person who
 * filed the certificate is looking at it, and is the one who should confirm
 * the machine got it right before it goes on a compliance document.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { fileId?: string };
    if (!body.fileId) return badRequest("Which certificate?");

    const file = await prisma.uploadedFile.findUnique({
      where: { id: body.fileId },
      select: { storedName: true, mimeType: true },
    });
    if (!file) return badRequest("That certificate is no longer on file.");
    if (file.mimeType !== "application/pdf") return badRequest("That is not a PDF.");

    const bytes = await readUpload(file.storedName).catch(() => null);
    if (!bytes) return badRequest("That certificate could not be opened.");

    const calibration = await readCalibration(bytes);
    const due = expiry(calibration);

    return NextResponse.json({
      serialNo: calibration.serialNo,
      modelNo: calibration.modelNo,
      calibratedOn: day(calibration.calibratedOn),
      // A certificate that states its own due date is quoted; one that does
      // not gets a year from the day it was calibrated, which is the usual
      // interval and is what the report would have worked out anyway.
      expiresOn: day(due?.at ?? null),
      expiryDerived: due?.derived ?? false,
    });
  } catch (error) {
    return serverError(error, "That certificate could not be read.");
  }
}

/** As a date input wants it. */
function day(at: Date | null): string | null {
  return at ? at.toISOString().slice(0, 10) : null;
}
