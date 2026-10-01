import { NextResponse } from "next/server";
import { readPreparedBy } from "@/lib/profiles";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await prisma.ampReport.findUnique({
    where: { id },
    include: {
      recordings: {
        orderBy: { position: "asc" },
        include: { file: { select: { id: true, originalName: true } } },
      },
      site: {
        select: {
          name: true,
          location: true,
          equipment: {
            where: { kind: "SWITCHBOARD" },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true },
          },
          contacts: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
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
      name?: string | null;
      location?: string | null;
      purpose?: string | null;
      date?: string;
      equipmentId?: string | null;
      instrumentId?: string | null;
      contactId?: string | null;
      contactName?: string | null;
      /** The order the recordings are read in, as a list of their ids. */
      recordingOrder?: string[];
      preparedBy?: unknown;
    };

    const data: Record<string, unknown> = {};
    const preparedBy = readPreparedBy(body.preparedBy);
    if (preparedBy) data.preparedBy = preparedBy;
    for (const key of ["name", "location", "contactName"] as const) {
      if (body[key] !== undefined) data[key] = body[key]?.slice(0, 200) || null;
    }
    if (body.purpose !== undefined) data.purpose = body.purpose?.slice(0, 2000) || null;
    if ("equipmentId" in body) data.equipmentId = body.equipmentId || null;
    if ("contactId" in body) data.contactId = body.contactId || null;
    if ("instrumentId" in body) data.instrumentId = body.instrumentId || null;
    if (body.date) {
      const when = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(when.getTime())) return badRequest("That date could not be read.");
      data.date = when;
    }

    // The order the recordings are presented in — on the contents, in the
    // summary table and as the pages themselves. Anything the caller did not
    // mention keeps its place behind the rest, so an order drawn before
    // another recording was added still saves.
    if (body.recordingOrder) {
      const held = await prisma.ampRecording.findMany({
        where: { reportId: id },
        select: { id: true },
        orderBy: { position: "asc" },
      });
      const known = new Set(held.map((item) => item.id));
      const wanted = body.recordingOrder.filter((item) => known.has(item));
      const ordered = [
        ...wanted,
        ...held.map((item) => item.id).filter((item) => !wanted.includes(item)),
      ];
      await prisma.$transaction(
        ordered.map((recordingId, position) =>
          prisma.ampRecording.update({ where: { id: recordingId }, data: { position } }),
        ),
      );
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    const report = await prisma.ampReport.update({ where: { id }, data });
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
    await prisma.ampReport.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
