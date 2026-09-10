/**
 * A drawn switchboard.
 *
 * The board is two columns of positions, so one "row" is a pair — adding a row
 * adds two positions. Fifteen rows is thirty positions, which covers most
 * boards; add rows for anything larger.
 *
 * Positions run down the first column, then continue down the second, which is
 * how boards are usually labelled.
 */

export type CellState = "EMPTY" | "BLANK" | "BREAKER" | "RCD" | "CONTACTOR";

export type BoardCell = { state: CellState; label: string };

/**
 * How the positions are numbered:
 *  - SEQUENTIAL runs 1…15 down the left column, then 16…30 down the right.
 *  - ODD_EVEN puts the odds down the left (1, 3, 5…) and the evens down the
 *    right (2, 4, 6…), which is how a lot of boards are actually marked.
 */
export type Numbering = "SEQUENTIAL" | "ODD_EVEN";

export type Board = {
  rows: number;
  numbering: Numbering;
  /** rows × 2 positions, in reading order: [row0 left, row0 right, row1 left…] */
  cells: BoardCell[];
  /** Devices outside the grid — beside the board, or up by the main switch. */
  extras: BoardCell[];
};

export const COLUMNS = 2;
export const DEFAULT_ROWS = 15;
export const MIN_ROWS = 1;
export const MAX_ROWS = 40;

/** Clicking a position in the grid walks through these, then starts again. */
const GRID_CYCLE: CellState[] = ["EMPTY", "BLANK", "BREAKER", "RCD"];

/** Outside the grid there can also be contactors. */
const EXTRA_CYCLE: CellState[] = [...GRID_CYCLE, "CONTACTOR"];

export const ALL_STATES: CellState[] = EXTRA_CYCLE;

export const STATE_LABELS: Record<CellState, string> = {
  EMPTY: "Nothing there",
  BLANK: "Blank",
  BREAKER: "Breaker",
  RCD: "RCD",
  CONTACTOR: "Contactor",
};

/** Positions carrying a device — the ones a thermal photo can be pinned to. */
export function isDevice(state: CellState): boolean {
  return state === "BREAKER" || state === "RCD" || state === "CONTACTOR";
}

export function nextState(state: CellState, inExtras = false): CellState {
  const cycle = inExtras ? EXTRA_CYCLE : GRID_CYCLE;
  const index = cycle.indexOf(state);
  return cycle[(index + 1) % cycle.length];
}

export function emptyCell(): BoardCell {
  return { state: "EMPTY", label: "" };
}

export function createBoard(rows = DEFAULT_ROWS): Board {
  return {
    rows,
    numbering: "SEQUENTIAL",
    cells: Array.from({ length: rows * COLUMNS }, emptyCell),
    extras: [],
  };
}

/** Grows or trims the grid, keeping whatever is already filled in. */
export function withRows(board: Board, rows: number): Board {
  const wanted = Math.min(Math.max(rows, MIN_ROWS), MAX_ROWS);
  const cells = Array.from(
    { length: wanted * COLUMNS },
    (_, index) => board.cells[index] ?? emptyCell(),
  );
  return { ...board, rows: wanted, cells };
}

/** The number printed on a position, following the board's own convention. */
export function positionNumber(board: Board, index: number): number {
  const row = Math.floor(index / COLUMNS);
  const column = index % COLUMNS;
  return board.numbering === "ODD_EVEN"
    ? row * COLUMNS + column + 1
    : column * board.rows + row + 1;
}

/** Accepts whatever came back from the database and returns something usable. */
export function normaliseBoard(value: unknown): Board {
  if (!value || typeof value !== "object") return createBoard();
  const raw = value as Partial<Board>;
  const rows =
    typeof raw.rows === "number" && raw.rows >= MIN_ROWS && raw.rows <= MAX_ROWS
      ? Math.floor(raw.rows)
      : DEFAULT_ROWS;

  const cells = Array.from({ length: rows * COLUMNS }, (_, index) =>
    normaliseCell(Array.isArray(raw.cells) ? raw.cells[index] : undefined),
  );
  const extras = Array.isArray(raw.extras)
    ? raw.extras.slice(0, 24).map(normaliseCell)
    : [];

  const numbering: Numbering = raw.numbering === "ODD_EVEN" ? "ODD_EVEN" : "SEQUENTIAL";

  return { rows, numbering, cells, extras };
}

function normaliseCell(value: unknown): BoardCell {
  if (!value || typeof value !== "object") return emptyCell();
  const raw = value as Partial<BoardCell>;
  return {
    state: EXTRA_CYCLE.includes(raw.state as CellState) ? (raw.state as CellState) : "EMPTY",
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : "",
  };
}

/** A one-line summary for the tree, e.g. "24 breakers · 4 RCDs". */
export function describeBoard(board: Board): string {
  const all = [...board.cells, ...board.extras];
  const count = (state: CellState) => all.filter((cell) => cell.state === state).length;

  const parts: string[] = [];
  const breakers = count("BREAKER");
  const rcds = count("RCD");
  const contactors = count("CONTACTOR");
  if (breakers) parts.push(`${breakers} breaker${breakers === 1 ? "" : "s"}`);
  if (rcds) parts.push(`${rcds} RCD${rcds === 1 ? "" : "s"}`);
  if (contactors) parts.push(`${contactors} contactor${contactors === 1 ? "" : "s"}`);
  return parts.join("  ·  ") || "Not drawn up yet";
}
