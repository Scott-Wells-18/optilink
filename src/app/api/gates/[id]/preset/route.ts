import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { SCENARIO_BY_ID, composeGate, type GateSelection } from "@/lib/gates/presets";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Proposing a scenario's wording into the report's own fields.
 *
 * The fields are the editable preview: the proposed wording lands in them and
 * the technician types over whatever they want to change. That is simpler
 * than a preview panel beside the form, and it means the report is drawn from
 * exactly the text somebody has read.
 *
 * Choosing a different scenario re-proposes. A field still holding the last
 * proposal word for word is replaced, because nobody has said anything about
 * it and leaving the old scenario's words there is how a sliding-gate report
 * ends up describing a boom arm. A field that has been typed in is left
 * alone and named in `kept`, so the technician is told what was not touched
 * rather than having their writing thrown away.
 *
 * Nothing here records a result. The scope, the method, the planned work and
 * the limitations are proposed; the completed-work paragraph is composed only
 * from tasks confirmed as done, and the outcome only from an outcome that was
 * chosen. A report with neither gets neither.
 */

/** Which composed block feeds which field on the report. */
const FIELDS: { block: string; field: "workCompleted" | "recommendations" | "safetyMethod" | "outcomeNotes" }[] = [
  { block: "method", field: "safetyMethod" },
  { block: "completed", field: "workCompleted" },
  { block: "recommendations", field: "recommendations" },
  { block: "outcome", field: "outcomeNotes" },
];

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      scenarioId?: string;
      completed?: string[];
      outcomeIds?: string[];
    };

    const scenarioId = (body.scenarioId ?? "").trim();
    if (!SCENARIO_BY_ID.has(scenarioId)) return badRequest("That scenario is not one of ours.");

    const report = await prisma.gateReport.findUnique({ where: { id } });
    if (!report) return notFound("That report could not be found.");

    const selection: GateSelection = {
      scenarioId,
      kind: report.kind,
      completed: (body.completed ?? []).filter((line) => typeof line === "string"),
      outcomeIds: (body.outcomeIds ?? []).filter((value) => typeof value === "string"),
    };
    const composed = composeGate(selection);

    const held = (report.preset ?? {}) as { proposed?: Record<string, string> };
    const was = held.proposed ?? {};

    const data: Record<string, unknown> = {};
    const proposed: Record<string, string> = {};
    const kept: string[] = [];

    for (const { block, field } of FIELDS) {
      const text = composed.blocks.find((candidate) => candidate.id === block)?.text ?? "";
      if (text) proposed[field] = text;

      const current = (report[field] ?? "") as string;
      // Untouched means empty, or still exactly what was last proposed.
      const untouched = !current.trim() || current === was[field];
      if (!untouched) {
        if (text && current !== text) kept.push(field);
        continue;
      }
      data[field] = text || null;
    }

    // The scope, planned work and limitations have no field of their own on
    // the form, so they are kept on the record and printed from there.
    data.preset = {
      scenarioId,
      completed: selection.completed,
      outcomeIds: selection.outcomeIds,
      proposed,
      blocks: composed.blocks,
    };
    data.serviceKind = SCENARIO_BY_ID.get(scenarioId)!.under;

    const saved = await prisma.gateReport.update({ where: { id }, data });
    return NextResponse.json({
      report: saved,
      kept,
      record: composed.record,
      completedWork: composed.completedWork,
    });
  } catch (error) {
    return serverError(error, "That scenario could not be applied.");
  }
}
