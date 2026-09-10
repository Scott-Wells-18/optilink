import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** Only the date can be changed after the fact. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as { date?: string };
    if (!body.date) return badRequest("Pick a date.");

    // "2026-09-10" from a date input, kept as that day rather than a moment.
    const date = new Date(`${body.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return badRequest("That date could not be read.");

    await prisma.inspection.update({ where: { id }, data: { date } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The date could not be changed.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.inspection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The inspection could not be removed.");
  }
}
