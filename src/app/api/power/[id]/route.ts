import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notFound, readJson, serverError } from "@/lib/api";
import { isBrief } from "@/lib/power/brief";

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
      site: {
        select: {
          name: true,
          location: true,
          // The boards at this site, so the analysis can be pinned to the one
          // the logger went on rather than described in free text — and so the
          // feed can name another board instead of an id.
          equipment: {
            where: { kind: "SWITCHBOARD" },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, supply: true },
          },
          contacts: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
        },
      },
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
      equipmentId?: string | null;
      instrumentId?: string | null;
      brief?: string | null;
      contactName?: string | null;
      contactId?: string | null;
    };
    const data: Record<string, unknown> = {};
    for (const key of ["name", "location", "contactName"] as const) {
      if (body[key] !== undefined) data[key] = body[key]?.slice(0, 200) || null;
    }
    if ("equipmentId" in body) data.equipmentId = body.equipmentId || null;
    if ("contactId" in body) data.contactId = body.contactId || null;
    if ("instrumentId" in body) data.instrumentId = body.instrumentId || null;
    if ("brief" in body) data.brief = isBrief(body.brief) ? body.brief : null;
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
