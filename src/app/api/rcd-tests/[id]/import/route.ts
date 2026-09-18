import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { normaliseBoard } from "@/lib/board";
import { parseRcdExport } from "@/lib/rcd/parse";
import { crossCheck } from "@/lib/rcd/map";

export const runtime = "nodejs";

/**
 * Reads the instrument's export and says what it made of it — including
 * anything that disagrees with the site it is being filed under. Nothing is
 * rejected here: the operator decides whether a disagreement matters.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as { fileId?: string; equipmentId?: string };
    if (!body.fileId) return badRequest("No file was supplied.");

    const run = await prisma.rcdTestRun.findUnique({
      where: { id },
      include: { site: { select: { name: true } } },
    });
    if (!run) return notFound("That test could not be found.");

    const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
    if (!file) return badRequest("That file could not be found.");

    const parsed = await parseRcdExport(await readUpload(file.storedName));

    const equipment = body.equipmentId
      ? await prisma.equipment.findUnique({
          where: { id: body.equipmentId },
          select: { name: true, board: true },
        })
      : null;
    const board = equipment ? normaliseBoard(equipment.board) : null;
    const ways = board
      ? board.sections.reduce((total, section) => total + section.cells.length, 0)
      : 0;

    const mismatches = crossCheck(
      parsed,
      { name: run.site.name },
      equipment ? { name: equipment.name, ways } : null,
    );

    await prisma.rcdTestRun.update({
      where: { id },
      data: {
        sourceFileId: file.id,
        equipmentId: body.equipmentId || null,
        parsed: JSON.parse(JSON.stringify(parsed)),
      },
    });

    return NextResponse.json({ parsed, mismatches });
  } catch (error) {
    return serverError(error, "That export could not be read.");
  }
}
