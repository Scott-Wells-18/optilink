import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, serverError } from "@/lib/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as { boardName?: string };
    const count = await prisma.rcdTest.count({ where: { reportId: id } });
    const test = await prisma.rcdTest.create({
      data: {
        reportId: id,
        sortOrder: count,
        // Carry the board name down the list so a whole board can be entered quickly.
        boardName: body.boardName?.slice(0, 160) || null,
      },
    });
    return NextResponse.json(test);
  } catch (error) {
    return serverError(error, "The RCD test could not be added.");
  }
}
