import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Start a report for a visit. The boards tested on it are added to it one at
 * a time, the way a before-and-after report collects its items.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string };
    if (!body.siteId) return badRequest("Which site is being tested?");
    const report = await prisma.rcdReport.create({ data: { siteId: body.siteId } });
    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "The report could not be started.");
  }
}
