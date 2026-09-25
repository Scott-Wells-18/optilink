import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** The date it was carried out, and whose name goes on the report. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      date?: string;
      contactId?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (body.date) {
      // "2026-09-10" from a date input, kept as that day rather than a moment.
      const date = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return badRequest("That date could not be read.");
      data.date = date;
    }
    if ("contactId" in body) data.contactId = body.contactId || null;
    if (Object.keys(data).length === 0) return badRequest("Nothing to change.");

    await prisma.inspection.update({ where: { id }, data });
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
