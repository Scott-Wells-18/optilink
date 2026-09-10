import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      equipmentId?: string;
      slot?: string;
      fileId?: string;
      caption?: string;
    };
    if (!body.equipmentId || !body.slot) return badRequest("Which position is this for?");
    if (!body.fileId) return badRequest("No image was supplied.");

    const photo = await prisma.boardPhoto.create({
      data: {
        equipmentId: body.equipmentId,
        slot: body.slot.slice(0, 40),
        fileId: body.fileId,
        caption: body.caption?.trim().slice(0, 400) || null,
      },
    });
    return NextResponse.json(photo);
  } catch (error) {
    return serverError(error, "The photo could not be saved.");
  }
}
