import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { readPreparedBy } from "@/lib/profiles";
import { releaseFiles } from "@/lib/storage";
import {
  CATEGORIES,
  MARK_LABELS,
  SECTIONS,
  STATUS_LABELS,
  defaultArrangements,
  recordId,
  type Arrangement,
  type Assignment,
  type CategoryEntry,
  type Mark,
  type MarkEntry,
  type Section,
  type Status,
  type TestFile,
} from "@/lib/install/session";
import { analysisOf, fileIdsOf, filesOf, inputOf, marksOf } from "@/lib/install/stored";

export const runtime = "nodejs";

const SOURCE = { source: { select: { id: true, originalName: true } } } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await prisma.installReport.findUnique({
    where: { id },
    include: {
      ...SOURCE,
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

  // The grouping is derived rather than stored: it follows from the files,
  // the marks and the arrangement, so it is always in step with them.
  const input = inputOf(report);
  const analysis = analysisOf(report);

  return NextResponse.json({
    id: report.id,
    date: report.date,
    phases: report.phases,
    installation: report.installation,
    circuitDetails: report.circuitDetails,
    contactId: report.contactId,
    instrumentId: report.instrumentId,
    preparedBy: report.preparedBy,
    site: report.site,
    files: input.files.map(({ rows, ...file }) => ({ ...file, count: rows.length })),
    marks: input.marks,
    arrangements: { ...defaultArrangements(report.phases), ...input.arrangements },
    groupNames: input.groupNames,
    assignments: input.assignments,
    verification: analysis.verification,
    analysis,
  });
}

/**
 * Everything about the report except its readings.
 *
 * The rows are never changed. They are what the instrument wrote, and a report
 * whose readings can be edited afterwards is not a record of a test. What can
 * change is the order of the files, which records are accepted, how they are
 * grouped and named, and the verification checklist.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const held = await prisma.installReport.findUnique({ where: { id }, include: SOURCE });
    if (!held) return notFound("That report could not be found.");

    const files = filesOf(held);
    const known = new Set(files.flatMap((file) => file.rows.map((row) => recordId(file.fileId, row.name))));
    const data: Record<string, unknown> = {};
    const json = (value: unknown) => JSON.parse(JSON.stringify(value));

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

    /*
     * The files: their order, their dummy setting, and which are still on it.
     *
     * Sent as a list of { fileId, excludeFirst, dummyConfirmed } in the order
     * wanted. The rows are never taken from the request — only from what was
     * read when the file was uploaded.
     */
    let removed: string[] = [];
    if (Array.isArray(body.files)) {
      const next: TestFile[] = [];
      for (const raw of body.files as { fileId?: unknown; excludeFirst?: unknown; dummyConfirmed?: unknown }[]) {
        const file = files.find((held) => held.fileId === raw.fileId);
        if (!file || next.includes(file)) continue;
        next.push({
          ...file,
          excludeFirst: typeof raw.excludeFirst === "boolean" ? raw.excludeFirst : file.excludeFirst,
          dummyConfirmed:
            typeof raw.dummyConfirmed === "boolean" ? raw.dummyConfirmed : file.dummyConfirmed,
        });
      }
      removed = files
        .filter((file) => !next.some((kept) => kept.fileId === file.fileId))
        .map((file) => file.fileId);
      data.files = json(next);
      data.recordCount = next.reduce((total, file) => total + file.rows.length, 0);
      // A converted older report keeps its exclusions as marks.
      if (!Array.isArray(held.files) && !("marks" in body)) data.marks = json(marksOf(held));
      if (removed.includes(held.sourceId ?? "")) data.sourceId = null;
    }

    if (body.marks && typeof body.marks === "object") {
      const marks: Record<string, MarkEntry> = {};
      for (const [key, value] of Object.entries(body.marks as Record<string, MarkEntry>)) {
        if (!known.has(key) || !value || !(value.mark in MARK_LABELS)) continue;
        marks[key] = {
          mark: value.mark as Mark,
          reason: String(value.reason ?? "").trim().slice(0, 300) || undefined,
          confirmedFailure: value.confirmedFailure === true || undefined,
        };
      }
      data.marks = json(marks);
    }

    if (body.arrangements && typeof body.arrangements === "object") {
      const out: Partial<Record<Section, Arrangement>> = {};
      for (const section of SECTIONS) {
        const raw = (body.arrangements as Record<string, Arrangement>)[section];
        if (!raw) continue;
        const list = (value: unknown, cap: number) =>
          (Array.isArray(value) ? value : [])
            .map((item) => String(item ?? "").trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, cap);
        out[section] = {
          preset: String(raw.preset ?? "CUSTOM").slice(0, 40),
          phaseNames: list(raw.phaseNames, 6),
          labels: list(raw.labels, 12),
          confirmed: raw.confirmed === true,
        };
      }
      data.arrangements = json(out);
    }

    if (body.groupNames && typeof body.groupNames === "object") {
      const out: Partial<Record<Section, string[]>> = {};
      for (const section of SECTIONS) {
        const raw = (body.groupNames as Record<string, unknown>)[section];
        if (!Array.isArray(raw)) continue;
        out[section] = raw.slice(0, 200).map((name) => String(name ?? "").trim().slice(0, 120));
      }
      data.groupNames = json(out);
    }

    if (body.assignments && typeof body.assignments === "object") {
      const out: Record<string, Assignment> = {};
      for (const [key, value] of Object.entries(body.assignments as Record<string, Assignment>)) {
        if (!known.has(key) || !value || !SECTIONS.includes(value.section)) continue;
        const group = Math.round(Number(value.group));
        if (!Number.isFinite(group) || group < 0 || group > 500) continue;
        out[key] = { section: value.section, group };
      }
      data.assignments = json(out);
    }

    if (body.verification && typeof body.verification === "object") {
      const out: Record<string, CategoryEntry> = {};
      for (const category of CATEGORIES) {
        const raw = (body.verification as Record<string, CategoryEntry>)[category.key];
        if (!raw) continue;
        out[category.key] = {
          selected: raw.selected === true,
          status: (raw.status in STATUS_LABELS ? raw.status : "PENDING") as Status,
          reason: String(raw.reason ?? "").trim().slice(0, 500) || undefined,
          evidence: String(raw.evidence ?? "").trim().slice(0, 2000) || undefined,
        };
      }
      data.verification = json(out);
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    await prisma.installReport.update({ where: { id }, data });
    if (removed.length > 0) await releaseFiles(removed);
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
    const held = await prisma.installReport.findUnique({ where: { id } });
    await prisma.installReport.delete({ where: { id } });
    if (held) await releaseFiles(fileIdsOf(held));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That report could not be removed.");
  }
}
