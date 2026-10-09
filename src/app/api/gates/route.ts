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
      /** A saved gate to start from, instead of describing it again. */
      assetId?: string;
      serviceKind?: string;
    };
    if (!body.siteId) return badRequest("Which site is this gate at?");

    /*
     * A saved gate fills in what the gate is, and nothing else.
     *
     * The stable details are copied onto the report rather than read through
     * the relation, so editing the gate next year cannot change what this
     * report said. Nothing that was a finding is copied: no result, no
     * measurement, no defect, no signature, no outcome. A gate that passed
     * last year arrives at this visit with every box empty, because that is
     * what has been established about today.
     */
    const asset = body.assetId
      ? await prisma.gateAsset.findFirst({ where: { id: body.assetId, siteId: body.siteId } })
      : null;
    if (body.assetId && !asset) return badRequest("That saved gate could not be found at this site.");

    const kind = asset?.kind ?? (body.kind === "SLIDING" ? "SLIDING" : "BOOM");
    const date = new Date();
    const today = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );

    const report = await prisma.gateReport.create({
      data: {
        siteId: body.siteId,
        assetId: asset?.id ?? null,
        kind,
        gateLocation: asset?.gateLocation ?? body.gateLocation?.trim().slice(0, 200) ?? null,
        assetNumber: asset?.assetNumber ?? null,
        model: asset?.model ?? null,
        serialNumber: asset?.serialNumber ?? null,
        controllerModel: asset?.controllerModel ?? null,
        controllerFirmware: asset?.controllerFirmware ?? null,
        armLengthMetres: asset?.armLengthMetres ?? null,
        accessories: asset?.accessories ?? [],
        accessoryNotes: asset?.accessoryNotes ?? null,
        manualRef: asset?.manualRef ?? null,
        previousService: asset?.previousService ?? null,
        serviceKind:
          body.serviceKind === "BREAKDOWN" || body.serviceKind === "FOLLOW_UP"
            ? body.serviceKind
            : "SCHEDULED",
        date: today,
        nextServiceDue: yearAfter(today),
      },
    });
    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "That report could not be started.");
  }
}
