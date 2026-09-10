import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { normaliseBoard } from "@/lib/board";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      siteId?: string;
      kind?: string;
      name?: string;
      description?: string;
      circuitLoading?: string;
      board?: unknown;
    };
    if (!body.siteId) return badRequest("Which site is this at?");
    if (!body.name?.trim()) return badRequest("A name is required.");

    const kind =
      body.kind === "SWITCHBOARD" || body.kind === "MOTOR" ? body.kind : "APPLIANCE";
    const isBoard = kind === "SWITCHBOARD";

    const equipment = await prisma.equipment.create({
      data: {
        siteId: body.siteId,
        kind,
        name: body.name.trim().slice(0, 180),
        description: isBoard ? null : body.description?.trim().slice(0, 4000) || null,
        circuitLoading:
          kind === "MOTOR" ? body.circuitLoading?.trim().slice(0, 80) || null : null,
        board: isBoard ? normaliseBoard(body.board) : undefined,
      },
    });
    return NextResponse.json(equipment);
  } catch (error) {
    return serverError(error, "That could not be added.");
  }
}
