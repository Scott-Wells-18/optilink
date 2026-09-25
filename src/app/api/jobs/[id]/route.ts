import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { releaseFiles } from "@/lib/storage";

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
      contactId?: string | null;
      itemOrder?: string[];
    };

    const data: Record<string, unknown> = {};
    if (body.date) {
      // "2026-09-18" from a date input, kept as that day rather than a moment.
      const date = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return badRequest("That date could not be read.");
      data.date = date;
    }
    if ("name" in body) data.name = body.name?.trim().slice(0, 180) || null;
    if ("contactId" in body) data.contactId = body.contactId || null;
    if (body.recommendations) {
      data.recommendations = body.recommendations
        .map((line) => line.trim().slice(0, 400))
        .filter(Boolean)
        .slice(0, 40);
    }
    // The order the work is written up in, as a list of item ids. It is the
    // order everywhere: the list on the front of the report, the summary and
    // the numbered sections, with each item's photographs travelling with it.
    if (body.itemOrder) {
      const held = await prisma.jobItem.findMany({
        where: { jobId: id },
        select: { id: true },
        orderBy: { position: "asc" },
      });
      const known = new Set(held.map((item) => item.id));
      const wanted = body.itemOrder.filter((itemId) => known.has(itemId));
      // Anything the caller did not mention keeps its place behind the rest,
      // so a list drawn before another piece of work was added still saves.
      const ordered = [
        ...wanted,
        ...held.map((item) => item.id).filter((itemId) => !wanted.includes(itemId)),
      ];
      await prisma.$transaction(
        ordered.map((itemId, position) =>
          prisma.jobItem.update({ where: { id: itemId }, data: { position } }),
        ),
      );
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
    // The photographs go with it. Noted before the delete, because the rows
    // that name them are cascaded away with the report.
    const photos = await prisma.jobPhoto.findMany({
      where: { item: { jobId: id } },
      select: { fileId: true },
    });
    await prisma.job.delete({ where: { id } });
    await releaseFiles(photos.map((photo) => photo.fileId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The job could not be removed.");
  }
}
