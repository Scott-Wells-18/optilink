import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      siteId?: string;
      name?: string;
      description?: string;
    };
    if (!body.siteId) return badRequest("Which site is this equipment at?");
    if (!body.name?.trim()) return badRequest("A name is required.");

    const equipment = await prisma.equipment.create({
      data: {
        siteId: body.siteId,
        name: body.name.trim().slice(0, 180),
        description: body.description?.trim().slice(0, 4000) || null,
      },
    });
    return NextResponse.json(equipment);
  } catch (error) {
    return serverError(error, "That equipment could not be added.");
  }
}
