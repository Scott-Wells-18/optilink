import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** Start a power analysis at a site. The recording is uploaded afterwards. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string };
    if (!body.siteId) return badRequest("Which site is this for?");
    const run = await prisma.powerAnalysis.create({ data: { siteId: body.siteId } });
    return NextResponse.json(run);
  } catch (error) {
    return serverError(error, "That analysis could not be started.");
  }
}
