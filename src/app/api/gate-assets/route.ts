import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { assetData, type AssetBody } from "@/lib/gates/assets";

export const runtime = "nodejs";

/**
 * The gates at a site, saved so they are described once.
 *
 * A barrier is serviced every year by somebody who should not have to retype
 * its serial number, its controller and everything bolted to it each time.
 * What is saved is the stable half of the report; nothing that was only true
 * on one day is here, and nothing saved here is ever presented as a result.
 */

/** The gates at a site. Archived ones only when asked for by name. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId");
    if (!siteId) return badRequest("Which site?");
    const archived = url.searchParams.get("archived") === "1";

    const assets = await prisma.gateAsset.findMany({
      where: { siteId, ...(archived ? {} : { archivedAt: null }) },
      orderBy: [{ assetNumber: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(assets);
  } catch (error) {
    return serverError(error, "Those gates could not be read.");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as AssetBody;
    if (!body.siteId) return badRequest("Which site is this gate at?");

    const data = assetData(body);
    if (!data.assetNumber && !data.gateLocation) {
      return badRequest("Give the gate an asset number or a location, so it can be told apart.");
    }

    const asset = await prisma.gateAsset.create({ data: { siteId: body.siteId, ...data } });
    return NextResponse.json(asset);
  } catch (error) {
    return serverError(error, "That gate could not be saved.");
  }
}
