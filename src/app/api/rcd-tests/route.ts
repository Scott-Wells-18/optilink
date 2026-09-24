import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** Add one switchboard's test to a report. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string; reportId?: string };
    if (!body.siteId) return badRequest("Which site is being tested?");
    const run = await prisma.rcdTestRun.create({
      data: { siteId: body.siteId, reportId: body.reportId ?? null },
    });
    return NextResponse.json(run);
  } catch (error) {
    return serverError(error, "The test could not be started.");
  }
}
