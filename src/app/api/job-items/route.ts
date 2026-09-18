import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readJobPhotos, type JobPhotoInput } from "@/lib/jobs";

/**
 * One piece of work, arriving whole: what was found, what was done, and every
 * photo of it. The photos are uploaded first, so all that lands here are ids.
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
    for (const [key, label] of [
      ["title", "a title"],
      ["location", "a location"],
      ["found", "what you found"],
      ["done", "what you did"],
    ] as const) {
      if (!body[key]?.trim()) return badRequest(`This needs ${label}.`);
    }

    const photos = readJobPhotos(body.photos);
    if (!photos.some((photo) => photo.stage === "BEFORE")) {
      return badRequest("A before photo is required.");
    }
    if (!photos.some((photo) => photo.stage === "AFTER")) {
      return badRequest("An after photo is required.");
    }

    const last = await prisma.jobItem.findFirst({
      where: { jobId: body.jobId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const item = await prisma.jobItem.create({
      data: {
        jobId: body.jobId,
        title: body.title!.trim().slice(0, 200),
        location: body.location!.trim().slice(0, 200),
        found: body.found!.trim().slice(0, 2000),
        done: body.done!.trim().slice(0, 2000),
        position: (last?.position ?? -1) + 1,
        photos: { create: photos },
      },
      select: { id: true },
    });
    return NextResponse.json(item);
  } catch (error) {
    return serverError(error, "That work could not be saved.");
  }
}
