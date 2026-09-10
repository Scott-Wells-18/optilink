import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { readTemperatures } from "@/lib/thermal/read";

export const runtime = "nodejs";
/** OCR is slow the first time, while the worker starts. */
export const maxDuration = 60;

/**
 * Reads the temperatures a camera burned into a thermal image, so the report
 * fills itself in. Whatever comes back is a suggestion — the dialog leaves
 * both fields editable.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { fileId?: string };
    if (!body.fileId) return badRequest("Which image should be read?");

    const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
    if (!file) return notFound("That image could not be found.");

    const bytes = await readUpload(file.storedName);
    const reading = await readTemperatures(bytes);

    return NextResponse.json(reading, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return serverError(error, "That image could not be read.");
  }
}
