import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { releaseFiles } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * The photographs taken on the visit.
 *
 * Sent whole rather than one at a time: the form knows what should be on the
 * report, and reconciling a list is less to get wrong than a series of adds
 * and removes. Anything that falls off is handed back, so a picture swapped
 * out does not sit on the volume for good.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      photos?: { fileId?: string; caption?: string }[];
    };
    if (!Array.isArray(body.photos)) return badRequest("No photographs were supplied.");

    const wanted = body.photos
      .filter((photo) => typeof photo?.fileId === "string" && photo.fileId)
      .slice(0, 24)
      .map((photo, position) => ({
        reportId: id,
        fileId: photo.fileId as string,
        caption: photo.caption?.trim().slice(0, 300) || null,
        position,
      }));

    const held = await prisma.gatePhoto.findMany({
      where: { reportId: id },
      select: { fileId: true },
    });

    await prisma.gatePhoto.deleteMany({ where: { reportId: id } });
    if (wanted.length > 0) await prisma.gatePhoto.createMany({ data: wanted });

    const kept = new Set(wanted.map((photo) => photo.fileId));
    await releaseFiles(
      held.map((photo) => photo.fileId).filter((fileId) => !kept.has(fileId)),
    );

    return NextResponse.json({ ok: true, count: wanted.length });
  } catch (error) {
    return serverError(error, "Those photographs could not be saved.");
  }
}
