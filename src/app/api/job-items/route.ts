import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { isComplete, readJobPhotos, whatIsMissing, type JobPhotoInput } from "@/lib/jobs";

/**
 * One piece of work, arriving whole or arriving half-done.
 *
 * The photographs are taken with the board open and the writing up often
 * waits until the next morning, so this takes whatever there is: the pictures
 * on their own, a title and nothing else, or the lot. What is short is worked
 * out from what arrived and handed back, and the work sits in the report
 * marked unfinished until somebody fills the rest in.
 *
 * The one thing it will not take is nothing at all. A record with no words
 * and no pictures is not a piece of work, it is an empty row.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      jobId?: string;
      title?: string;
      location?: string;
      found?: string;
      done?: string;
      photos?: JobPhotoInput[];
    };

    if (!body.jobId) return badRequest("Which job is this for?");

    const photos = readJobPhotos(body.photos);
    const fields = {
      title: body.title?.trim().slice(0, 200) ?? "",
      location: body.location?.trim().slice(0, 200) ?? "",
      found: body.found?.trim().slice(0, 2000) ?? "",
      done: body.done?.trim().slice(0, 2000) ?? "",
    };

    const anything = photos.length > 0 || Object.values(fields).some(Boolean);
    if (!anything) return badRequest("There is nothing here to save yet.");

    const last = await prisma.jobItem.findFirst({
      where: { jobId: body.jobId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const item = await prisma.jobItem.create({
      data: {
        jobId: body.jobId,
        ...fields,
        position: (last?.position ?? -1) + 1,
        photos: { create: photos },
      },
      select: { id: true },
    });

    const parts = { ...fields, photos };
    return NextResponse.json({
      id: item.id,
      complete: isComplete(parts),
      missing: whatIsMissing(parts),
    });
  } catch (error) {
    return serverError(error, "That work could not be saved.");
  }
}
