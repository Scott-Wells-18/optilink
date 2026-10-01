import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { JOB_KIND_LABELS, type JobKind } from "@/lib/jobs";

/**
 * Start a report at a site. Everything written up on it hangs off this.
 *
 * Which of the two it is, is decided here and not changed afterwards: a
 * completed record and a recommendation ask for different things, and a
 * report half-written as one and finished as the other would be missing
 * whichever half it switched away from.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      siteId?: string;
      name?: string;
      kind?: string;
    };
    if (!body.siteId) return badRequest("Which site is this work at?");

    const kind =
      body.kind && body.kind in JOB_KIND_LABELS ? (body.kind as JobKind) : "COMPLETED";

    const job = await prisma.job.create({
      data: {
        siteId: body.siteId,
        kind,
        name: body.name?.trim().slice(0, 180) || null,
      },
    });
    return NextResponse.json(job);
  } catch (error) {
    return serverError(error, "The job could not be started.");
  }
}
