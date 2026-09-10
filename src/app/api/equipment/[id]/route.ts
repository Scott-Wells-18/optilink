import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, serverError } from "@/lib/api";
import { normaliseBoard } from "@/lib/board";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      name?: string;
      description?: string;
      board?: unknown;
    };

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim().slice(0, 180);
    }
    if ("description" in body) {
      data.description = body.description?.trim().slice(0, 4000) || null;
    }
    if ("board" in body) {
      data.board = normaliseBoard(body.board);
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    await prisma.equipment.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "Those changes could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.equipment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
