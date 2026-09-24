import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notFound, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await prisma.rcdReport.findUnique({
    where: { id },
    include: {
      instrument: { select: { id: true, name: true, modelNo: true, serialNo: true } },
      tests: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          date: true,
          sourceFileId: true,
          equipment: { select: { id: true, name: true } },
          _count: { select: { results: true } },
        },
      },
    },
  });
  if (!report) return notFound("That report could not be found.");
  return NextResponse.json(report);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      name?: string;
      date?: string;
      instrumentId?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name?.slice(0, 200) || null;
    if ("instrumentId" in body) data.instrumentId = body.instrumentId || null;
    if (body.date) {
      const when = new Date(`${body.date}T00:00:00Z`);
      if (!Number.isNaN(when.getTime())) data.date = when;
    }
    const report = await prisma.rcdReport.update({ where: { id }, data });
    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "That could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.rcdReport.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
