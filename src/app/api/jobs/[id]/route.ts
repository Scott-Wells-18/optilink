import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** The date it was carried out, and anything recommended but not done. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      date?: string;
      name?: string;
      recommendations?: string[];
    };

    const data: Record<string, unknown> = {};
    if (body.date) {
      // "2026-09-18" from a date input, kept as that day rather than a moment.
      const date = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return badRequest("That date could not be read.");
      data.date = date;
    }
    if ("name" in body) data.name = body.name?.trim().slice(0, 180) || null;
    if (body.recommendations) {
      data.recommendations = body.recommendations
        .map((line) => line.trim().slice(0, 400))
        .filter(Boolean)
        .slice(0, 40);
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    await prisma.job.update({ where: { id }, data });
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
    await prisma.job.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The job could not be removed.");
  }
}
