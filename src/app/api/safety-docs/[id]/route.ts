import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notFound, readJson, serverError } from "@/lib/api";
import { BY_CODE } from "@/lib/safety/catalogue";
import { decide } from "@/lib/safety/decide";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await prisma.safetyDoc.findUnique({
    where: { id },
    include: { site: { include: { client: { select: { name: true } } } } },
  });
  if (!doc) return notFound("That paperwork could not be found.");
  return NextResponse.json(doc);
}

/** The answers, and which documents were chosen. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      codes?: string[];
      projectName?: string;
      projectManager?: string;
      contactNumber?: string;
      jobTitle?: string;
      jobDescription?: string;
      workDescription?: string;
      answers?: Record<string, string>;
      sourceFileId?: string | null;
      date?: string;
      jobNumber?: string;
      assessmentDate?: string | null;
      energised?: unknown;
      /** One person confirming they have read the documents, or taking it back. */
      sign?: { key: string; confirmed: boolean };
    };

    const data: Record<string, unknown> = {};

    // The answers decide the documents, so they arrive together: whatever was
    // said about the work, and what that works out to.
    if (body.answers) {
      const answers: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.answers)) {
        // Long enough for a hand-picked list of codes, short enough that the
        // answers cannot be used to store a document.
        if (typeof value === "string" && value.length < 300) answers[key] = value;
      }
      data.answers = answers;
      const decision = decide(answers, {
        title: body.jobTitle ?? null,
        description: body.jobDescription ?? null,
      });
      data.codes = decision.codes;
    }
    if (body.codes && !body.answers) {
      data.codes = body.codes.filter((code) => BY_CODE.has(code));
    }

    for (const key of [
      "projectName",
      "projectManager",
      "contactNumber",
      "jobTitle",
    ] as const) {
      if (body[key] !== undefined) data[key] = body[key]?.slice(0, 400) || null;
    }
    for (const key of ["jobDescription", "workDescription"] as const) {
      if (body[key] !== undefined) data[key] = body[key]?.slice(0, 3000) || null;
    }
    if (body.sourceFileId !== undefined) data.sourceFileId = body.sourceFileId;
    if (body.jobNumber !== undefined) data.jobNumber = body.jobNumber.slice(0, 60) || null;
    for (const key of ["date", "assessmentDate"] as const) {
      if (body[key] === undefined) continue;
      if (body[key] === null || body[key] === "") {
        if (key === "assessmentDate") data.assessmentDate = null;
        continue;
      }
      const when = new Date(`${body[key]}T00:00:00Z`);
      if (!Number.isNaN(when.getTime())) data[key] = when;
    }
    if (body.energised !== undefined) data.energised = body.energised ?? null;

    /*
     * Signing.
     *
     * One person at a time, and only for themselves. Nothing here decides that
     * somebody has read something — this records that they said so, and it is
     * the only thing that puts their signature on a document. It can be taken
     * back, which matters: an authorisation somebody signed and then thought
     * better of should be retractable without deleting the job.
     */
    const held = await prisma.safetyDoc.findUnique({ where: { id } });
    if (!held) return notFound("That paperwork could not be found.");

    if (body.sign) {
      const signOff = { ...((held.signOff ?? {}) as Record<string, unknown>) };
      if (body.sign.confirmed) signOff[body.sign.key] = { at: new Date().toISOString() };
      else delete signOff[body.sign.key];
      data.signOff = signOff;
    }

    /*
     * Anything that really changes takes the signatures off again.
     *
     * A confirmation is a confirmation of a particular set of documents with
     * particular answers in them. Change the answers, the job number or the
     * energised assessment and what was read is no longer what would be
     * downloaded, so it has to be read again.
     *
     * Saving the same values back is not a change. The dialog saves before it
     * records a confirmation, so that everything the person just read is what
     * is on file — and if that counted as a change it would take the previous
     * person's confirmation off every time.
     */
    if (!body.sign && changed(held as Record<string, unknown>, data)) data.signOff = {};

    const doc = await prisma.safetyDoc.update({ where: { id }, data });
    return NextResponse.json(doc);
  } catch (error) {
    return serverError(error, "That could not be saved.");
  }
}

/** True when the update would leave the paperwork saying something different. */
function changed(held: Record<string, unknown>, data: Record<string, unknown>): boolean {
  return Object.entries(data).some(([key, value]) => same(held[key], value) === false);
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return String(a instanceof Date ? a.toISOString() : a) ===
      String(b instanceof Date ? b.toISOString() : b);
  }
  return stable(a) === stable(b);
}

/**
 * The same values in a different order are the same values.
 *
 * The answers go to the database as JSON and come back with whatever key order
 * the database felt like; the browser sends its own. Comparing the raw strings
 * would make every save look like a change, and every save that looks like a
 * change takes somebody's signature off.
 */
function stable(value: unknown): string {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .sort(([one], [two]) => one.localeCompare(two))
          .map(([key, entry]) => [key, walk(entry)]),
      );
    }
    return node;
  };
  return JSON.stringify(walk(value ?? null));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.safetyDoc.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
