import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, serverError } from "@/lib/api";
import { assetData, type AssetBody } from "@/lib/gates/assets";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Editing, archiving and duplicating one saved gate.
 *
 * Editing a gate changes what the *next* report starts from. It never reaches
 * back into a report already issued: the details are copied onto the report
 * when it is started, and that copy is what the report says for good. A
 * barrier re-armed with a longer boom next year does not retrospectively
 * change what was serviced this year.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as AssetBody & { archived?: boolean };
    const data: Record<string, unknown> = { ...assetData(body) };
    if (body.archived !== undefined) {
      data.archivedAt = body.archived ? new Date() : null;
    }
    const asset = await prisma.gateAsset.update({ where: { id }, data });
    return NextResponse.json(asset);
  } catch (error) {
    return serverError(error, "That gate could not be saved.");
  }
}

/** A second barrier like the first one: everything but its own identity. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const held = await prisma.gateAsset.findUnique({ where: { id } });
    if (!held) return NextResponse.json({ error: "That gate is gone." }, { status: 404 });

    const copy = await prisma.gateAsset.create({
      data: {
        siteId: held.siteId,
        kind: held.kind,
        model: held.model,
        controllerModel: held.controllerModel,
        controllerFirmware: held.controllerFirmware,
        armLengthMetres: held.armLengthMetres,
        accessories: held.accessories,
        accessoryNotes: held.accessoryNotes,
        manualRef: held.manualRef,
        // Not copied: what makes it a different gate, and what belongs to the
        // original's own service history.
        assetNumber: held.assetNumber ? `${held.assetNumber} (copy)` : null,
        gateLocation: held.gateLocation,
        previousService: null,
      },
    });
    return NextResponse.json(copy);
  } catch (error) {
    return serverError(error, "That gate could not be duplicated.");
  }
}

/**
 * Removing a gate outright, which is only allowed while nothing cites it.
 *
 * A gate with reports against it is archived instead: deleting it would take
 * the link between a report and the unit it was about, and a service history
 * that cannot say which barrier it is about is not a history.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const reports = await prisma.gateReport.count({ where: { assetId: id } });
    if (reports > 0) {
      await prisma.gateAsset.update({ where: { id }, data: { archivedAt: new Date() } });
      return NextResponse.json({ ok: true, archived: true, reports });
    }
    await prisma.gateAsset.delete({ where: { id } });
    return NextResponse.json({ ok: true, archived: false });
  } catch (error) {
    return serverError(error, "That gate could not be removed.");
  }
}
