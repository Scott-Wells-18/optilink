import { COLUMNS, isDevice, positionNumber, slotKey, type Board } from "@/lib/board";
import { isEmptyRow, type RcdRow } from "@/lib/rcd/parse";

/**
 * Pairing the instrument's tests with the ways on the board.
 *
 * The instrument knows nothing about the board — it just numbers its tests in
 * the order they were taken. So the board is walked in the order the operator
 * says they worked it, and the tests are dealt onto that walk one at a time.
 *
 * Two things are taken out first: rows that measured nothing, and the extra
 * rows left behind when a way was tested more than once.
 */

/** How the board was worked through. */
export type WalkOrder =
  /** Down the first column, then down the second — 1, 3, 5 … or 1, 2, 3 … */
  | "COLUMNS"
  /** Across each row, then down to the next. */
  | "ROWS";

export type Walk = { order: WalkOrder; rightToLeft: boolean };

export const DEFAULT_WALK: Walk = { order: "COLUMNS", rightToLeft: false };

export type Position = {
  slot: string;
  label: string;
  /** The way number as printed on the board. */
  number: number | null;
};

/** Every way on the board that can hold a test, in the order it was worked. */
export function walkPositions(board: Board, walk: Walk = DEFAULT_WALK): Position[] {
  const out: Position[] = [];

  for (const section of board.sections) {
    // Devices outside the grid are tested first — they are at the top of the
    // board, by the main switch.
    section.extras.forEach((cell, index) => {
      if (!isDevice(cell.state)) return;
      out.push({
        slot: slotKey(section.id, "extra", index),
        label: cell.label.trim() || `Additional ${index + 1}`,
        number: null,
      });
    });

    const columns = Array.from({ length: COLUMNS }, (_, column) =>
      walk.rightToLeft ? COLUMNS - 1 - column : column,
    );

    const indexes: number[] =
      walk.order === "COLUMNS"
        ? columns.flatMap((column) =>
            Array.from({ length: section.rows }, (_, row) => row * COLUMNS + column),
          )
        : Array.from({ length: section.rows }, (_, row) =>
            columns.map((column) => row * COLUMNS + column),
          ).flat();

    for (const index of indexes) {
      const cell = section.cells[index];
      if (!cell || !isDevice(cell.state)) continue;
      out.push({
        slot: slotKey(section.id, "cell", index),
        label: cell.label.trim() || `Way ${positionNumber(section, index, board.numbering)}`,
        number: positionNumber(section, index, board.numbering),
      });
    }
  }

  return out;
}

export type Pairing = {
  position: Position | null;
  row: RcdRow;
};

export type MappingResult = {
  pairs: Pairing[];
  /** Rows dropped because they measured nothing. */
  dropped: RcdRow[];
  /** Rows dropped as repeats of a way that was tested more than once. */
  duplicates: RcdRow[];
  /** Ways with no test left to give them. */
  untested: Position[];
};

/**
 * Deal the real tests onto the walk.
 *
 * `extras` says how many times over a way was tested: a way marked ×2 swallows
 * two further rows after its own, which are set aside rather than mapped.
 */
export function mapTests(
  rows: RcdRow[],
  positions: Position[],
  extras: Record<string, number> = {},
): MappingResult {
  const dropped = rows.filter(isEmptyRow);
  const real = rows.filter((row) => !isEmptyRow(row));

  const pairs: Pairing[] = [];
  const duplicates: RcdRow[] = [];
  const untested: Position[] = [];

  let at = 0;
  for (const position of positions) {
    if (at >= real.length) {
      untested.push(position);
      continue;
    }
    pairs.push({ position, row: real[at] });
    at += 1;

    // Retests of this way follow immediately, so they are taken next.
    const repeats = Math.max(0, Math.floor(extras[position.slot] ?? 0));
    for (let n = 0; n < repeats && at < real.length; n += 1) {
      duplicates.push(real[at]);
      at += 1;
    }
  }

  // Anything left over was tested but has nowhere to go on this board.
  for (; at < real.length; at += 1) pairs.push({ position: null, row: real[at] });

  return { pairs, dropped, duplicates, untested };
}

/** What the file says about itself, against what it is being filed under. */
export function crossCheck(
  parsed: { siteName: string | null; boardName: string | null; circuitRange: string | null },
  site: { name: string },
  board: { name: string; ways: number } | null,
): string[] {
  const out: string[] = [];

  if (parsed.siteName && !looselyMatches(parsed.siteName, site.name)) {
    out.push(
      `The report names site "${parsed.siteName}"; it is being filed under "${site.name}".`,
    );
  }
  if (board && parsed.boardName && !looselyMatches(parsed.boardName, board.name)) {
    out.push(
      `The report names board "${parsed.boardName}"; it is being filed against "${board.name}".`,
    );
  }
  if (board && parsed.circuitRange) {
    const ways = Number.parseInt(parsed.circuitRange.split(/[-–]/).pop() ?? "", 10);
    if (Number.isFinite(ways) && ways > board.ways) {
      out.push(
        `The report covers ${parsed.circuitRange} ways; "${board.name}" is drawn with ${board.ways}.`,
      );
    }
  }
  return out;
}

/** Names are typed on a keypad, so this is forgiving about how. */
function looselyMatches(a: string, b: string): boolean {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const left = clean(a);
  const right = clean(b);
  if (!left || !right) return true;
  if (left === right || left.includes(right) || right.includes(left)) return true;

  // Or they share most of their words — "meal room" against "DB2 Meal Room".
  const words = new Set(left.split(" "));
  const shared = right.split(" ").filter((word) => words.has(word)).length;
  return shared >= Math.min(words.size, right.split(" ").length);
}
