import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { yearAfter } from "@/lib/gates/form";

export const runtime = "nodejs";

/**
 * Starting a gate service report.
 *
 * One report per unit, so which gate it is matters from the first moment: a
 * second barrier on the same site is a second report, not a second page of the
 * first one. Everything else is filled in on site.
 *
 * The next service defaults to a year on from today, and is recalculated if
 * the service date moves — a default, not a rule, because a gate on a busy
 * loading dock or in salt air gets looked at more often than that.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      siteId?: string;
      kind?: string;
      gateLocation?: string;
    };
    if (!body.siteId) return badRequest("Which site is this gate at?");

    const kind = body.kind === "SLIDING" ? "SLIDING" : "BOOM";
    const date = new Date();
    const today = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );

    const report = await prisma.gateReport.create({
      data: {
        siteId: body.siteId,
        kind,
        gateLocation: body.gateLocation?.trim().slice(0, 200) || null,
        date: today,
        nextServiceDue: yearAfter(today),
      },
    });
    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "That report could not be started.");
  }
}
