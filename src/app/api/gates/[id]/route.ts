import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { releaseFiles } from "@/lib/storage";
import {
  ACCESSORIES,
  OUTCOMES,
  PREPARATIONS,
  PRIORITIES,
  RESULTS,
  SERVICE_KINDS,
  failedSafety,
  yearAfter,
  type Answers,
  type Defect,
} from "@/lib/gates/form";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const report = await prisma.gateReport.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { position: "asc" }, include: { file: { select: { id: true } } } },
      technician: true,
      site: {
        select: {
          id: true,
          name: true,
          location: true,
          client: { select: { name: true } },
          contacts: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      },
    },
  });
  if (!report) return notFound("That report could not be found.");
  return NextResponse.json(report);
}

/* --- what a save is allowed to change -------------------------------------- */

/** Free text, trimmed and capped. Everything on the form is optional. */
const TEXT: Record<string, number> = {
  gateLocation: 200,
  assetNumber: 120,
  jobNumber: 120,
  reportNumber: 120,
  model: 200,
  serialNumber: 120,
  controllerModel: 200,
  controllerFirmware: 120,
  accessoryNotes: 2000,
  previousService: 2000,
  reportedFaults: 2000,
  weather: 400,
  manualRef: 2000,
  supplyVoltage: 300,
  earthTest: 600,
  balanceNotes: 600,
  lubrication: 600,
  partsReplaced: 1000,
  testInstrument: 400,
  openingTime: 200,
  closingTime: 200,
  autoCloseDelay: 200,
  finalCycles: 600,
  controllerErrors: 600,
  safetyMethod: 1200,
  forceEquipment: 600,
  workCompleted: 4000,
  recommendations: 2000,
  photoReferences: 1000,
  outcomeNotes: 2000,
  notifiedTime: 120,
  intervalBasis: 600,
};

/**
 * The answers, whitelisted.
 *
 * Only known results, and a note no longer than somebody would actually type.
 * An item id nobody recognises is dropped rather than stored, so a stale form
 * cannot leave rubbish behind that the report then has to cope with.
 */
function readAnswers(value: unknown): Answers | null {
  if (!value || typeof value !== "object") return null;
  const out: Answers = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9]{0,30}$/i.test(key)) continue;
    const answer = raw as { result?: unknown; note?: unknown };
    const result = RESULTS.find((candidate) => candidate === answer?.result);
    if (!result) continue;
    const note = typeof answer.note === "string" ? answer.note.trim().slice(0, 1200) : "";
    out[key] = note ? { result, note } : { result };
  }
  return out;
}

function readDefects(value: unknown): Defect[] | null {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 60).flatMap((raw) => {
    const row = raw as Record<string, unknown>;
    const priority = PRIORITIES.find((candidate) => candidate === row.priority) ?? "ROUTINE";
    const finding = String(row.finding ?? "").trim().slice(0, 1200);
    const action = String(row.action ?? "").trim().slice(0, 1200);
    const fromItem =
      typeof row.fromItem === "string" && /^[a-z][a-z0-9]{0,30}$/i.test(row.fromItem)
        ? row.fromItem
        : undefined;
    if (!finding && !action) return [];
    return [{
      ref: String(row.ref ?? "").trim().slice(0, 12),
      finding,
      priority,
      action,
      ...(fromItem ? { fromItem } : {}),
    }];
  });
}

function readList<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  return allowed.filter((candidate) => value.includes(candidate));
}

