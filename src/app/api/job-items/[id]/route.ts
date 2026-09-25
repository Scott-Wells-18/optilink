import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { isComplete, readJobPhotos, whatIsMissing, type JobPhotoInput } from "@/lib/jobs";
import { releaseFiles } from "@/lib/storage";

/** Everything a piece of work holds, for finishing one off later. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.jobItem.findUnique({
    where: { id },
    select: {
      id: true,
      jobId: true,
      title: true,
      location: true,
      found: true,
      done: true,
      photos: {
        orderBy: [{ stage: "asc" }, { position: "asc" }],
        select: { stage: true, fileId: true },
      },
      job: { select: { name: true, date: true } },
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...item,
    complete: isComplete(item),
    missing: whatIsMissing(item),
  });
}

/**
 * Finishing a piece of work off, or changing one.
 *
 * The photographs are sent whole rather than one at a time: the dialog knows
 * what should be on the item, and reconciling a list is less to get wrong
 * than a series of adds and removes. Anything that falls off the list is
 * handed back, so a picture swapped out does not sit on the volume for good.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      title?: string;
      location?: string;
      found?: string;
      done?: string;
      photos?: JobPhotoInput[];
    };

    const existing = await prisma.jobItem.findUnique({
      where: { id },
      select: {
        title: true,
        location: true,
        found: true,
        done: true,
        photos: { select: { fileId: true } },
      },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, string> = {};
    const limits = { title: 200, location: 200, found: 2000, done: 2000 } as const;
    for (const key of ["title", "location", "found", "done"] as const) {
      if (key in body) data[key] = body[key]?.trim().slice(0, limits[key]) ?? "";
    }

    const photos = "photos" in body ? readJobPhotos(body.photos) : null;
    if (photos) {
      await prisma.jobPhoto.deleteMany({ where: { itemId: id } });
      await prisma.jobPhoto.createMany({
        data: photos.map((photo) => ({ ...photo, itemId: id })),
      });
    }

    const item = await prisma.jobItem.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        location: true,
        found: true,
        done: true,
        photos: { select: { stage: true } },
      },
    });

    // Whatever is no longer on the item, and nothing else points at.
    if (photos) {
      const kept = new Set(photos.map((photo) => photo.fileId));
      await releaseFiles(
        existing.photos.map((photo) => photo.fileId).filter((fileId) => !kept.has(fileId)),
      );
    }

    const anything =
      item.photos.length > 0 ||
      [item.title, item.location, item.found, item.done].some((value) => value.trim());
    if (!anything) return badRequest("There is nothing left on this piece of work.");

    return NextResponse.json({
      id: item.id,
      complete: isComplete(item),
      missing: whatIsMissing(item),
    });
  } catch (error) {
    return serverError(error, "Those changes could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const photos = await prisma.jobPhoto.findMany({
      where: { itemId: id },
      select: { fileId: true },
    });
    await prisma.jobItem.delete({ where: { id } });
    await releaseFiles(photos.map((photo) => photo.fileId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That work could not be removed.");
  }
}
