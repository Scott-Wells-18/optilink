import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Turning a recommendation into the record of having done it.
 *
 * A rectification report is what we proposed; once the quotation is accepted
 * and the work is carried out, the works completed report covers the same
 * jobs, at the same place, with the same photographs — of how it was found.
 * Typing all of that again is how a job ends up written up twice differently.
 *
 * So this copies it across:
 *
 *  - every job becomes a piece of work with the same name and number;
 *  - its photographs become the BEFORE photographs, which is what they are:
 *    pictures of the equipment as it stood before anybody touched it;
 *  - the job description becomes what was done, as a starting point — it says
 *    what we proposed, which is usually close to what was carried out.
 *
 * What it does NOT do is call any of it finished. Where it was, how it was
 * found and a photograph of how it was left are all still blank, so every
 * piece of work comes across marked unfinished and says what it is short of.
 * The original is untouched: the recommendation is still a recommendation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request).catch(() => ({}))) as { name?: string };
    const source = await prisma.job.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { photos: { orderBy: [{ stage: "asc" }, { position: "asc" }] } },
        },
      },
    });
    if (!source) return notFound("That report could not be found.");
    if (source.kind !== "RECTIFICATION") {
      return badRequest("Only a recommended rectifications report can be converted.");
    }

    const copy = await prisma.job.create({
      data: {
        siteId: source.siteId,
        kind: "COMPLETED",
        // Whatever it was called on the way in. Falling back to the
        // recommendation's own name keeps the pair findable together in a
        // list of a year's reports.
        name:
          body.name?.trim().slice(0, 180) ||
          `${source.name?.trim() || "Rectifications"} — works completed`,
        contactId: source.contactId,
        preparedBy: source.preparedBy,
        recommendations: [],
        items: {
          create: source.items.map((item, position) => ({
            title: item.title,
            number: item.number,
            // Where it was and how it was found are not on a recommendation,
            // so they come across empty and the work reads as unfinished.
            location: "",
            found: "",
            // What we proposed, as a starting point for what was carried out —
            // with its dot points and emphasis, not flattened on the way over.
            done: item.done,
            doneRich: item.doneRich ?? undefined,
            position,
            photos: {
              create: item.photos
                // A recommendation photographs one thing: the job as it
                // stands. That is the before photo of the work that follows.
                .filter((photo) => photo.stage === "BEFORE")
                .map((photo, at) => ({
                  stage: "BEFORE" as const,
                  fileId: photo.fileId,
                  position: at,
                })),
            },
          })),
        },
      },
      select: { id: true, name: true, _count: { select: { items: true } } },
    });

    return NextResponse.json(copy);
  } catch (error) {
    return serverError(error, "That report could not be converted.");
  }
}
