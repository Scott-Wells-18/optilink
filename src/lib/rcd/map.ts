import {
  COLUMNS,
  PHASES,
  freeSlotKey,
  isFreeBoard,
  isRcd,
  orderedItems,
  positionNumber,
  slotKey,
  testsFor,
  type Board,
  type BoardSection,
  type CellState,
  type Numbering,
} from "@/lib/board";
import { namesMatch } from "@/lib/rcd/names";
import { type RcdRow } from "@/lib/rcd/parse";

/**
 * Pairing the instrument's tests with the ways on the board.
 *
 * The instrument knows nothing about the board — it just numbers its tests in
 * the order they were taken, S_1, S_2, and on. So the board is walked in the
 * order the operator says they worked it, and the tests are dealt onto that
 * walk one at a time.
 *
 * Only RCDs are walked. A board of thirty-six ways might carry four of them,
 * and the instrument's fourth test belongs to the fourth RCD, not to way four:
 * everything in between is a breaker with nothing to trip.
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

export type Walk = {
  order: WalkOrder;
  /** Whether the devices outside the grid were worked before the grid or after. */
  extrasFirst: boolean;
  /**
   * The additional RCDs in the order they were tested, by slot. Anything not
   * named here follows in the order it is drawn.
   */
  extraOrder: string[];
};

export const DEFAULT_WALK: Walk = { order: "COLUMNS", extrasFirst: true, extraOrder: [] };

/** Accepts a walk off an older record, which had no additionals ordering. */
export function normaliseWalk(value: unknown): Walk {
  const raw = (value ?? {}) as Partial<Walk>;
  return {
    order: raw.order === "ROWS" ? "ROWS" : "COLUMNS",
    extrasFirst: raw.extrasFirst !== false,
    extraOrder: Array.isArray(raw.extraOrder)
      ? raw.extraOrder.filter((slot): slot is string => typeof slot === "string")
      : [],
  };
}

export type Position = {
  slot: string;
  label: string;
  /** The way number as printed on the board. */
  number: number | null;
  /** Which phase of a three-phase device this test is, if it is one. */
  phase: string | null;
  /** True on the last test a device accounts for — where its repeats follow. */
  last: boolean;
};

/** Every RCD on the board that takes a test, in the order it was worked. */
export function walkPositions(board: Board, walk: Walk = DEFAULT_WALK): Position[] {
  // A freehand board has no rows or columns to walk. The operator numbered the
  // RCDs themselves when they drew it, and that numbering is the walk.
  if (isFreeBoard(board)) {
    // A board drawn freehand has no way numbers to cite, so a device is named
    // for what was written on it, and failing that for where it falls in the
    // testing order: RCD-1, RCD-2, and so on.
    return orderedItems(board)
      .filter((item) => isRcd(item.state))
      .flatMap((item, place) =>
        phasesOf(
          item.state,
          freeSlotKey(item.id),
          item.label.trim() ? `RCD - ${item.label.trim()}` : `RCD-${place + 1}`,
          null,
        ),
      );
  }

  const out: Position[] = [];

  for (const section of board.sections) {
    const extras = extraPositions(section, walk);
    const grid = gridPositions(section, board.numbering, walk);
    out.push(...(walk.extrasFirst ? [...extras, ...grid] : [...grid, ...extras]));
  }

  return out;
}

/**
 * Devices outside the grid, in the order the operator says they took them.
 *
 * They have no numbering of their own to follow, so unless the operator points
 * at them one by one they are taken as drawn, left to right.
 */
function extraPositions(section: BoardSection, walk: Walk): Position[] {
  const drawn = section.extras
    .map((cell, index) => ({ cell, slot: slotKey(section.id, "extra", index), index }))
    .filter((entry) => isRcd(entry.cell.state));

  const ranked = [...drawn].sort((a, b) => {
    const left = walk.extraOrder.indexOf(a.slot);
    const right = walk.extraOrder.indexOf(b.slot);
    if (left === right) return a.index - b.index;
    if (left < 0) return 1;
    if (right < 0) return -1;
    return left - right;
  });

  // Devices beside the grid have no way number, so they are named for what
  // they are: "RCD-Kitchen GPOs", or "RCD-Additional" where nothing was
  // written on them.
  return ranked.flatMap((entry) =>
    phasesOf(
      entry.cell.state,
      entry.slot,
      entry.cell.label.trim() ? `RCD-${entry.cell.label.trim()}` : "RCD-Additional",
      null,
    ),
  );
}

function gridPositions(section: BoardSection, numbering: Numbering, walk: Walk): Position[] {
  const columns = Array.from({ length: COLUMNS }, (_, column) => column);

  const indexes: number[] =
    walk.order === "COLUMNS"
      ? columns.flatMap((column) =>
          Array.from({ length: section.rows }, (_, row) => row * COLUMNS + column),
        )
      : Array.from({ length: section.rows }, (_, row) =>
          columns.map((column) => row * COLUMNS + column),
        ).flat();

  return indexes.flatMap((index) => {
    const cell = section.cells[index];
    if (!cell || !isRcd(cell.state)) return [];
    const number = positionNumber(section, index, numbering);
    return phasesOf(
      cell.state,
      slotKey(section.id, "cell", index),
      wayLabel(section, index, numbering, cell),
      number,
    );
  });
}

/**
 * What a device in the grid is called on the report.
 *
 * "CB-4 (Kitchen GPOs)", or "CB-4" where the way was never labelled. A
 * three-phase device occupies the way above and the way below as well, so it
 * is named for all three: "CB-1,3,5 (Compressor)". The numbers are the ones
 * printed on the board, which on an odd/even board are not consecutive.
 */
