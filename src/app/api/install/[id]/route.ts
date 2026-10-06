import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { readPreparedBy } from "@/lib/profiles";
import { releaseFiles } from "@/lib/storage";
import type { InstallRow } from "@/lib/install/parse";
import {
  EXCLUSION_REASONS,
  anomaliesOf,
  groupPoints,
  kept,
  pointKey,
  type Exclusion,
} from "@/lib/install/points";

export const runtime = "nodejs";

/** The stored rows, read back as what they are. */
function rowsOf(stored: unknown): InstallRow[] {
  return Array.isArray(stored) ? (stored as InstallRow[]) : [];
}

function exclusionsOf(stored: unknown): Exclusion[] {
  return Array.isArray(stored) ? (stored as Exclusion[]) : [];
}

function namesOf(stored: unknown): Record<string, string> {
  return stored && typeof stored === "object" ? (stored as Record<string, string>) : {};
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await prisma.installReport.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, originalName: true } },
      site: {
        select: {
          id: true,
          name: true,
          location: true,
          client: { select: { name: true } },
          contacts: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
        },
      },
    },
  });
  if (!report) return notFound("That report could not be found.");

  // The grouping is derived rather than stored: it follows from the rows and
  // the exclusions, so it is always in step with them.
  const rows = rowsOf(report.rows);
  const exclusions = exclusionsOf(report.exclusions);
  const using = kept(rows, exclusions);
  const grouping = groupPoints(using, namesOf(report.pointNames));

  return NextResponse.json({
    ...report,
    rows,
    exclusions,
    points: grouping.points.map((point) => ({ ...point, key: pointKey(point) })),
    stray: grouping.stray,
    repeats: grouping.repeats,
    anomalies: anomaliesOf(using, grouping, report.phases),
  });
}

/**
 * Everything about the report except its readings.
 *
 * The rows are never changed. They are what the instrument wrote, and a report
 * whose readings can be edited afterwards is not a record of a test. What can
 * change is what they are called, which circuit they belong to, and which ones
 * are set aside.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const held = await prisma.installReport.findUnique({ where: { id } });
    if (!held) return notFound("That report could not be found.");

    const rows = rowsOf(held.rows);
    const known = new Set(rows.map((row) => row.name));
    const data: Record<string, unknown> = {};

    const preparedBy = readPreparedBy(body.preparedBy);
    if (preparedBy) data.preparedBy = preparedBy;

    if (typeof body.date === "string" && body.date) {
      const when = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(when.getTime())) return badRequest("That date could not be read.");
      data.date = when;
    }
    for (const key of ["name", "installation", "circuitDetails"] as const) {
      if (key in body) data[key] = String(body[key] ?? "").trim().slice(0, 2000) || null;
    }
    if ("phases" in body) data.phases = body.phases === "THREE" ? "THREE" : "SINGLE";
    if ("contactId" in body) data.contactId = (body.contactId as string) || null;
    if ("instrumentId" in body) data.instrumentId = (body.instrumentId as string) || null;

    // What the operator called each point, keyed by the S number of its first
    // reading so a name stays with its point when the grouping is recomputed.
    if (body.pointNames && typeof body.pointNames === "object") {
      const names: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.pointNames as Record<string, unknown>)) {
        if (!known.has(key)) continue;
        const name = String(value ?? "").trim().slice(0, 120);
        if (name) names[key] = name;
      }
      data.pointNames = names;
    }

    /*
     * Setting a record aside.
     *
     * Only a record that is actually in this file, and only with a reason — an
     * exclusion with no reason is indistinguishable from a deletion when
     * somebody reads the report in a year. Taking the exclusion off puts the
     * record straight back: nothing was removed.
     */
    if (Array.isArray(body.exclusions)) {
      const out: Exclusion[] = [];
      for (const raw of body.exclusions.slice(0, 200)) {
        const row = raw as { name?: unknown; reason?: unknown };
        const name = String(row.name ?? "");
        if (!known.has(name) || out.some((held) => held.name === name)) continue;
        const reason = String(row.reason ?? "").trim().slice(0, 200);
        out.push({ name, reason: reason || EXCLUSION_REASONS[0] });
      }
      data.exclusions = out;
    }

    // Which circuit a record belongs to, where a file holds more than one.
    if (body.circuits && typeof body.circuits === "object") {
      const circuits: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.circuits as Record<string, unknown>)) {
        if (!known.has(key)) continue;
        const circuit = String(value ?? "").trim().slice(0, 160);
        if (circuit) circuits[key] = circuit;
      }
      data.circuits = circuits;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    const report = await prisma.installReport.update({ where: { id }, data });
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
    const held = await prisma.installReport.findUnique({ where: { id } });
    await prisma.installReport.delete({ where: { id } });
    if (held?.sourceId) await releaseFiles([held.sourceId]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That report could not be removed.");
  }
}
