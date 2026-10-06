import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { readPreparedBy } from "@/lib/profiles";
import { releaseFiles } from "@/lib/storage";
import { groupsOf } from "@/lib/tagging/register";
import { itemsOf } from "@/lib/tagging/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await prisma.tagReport.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, originalName: true } },
      site: {
        select: {
          id: true,
          name: true,
          location: true,
          client: { select: { name: true } },
        },
      },
    },
  });
  if (!report) return notFound("That report could not be found.");

  const items = itemsOf(report.items);
  return NextResponse.json({
    ...report,
    items,
    // The pairings in the file, so one can be chosen where there is more than
    // one. Recomputed rather than stored: it is derived from the rows.
    groups: groupsOf(items),
  });
}

/**
 * The report date, the name, who prepared it, and which customer and site out
 * of the file it is about.
 *
 * The rows themselves are never changed. They are what the spreadsheet said
 * when the report was made, and a report whose rows can be edited afterwards
 * is not a record of a spreadsheet.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      date?: string;
      name?: string;
      customer?: string | null;
      siteLabel?: string | null;
      preparedBy?: unknown;
    };

    const data: Record<string, unknown> = {};
    const preparedBy = readPreparedBy(body.preparedBy);
    if (preparedBy) data.preparedBy = preparedBy;

    if (body.date) {
      const date = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return badRequest("That date could not be read.");
      data.date = date;
    }
    if ("name" in body) data.name = body.name?.trim().slice(0, 180) || null;

    // Choosing the customer and site chooses which rows the report is about.
    // Only a pairing that is actually in the file can be chosen, so one
    // customer's equipment can never end up under another customer's name.
    if ("customer" in body || "siteLabel" in body) {
      const held = await prisma.tagReport.findUnique({ where: { id } });
      if (!held) return notFound("That report could not be found.");
      const groups = groupsOf(itemsOf(held.items));
      const wanted = groups.find(
        (group) =>
          group.customer === (body.customer ?? held.customer) &&
          group.site === (body.siteLabel ?? held.siteLabel),
      );
      if (!wanted) {
        return badRequest("That customer and site pairing is not in this spreadsheet.");
      }
      data.customer = wanted.customer;
      data.siteLabel = wanted.site;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    const report = await prisma.tagReport.update({ where: { id }, data });
    return NextResponse.json(report);
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
    const held = await prisma.tagReport.findUnique({ where: { id } });
    await prisma.tagReport.delete({ where: { id } });
    // The spreadsheet goes with it, unless the reference file or another
    // report is still pointing at it.
    if (held?.sourceId) await releaseFiles([held.sourceId]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That report could not be removed.");
  }
}
