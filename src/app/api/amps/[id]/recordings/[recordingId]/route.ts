import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, serverError } from "@/lib/api";
import { readDevice, readRating } from "@/lib/amps/store";

export const runtime = "nodejs";

/** Renaming a recording, or saying what protects the circuit it came off. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; recordingId: string }> },
) {
  const { id, recordingId } = await params;
  try {
    const body = (await readJson(request)) as {
      name?: string;
      rating?: number | string | null;
      device?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = body.name.trim().slice(0, 120);
      if (name) data.name = name;
    }
    if ("rating" in body) data.rating = readRating(body.rating);
    if ("device" in body) data.device = readDevice(body.device);

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    // Scoped to the report in the path, so an id from another report cannot be
    // edited through this one.
    const { count } = await prisma.ampRecording.updateMany({
      where: { id: recordingId, reportId: id },
      data,
    });
    return NextResponse.json({ ok: count > 0 });
  } catch (error) {
    return serverError(error, "That could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; recordingId: string }> },
) {
  const { id, recordingId } = await params;
  try {
    await prisma.ampRecording.deleteMany({ where: { id: recordingId, reportId: id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
