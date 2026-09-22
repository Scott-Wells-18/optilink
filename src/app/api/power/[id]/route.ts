import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notFound, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await prisma.powerAnalysis.findUnique({
    where: { id },
    include: {
      sourceFile: { select: { id: true, originalName: true } },
      site: { select: { name: true, location: true } },
    },
  });
  if (!run) return notFound("That analysis could not be found.");
  return NextResponse.json(run);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      name?: string;
      location?: string;
      date?: string;
    };
    const data: Record<string, unknown> = {};
    for (const key of ["name", "location"] as const) {
      if (body[key] !== undefined) data[key] = body[key]?.slice(0, 200) || null;
    }
    if (body.date) {
      const when = new Date(`${body.date}T00:00:00Z`);
      if (!Number.isNaN(when.getTime())) data.date = when;
    }
    const run = await prisma.powerAnalysis.update({ where: { id }, data });
    return NextResponse.json(run);
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
    await prisma.powerAnalysis.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
