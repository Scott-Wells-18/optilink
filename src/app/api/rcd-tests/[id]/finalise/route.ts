import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { normaliseBoard } from "@/lib/board";
import { assessRow, kindFor } from "@/lib/rcd/assess";
import { loadTuning } from "@/lib/rcd/settings";
import { mapTests, normaliseWalk, walkPositions } from "@/lib/rcd/map";
import type { RcdExport, Reading } from "@/lib/rcd/parse";

export const runtime = "nodejs";

/**
 * Applies the operator's corrections and writes the results.
 *
 * The walk and the duplicate counts are kept alongside them, so the report can
 * say plainly what was taken out and why rather than quietly dropping rows.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      walk?: unknown;
      extras?: Record<string, number>;
      checklist?: Record<string, boolean | string>;
      mismatches?: string[];
    };

    const run = await prisma.rcdTestRun.findUnique({
      where: { id },
      include: { equipment: { select: { name: true, board: true } } },
    });
    if (!run) return notFound("That test could not be found.");
    if (!run.parsed) return badRequest("No export has been read for this test yet.");

    const parsed = run.parsed as unknown as RcdExport;
    const board = run.equipment ? normaliseBoard(run.equipment.board) : null;
    const walk = normaliseWalk(body.walk);
    const positions = board ? walkPositions(board, walk) : [];
    const mapped = mapTests(parsed.rows, positions, body.extras ?? {});

    const tuning = await loadTuning();

    await prisma.$transaction(async (tx) => {
      await tx.rcdResult.deleteMany({ where: { runId: id } });
      await tx.rcdTestRun.update({
        where: { id },
        data: {
          corrections: {
            walk,
            extras: body.extras ?? {},
            droppedEmpty: mapped.dropped.map((row) => row.name),
            droppedDuplicate: mapped.duplicates.map((row) => row.name),
            untested: mapped.untested.map((position) => position.label),
          },
          checklist: body.checklist ?? {},
          mismatches: body.mismatches?.slice(0, 20) ?? run.mismatches,
        },
      });

      for (const [index, pair] of mapped.pairs.entries()) {
        const assessment = assessRow(pair.row, tuning);
        await tx.rcdResult.create({
          data: {
            runId: id,
            slot: pair.position?.slot ?? null,
            label:
              pair.position?.label ??
              `${pair.row.name} — no matching way on the board`,
            ratingMa: pair.row.ratingMa,
            kind: kindFor(pair.row),
            halfAt0: store(pair.row.halfAt0),
            halfAt180: store(pair.row.halfAt180),
            ratedAt0: store(pair.row.ratedAt0),
            ratedAt180: store(pair.row.ratedAt180),
            fiveAt0: store(pair.row.fiveAt0),
            fiveAt180: store(pair.row.fiveAt180),
            touchVolts: pair.row.touchVolts,
            verdict: assessment.verdict,
            reasons: assessment.reasons,
            position: index,
          },
        });
      }
    });

    return NextResponse.json({
      saved: mapped.pairs.length,
      droppedEmpty: mapped.dropped.length,
      droppedDuplicate: mapped.duplicates.length,
      untested: mapped.untested.length,
    });
  } catch (error) {
    return serverError(error, "Those results could not be saved.");
  }
}

/** "No trip" is kept as a number past any limit, so the column stays numeric. */
function store(reading: Reading): number | null {
  if (reading === null) return null;
  return reading === "NO_TRIP" ? 2000 : reading;
}
