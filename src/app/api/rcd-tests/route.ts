import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** Start a round of RCD testing at a site. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string };
    if (!body.siteId) return badRequest("Which site is being tested?");
    const run = await prisma.rcdTestRun.create({ data: { siteId: body.siteId } });
    return NextResponse.json(run);
  } catch (error) {
    return serverError(error, "The test could not be started.");
  }
}
