import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** Start an amp reading report at a site. The recordings are added afterwards. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string };
    if (!body.siteId) return badRequest("Which site is this for?");
    const report = await prisma.ampReport.create({ data: { siteId: body.siteId } });
    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "That report could not be started.");
  }
}