/**
 * Saving the form.
 *
 * Everything is optional and everything saves: a service report is filled in
 * on site, on a phone, in the order the work happens, and a form that refuses
 * to save until it is finished loses an afternoon's work when the battery
 * goes. What it still needs is worked out when it is read.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    for (const [key, max] of Object.entries(TEXT)) {
      if (!(key in body)) continue;
      const value = body[key];
      data[key] = value === null ? null : String(value).trim().slice(0, max) || null;
    }

    if ("kind" in body) data.kind = body.kind === "SLIDING" ? "SLIDING" : "BOOM";
    if ("serviceKind" in body) {
      data.serviceKind =
        SERVICE_KINDS.find((candidate) => candidate === body.serviceKind) ?? "SCHEDULED";
    }
    if ("outcome" in body) {
      data.outcome = OUTCOMES.find((candidate) => candidate === body.outcome) ?? null;
    }
    if ("armLengthMetres" in body) {
      const metres = Number(body.armLengthMetres);
      data.armLengthMetres =
        Number.isFinite(metres) && metres > 0 && metres < 30 ? metres : null;
    }

    const accessories = readList(body.accessories, ACCESSORIES);
    if (accessories) data.accessories = accessories;
    const preparation = readList(body.preparation, PREPARATIONS);
    if (preparation) data.preparation = preparation;

    const answers = readAnswers(body.answers);
    if (answers) data.answers = answers;
    const defects = readDefects(body.defects);
    if (defects) data.defects = defects;

    if ("technicianId" in body) data.technicianId = (body.technicianId as string) || null;
    if ("clientContactId" in body) data.clientContactId = (body.clientContactId as string) || null;
    if ("notifiedContactId" in body) {
      data.notifiedContactId = (body.notifiedContactId as string) || null;
    }

    /*
     * The service date carries the next one with it.
     *
     * The technician's date on the report is the service date, and the next
     * service falls a year after it — so moving the service date and leaving
     * last week's "next due" behind would be wrong in a way nobody would
     * notice. A date set by hand in the same save wins.
     */
    if (typeof body.date === "string" && body.date) {
      const when = new Date(`${body.date}T00:00:00Z`);
      if (Number.isNaN(when.getTime())) return badRequest("That date could not be read.");
      data.date = when;
      if (!body.nextServiceDue) data.nextServiceDue = yearAfter(when);
    }
    if ("nextServiceDue" in body) {
      const raw = body.nextServiceDue;
      if (raw === null || raw === "") data.nextServiceDue = null;
      else if (typeof raw === "string") {
        const when = new Date(`${raw}T00:00:00Z`);
        if (!Number.isNaN(when.getTime())) data.nextServiceDue = when;
      }
    }

    /*
     * Signing it off.
     *
     * The completion time is recorded then and not before: it is the time the
     * technician finished, which is a fact about the visit rather than about
     * when somebody last touched the form.
     */
    if ("completed" in body) {
      data.completedAt = body.completed ? new Date() : null;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    /*
     * A gate with a failed safety test is not returned to service.
     *
     * The form will not offer it, but the form is not the only way in here,
     * and this is the rule that matters most on the whole report: a barrier
     * whose closing safety, safety edge, force test or photocells failed does
     * not go back into unrestricted use because somebody picked the first
     * option on a list. Checked against the answers as they will stand after
     * this save, because a save can set both at once.
     */
    if (data.outcome === "RETURNED" || (answers && !("outcome" in body))) {
      const held = await prisma.gateReport.findUnique({ where: { id } });
      if (!held) return notFound("That report could not be found.");
      const after = (answers ?? (held.answers as Answers | null) ?? {}) as Answers;
      const outcome = ("outcome" in body ? data.outcome : held.outcome) as string | null;
      const failed = failedSafety(after);
      if (outcome === "RETURNED" && failed.length > 0) {
        if ("outcome" in body) {
          return badRequest(
            "This gate has a failed safety test, so it cannot be recorded as returned to service. " +
              "Record it as returned with documented defects, or isolated.",
          );
        }
        // The failure arrived after the outcome was chosen, so the outcome is
        // taken off rather than left standing over it.
        data.outcome = null;
      }
    }

    const report = await prisma.gateReport.update({ where: { id }, data });
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
    const photos = await prisma.gatePhoto.findMany({
      where: { reportId: id },
      select: { fileId: true },
    });
    await prisma.gateReport.delete({ where: { id } });
    await releaseFiles(photos.map((photo) => photo.fileId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That report could not be removed.");
  }
}
