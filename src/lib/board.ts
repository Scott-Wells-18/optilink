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

export type CellState = "EMPTY" | "BLANK" | "BREAKER" | "RCD";

export type BoardCell = { state: CellState; label: string };

export type Board = {
  rows: number;
  /** rows × 2 positions, in reading order: [row0 left, row0 right, row1 left…] */
  cells: BoardCell[];
  /** RCDs that sit outside the grid — beside the board, or up by the main switch. */
  extras: BoardCell[];
};

export const COLUMNS = 2;
export const DEFAULT_ROWS = 15;
export const MIN_ROWS = 1;
export const MAX_ROWS = 40;

/** Clicking a position walks through these, then starts again. */
const CYCLE: CellState[] = ["EMPTY", "BLANK", "BREAKER", "RCD"];

export const STATE_LABELS: Record<CellState, string> = {
  EMPTY: "Nothing there",
  BLANK: "Blank",
  BREAKER: "Breaker",
  RCD: "RCD",
};

export function nextState(state: CellState): CellState {
  return CYCLE[(CYCLE.indexOf(state) + 1) % CYCLE.length];
}

export function emptyCell(): BoardCell {
  return { state: "EMPTY", label: "" };
}

export function createBoard(rows = DEFAULT_ROWS): Board {
  return {
    rows,
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

/** The number printed on a position: down column one, then down column two. */
export function positionNumber(board: Board, index: number): number {
  const row = Math.floor(index / COLUMNS);
  const column = index % COLUMNS;
  return column * board.rows + row + 1;
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

  return { rows, cells, extras };
}

function normaliseCell(value: unknown): BoardCell {
  if (!value || typeof value !== "object") return emptyCell();
  const raw = value as Partial<BoardCell>;
  return {
    state: CYCLE.includes(raw.state as CellState) ? (raw.state as CellState) : "EMPTY",
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : "",
  };
}

/** A one-line summary for the tree, e.g. "24 breakers · 4 RCDs". */
export function describeBoard(board: Board): string {
  const all = [...board.cells, ...board.extras];
  const breakers = all.filter((cell) => cell.state === "BREAKER").length;
  const rcds = all.filter((cell) => cell.state === "RCD").length;
  const blanks = all.filter((cell) => cell.state === "BLANK").length;

  const parts: string[] = [];
  if (breakers) parts.push(`${breakers} breaker${breakers === 1 ? "" : "s"}`);
  if (rcds) parts.push(`${rcds} RCD${rcds === 1 ? "" : "s"}`);
  if (blanks) parts.push(`${blanks} blank${blanks === 1 ? "" : "s"}`);
  return parts.join("  ·  ") || "Not drawn up yet";
}
