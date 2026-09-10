/**
 * A drawn switchboard.
 *
 * A board is made of one or more sections — a main switchboard often has a
 * lighting section, a power section and so on, each its own run of positions.
 * Every section is two columns, so one "row" is a pair: adding a row adds two
 * positions. Fifteen rows is thirty positions, which covers most sections.
 */

export type CellState = "EMPTY" | "BLANK" | "BREAKER" | "RCD" | "CONTACTOR";

export type BoardCell = { state: CellState; label: string };

/**
 * How positions are numbered, across the whole board:
 *  - SEQUENTIAL runs 1…15 down the left column, then 16…30 down the right.
 *  - ODD_EVEN puts odds down the left (1, 3, 5…) and evens down the right.
 */
export type Numbering = "SEQUENTIAL" | "ODD_EVEN";

export type BoardSection = {
  id: string;
  name: string;
  rows: number;
  /** rows × 2 positions, in reading order: [row0 left, row0 right, row1 left…] */
  cells: BoardCell[];
  /** Devices outside the grid — beside the section, or up by the main switch. */
  extras: BoardCell[];
};

export type Board = {
  numbering: Numbering;
  sections: BoardSection[];
};

export const COLUMNS = 2;
export const DEFAULT_ROWS = 15;
export const MIN_ROWS = 1;
export const MAX_ROWS = 40;
export const MAX_SECTIONS = 12;

/** Clicking a position in the grid walks through these, then starts again. */
const GRID_CYCLE: CellState[] = ["EMPTY", "BLANK", "BREAKER", "RCD"];

/** Outside the grid there can also be contactors. */
const EXTRA_CYCLE: CellState[] = [...GRID_CYCLE, "CONTACTOR"];

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
  return cycle[(cycle.indexOf(state) + 1) % cycle.length];
}

export function emptyCell(): BoardCell {
  return { state: "EMPTY", label: "" };
}

function newId(): string {
  const maybe = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return maybe?.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createSection(name = "", rows = DEFAULT_ROWS): BoardSection {
  return {
    id: newId(),
    name,
    rows,
    cells: Array.from({ length: rows * COLUMNS }, emptyCell),
    extras: [],
  };
}

export function createBoard(): Board {
  return { numbering: "SEQUENTIAL", sections: [createSection("Main")] };
}

/** Grows or trims a section's grid, keeping whatever is already filled in. */
export function withRows(section: BoardSection, rows: number): BoardSection {
  const wanted = Math.min(Math.max(rows, MIN_ROWS), MAX_ROWS);
  const cells = Array.from(
    { length: wanted * COLUMNS },
    (_, index) => section.cells[index] ?? emptyCell(),
  );
  return { ...section, rows: wanted, cells };
}

/** The number printed on a position, following the board's own convention. */
export function positionNumber(
  section: BoardSection,
  index: number,
  numbering: Numbering,
): number {
  const row = Math.floor(index / COLUMNS);
  const column = index % COLUMNS;
  return numbering === "ODD_EVEN"
    ? row * COLUMNS + column + 1
    : column * section.rows + row + 1;
}

/** Where a photo is pinned: which section, and which position within it. */
export function slotKey(sectionId: string, kind: "cell" | "extra", index: number): string {
  return `${sectionId}:${kind}:${index}`;
}

/** Photos saved before boards had sections carry no section prefix. */
export function legacySlotKey(kind: "cell" | "extra", index: number): string {
  return `${kind}:${index}`;
}

/** Accepts whatever came back from the database and returns something usable. */
export function normaliseBoard(value: unknown): Board {
  if (!value || typeof value !== "object") return createBoard();
  const raw = value as Partial<Board> & { cells?: unknown; rows?: unknown; extras?: unknown };

  const numbering: Numbering = raw.numbering === "ODD_EVEN" ? "ODD_EVEN" : "SEQUENTIAL";

  if (Array.isArray(raw.sections) && raw.sections.length > 0) {
    return {
      numbering,
      sections: raw.sections.slice(0, MAX_SECTIONS).map(normaliseSection),
    };
  }

  // Boards drawn before sections existed: one section holding everything.
  if (Array.isArray(raw.cells)) {
    return {
      numbering,
      sections: [normaliseSection({ id: "main", name: "Main", ...raw })],
    };
  }

  return { numbering, sections: [createSection("Main")] };
}

function normaliseSection(value: unknown): BoardSection {
  const raw = (value ?? {}) as Partial<BoardSection>;
  const rows =
    typeof raw.rows === "number" && raw.rows >= MIN_ROWS && raw.rows <= MAX_ROWS
      ? Math.floor(raw.rows)
      : DEFAULT_ROWS;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    name: typeof raw.name === "string" ? raw.name.slice(0, 80) : "",
    rows,
    cells: Array.from({ length: rows * COLUMNS }, (_, index) =>
      normaliseCell(Array.isArray(raw.cells) ? raw.cells[index] : undefined),
    ),
    extras: Array.isArray(raw.extras) ? raw.extras.slice(0, 24).map(normaliseCell) : [],
  };
}

function normaliseCell(value: unknown): BoardCell {
  if (!value || typeof value !== "object") return emptyCell();
  const raw = value as Partial<BoardCell>;
  return {
    state: EXTRA_CYCLE.includes(raw.state as CellState) ? (raw.state as CellState) : "EMPTY",
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : "",
  };
}

/** A one-line summary for the tree, e.g. "3 sections · 24 breakers · 4 RCDs". */
export function describeBoard(board: Board): string {
  const all = board.sections.flatMap((section) => [...section.cells, ...section.extras]);
  const count = (state: CellState) => all.filter((cell) => cell.state === state).length;

  const parts: string[] = [];
  if (board.sections.length > 1) parts.push(`${board.sections.length} sections`);
  const breakers = count("BREAKER");
  const rcds = count("RCD");
  const contactors = count("CONTACTOR");
  if (breakers) parts.push(`${breakers} breaker${breakers === 1 ? "" : "s"}`);
  if (rcds) parts.push(`${rcds} RCD${rcds === 1 ? "" : "s"}`);
  if (contactors) parts.push(`${contactors} contactor${contactors === 1 ? "" : "s"}`);
  return parts.join("  ·  ") || "Not drawn up yet";
}
