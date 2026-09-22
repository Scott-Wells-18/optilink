import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Our own test gear: the instruments in the van, not anything at a client's
 * site. Flat and global, because a meter is a meter wherever it is taken.
 */
export async function GET() {
  const items = await prisma.testEquipment.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      certFile: { select: { id: true, originalName: true } },
      photoFile: { select: { id: true, originalName: true } },
    },
  });
  return NextResponse.json(items, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      name?: string;
      serialNo?: string;
      modelNo?: string;
      certFileId?: string;
      photoFileId?: string;
    };
    if (!body.name?.trim()) return badRequest("Give the equipment a name.");

    const item = await prisma.testEquipment.create({
      data: {
        name: body.name.trim().slice(0, 180),
        serialNo: body.serialNo?.trim().slice(0, 80) || null,
        modelNo: body.modelNo?.trim().slice(0, 80) || null,
        certFileId: body.certFileId || null,
        photoFileId: body.photoFileId || null,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    return serverError(error, "That could not be added.");
  }
}