function wayLabel(
  section: BoardSection,
  index: number,
  numbering: Numbering,
  cell: { state: CellState; label: string },
): string {
  const spread = spanOf(cell.state);
  const numbers: number[] = [];
  for (let step = -Math.floor(spread / 2); step <= Math.floor(spread / 2); step += 1) {
    const at = index + step * COLUMNS;
    if (at < 0 || at >= section.rows * COLUMNS) continue;
    numbers.push(positionNumber(section, at, numbering));
  }

  const ways = `CB-${numbers.sort((a, b) => a - b).join(",")}`;
  const written = cell.label.trim();
  return written ? `${ways} (${written})` : ways;
}

/**
 * How many ways a device occupies on the board.
 *
 * A three-phase RCD is three modules wide and sits across the way above and
 * the way below its own. A single-phase device is one way.
 */
function spanOf(state: CellState): number {
  return testsFor(state) === 3 ? 3 : 1;
}

/**
 * One device, as many tests as it accounts for.
 *
 * A three-phase RCD is tested across each phase in turn, so it takes three of
 * the instrument's records; each comes back as its own result, named for its
 * phase, because a device that trips on two phases and not the third has to
 * read as exactly that.
 */
function phasesOf(
  state: CellState,
  slot: string,
  label: string,
  number: number | null,
): Position[] {
  const count = testsFor(state);
  if (count === 1) return [{ slot, label, number, phase: null, last: true }];
  return PHASES.slice(0, count).map((phase, index) => ({
    slot,
    label: `${label} (${phase})`,
    number,
    phase,
    last: index === count - 1,
  }));
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
 * Deal the instrument's tests onto the walk.
 *
 * Every row is dealt, in the order the instrument numbered them, including a
 * row that came back with nothing measured. That was not always so: rows
 * reading "---" across all six measurements used to be taken out first, on the
 * understanding that the instrument logs a fetch whenever it is woken without
 * a device on the leads. It does not reliably do that. A first test that came
 * back empty is a first test all the same, and taking it out slides every
 * later reading onto the wrong way — which is worse than reporting an empty
 * one, because it is wrong quietly.
 *
 * A device whose readings are all empty now lands on its own way and is
 * assessed as having recorded nothing, which is visible on the results page
 * and can be acted on.
 *
 * `extras` says how many times over a way was tested: a way marked ×2 swallows
 * two further rows after its own, which are set aside rather than mapped. On a
 * three-phase device the repeats follow the third phase, not the first.
 */
export function mapTests(
  rows: RcdRow[],
  positions: Position[],
  extras: Record<string, number> = {},
): MappingResult {
  // Nothing is held back: the instrument's sequence is the walk's sequence.
  const dropped: RcdRow[] = [];
  const real = rows;

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
    if (!position.last) continue;
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

/** How many RCDs a board carries, counting a three-phase device once. */
export function countRcds(board: Board): number {
  return everyCell(board).filter((cell) => isRcd(cell.state)).length;
}

/** True when every RCD on a freehand board has been given a place in the run. */
export function sequenceIsSet(board: Board): boolean {
  if (!isFreeBoard(board)) return true;
  const rcds = (board.items ?? []).filter((item) => isRcd(item.state));
  return rcds.length === 0 || rcds.every((item) => item.order !== null);
}

/**
 * How many of the instrument's records the board should account for — three
 * apiece for the three-phase devices, one for the rest.
 */
export function countRcdTests(board: Board): number {
  return everyCell(board)
    .filter((cell) => isRcd(cell.state))
    .reduce((total, cell) => total + testsFor(cell.state), 0);
}

function everyCell(board: Board) {
  if (isFreeBoard(board)) return board.items ?? [];
  return board.sections.flatMap((section) => [...section.cells, ...section.extras]);
}

export type Mismatch = {
  /** Which part of the identity disagrees. */
  field: "site" | "board" | "ways";
  /** What the instrument's own export says. */
  onExport: string;
  /** What it is being filed against here. */
  onRecord: string;
  message: string;
};

/** What the file says about itself, against what it is being filed under. */
export function crossCheck(
  parsed: { siteName: string | null; boardName: string | null; circuitRange: string | null },
  site: { name: string },
  board: { name: string; tests: number } | null,
): Mismatch[] {
  const out: Mismatch[] = [];

  if (parsed.siteName && !namesMatch(parsed.siteName, site.name)) {
    out.push({
      field: "site",
      onExport: parsed.siteName,
      onRecord: site.name,
      message: `The export names site "${parsed.siteName}"; it is being filed under "${site.name}".`,
    });
  }
  if (board && parsed.boardName && !namesMatch(parsed.boardName, board.name)) {
    out.push({
      field: "board",
      onExport: parsed.boardName,
      onRecord: board.name,
      message: `The export names board "${parsed.boardName}"; it is being filed against "${board.name}".`,
    });
  }
  if (board && parsed.circuitRange && board.tests > 0) {
    // The instrument is set to a span of ways; what matters is whether the
    // board has RCDs enough to take the tests that came back.
    const ways = Number.parseInt(parsed.circuitRange.split(/[-–—]/).pop() ?? "", 10);
    if (Number.isFinite(ways) && ways > 0 && board.tests > ways) {
      out.push({
        field: "ways",
        onExport: parsed.circuitRange,
        onRecord: `${board.tests} tests`,
        message: `The instrument was set to ways ${parsed.circuitRange}; "${board.name}" is drawn with ${board.tests} RCD tests to take.`,
      });
    }
  }
  return out;
}
