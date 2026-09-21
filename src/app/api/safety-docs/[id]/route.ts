import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notFound, readJson, serverError } from "@/lib/api";
import { BY_CODE } from "@/lib/safety/catalogue";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await prisma.safetyDoc.findUnique({
    where: { id },
    include: { site: { include: { client: { select: { name: true } } } } },
  });
  if (!doc) return notFound("That paperwork could not be found.");
  return NextResponse.json(doc);
}

/** The answers, and which documents were chosen. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      codes?: string[];
      projectName?: string;
      projectManager?: string;
      contactNumber?: string;
      jobDescription?: string;
      sourceFileId?: string | null;
      date?: string;
    };

    const data: Record<string, unknown> = {};
    if (body.codes) data.codes = body.codes.filter((code) => BY_CODE.has(code));
    for (const key of ["projectName", "projectManager", "contactNumber", "jobDescription"] as const) {
      if (body[key] !== undefined) data[key] = body[key]?.slice(0, 400) || null;
    }
    if (body.sourceFileId !== undefined) data.sourceFileId = body.sourceFileId;
    if (body.date) {
      const when = new Date(`${body.date}T00:00:00Z`);
      if (!Number.isNaN(when.getTime())) data.date = when;
    }

    const doc = await prisma.safetyDoc.update({ where: { id }, data });
    return NextResponse.json(doc);
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
    await prisma.safetyDoc.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
