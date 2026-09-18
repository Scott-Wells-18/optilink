import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** Start a day's work at a site. Everything done on the day hangs off this. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string; name?: string };
    if (!body.siteId) return badRequest("Which site is this work at?");

    const job = await prisma.job.create({
      data: { siteId: body.siteId, name: body.name?.trim().slice(0, 180) || null },
    });
    return NextResponse.json(job);
  } catch (error) {
    return serverError(error, "The job could not be started.");
  }
}
