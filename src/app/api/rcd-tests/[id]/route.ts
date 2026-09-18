import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";

/** Everything the wizard collects, saved a step at a time. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      date?: string;
      equipmentId?: string | null;
      corrections?: unknown;
      checklist?: unknown;
      mismatches?: string[];
    };

    const data: Record<string, unknown> = {};
    if (body.date) {
      const date = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return badRequest("That date could not be read.");
      data.date = date;
    }
    if ("equipmentId" in body) data.equipmentId = body.equipmentId || null;
    if ("corrections" in body) data.corrections = body.corrections ?? undefined;
    if ("checklist" in body) data.checklist = body.checklist ?? undefined;
    if (body.mismatches) data.mismatches = body.mismatches.slice(0, 20);
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    await prisma.rcdTestRun.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "Those changes could not be saved.");
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await prisma.rcdTestRun.findUnique({
    where: { id },
    include: {
      equipment: { select: { id: true, name: true, board: true } },
      site: {
        select: {
          id: true,
          name: true,
          equipment: {
            where: { kind: "SWITCHBOARD" },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, board: true },
          },
        },
      },
      results: { orderBy: { position: "asc" } },
    },
  });
  if (!run) return notFound("That test could not be found.");
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.rcdTestRun.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The test could not be removed.");
  }
}
