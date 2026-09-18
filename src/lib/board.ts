/**
 * A drawn switchboard.
 *
 * A board is made of one or more sections — a main switchboard often has a
 * lighting section, a power section and so on, each its own run of positions.
 * Every section is two columns, so one "row" is a pair: adding a row adds two
 * positions. Fifteen rows is thirty positions, which covers most sections.
 */

export type CellState = "EMPTY" | "BLANK" | "BREAKER" | "RCD" | "RCD_3P" | "CONTACTOR";

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

/**
 * A device on a freehand board.
 *
 * Older boards are not grids. There is a bank of four down one side, a main
 * switch up in a corner, two RCDs sitting on their own where somebody found
 * room for them. A grid cannot describe that, so a freehand board places each
 * device itself.
 *
 * Positions are fractions of the frame rather than pixels, so the same board
 * draws correctly on a laptop, on a phone and into a report without anything
 * having to be rescaled.
 */
export type FreeItem = {
  id: string;
  state: CellState;
  label: string;
  /** Left and top edges, 0–1 across the frame. */
  x: number;
  y: number;
  /** Width and height, 0–1 of the frame. */
  w: number;
  h: number;
  /**
   * Where this device falls in the RCD testing run, counting from 1. Null
   * where it takes no test, or where the order has not been set yet.
   */
  order: number | null;
};

/** How wide the frame is against its height. */
export type FrameRatio = number;

export type Board = {
  /**
   * How the board is drawn. A grid board is two columns of numbered ways; a
   * freehand board is devices placed where they actually are.
   */
  layout?: "GRID" | "FREE";
  numbering: Numbering;
  sections: BoardSection[];
  /** Only on a freehand board. */
  frame?: FrameRatio;
  items?: FreeItem[];
};

/** True when this board was drawn freehand rather than as a grid of ways. */
export function isFreeBoard(board: Board): boolean {
  return board.layout === "FREE";
}

export const FRAME_RATIOS: { label: string; ratio: number }[] = [
  { label: "Tall", ratio: 0.7 },
  { label: "Square", ratio: 1 },
  { label: "Wide", ratio: 1.6 },
  { label: "Very wide", ratio: 2.4 },
];

export const DEFAULT_FRAME = 1.6;
export const MAX_ITEMS = 120;
/** Nothing smaller than this is worth tapping, as a fraction of the frame. */
export const MIN_ITEM_W = 0.06;
export const MIN_ITEM_H = 0.04;

export const COLUMNS = 2;
export const DEFAULT_ROWS = 15;
export const MIN_ROWS = 1;
export const MAX_ROWS = 40;
export const MAX_SECTIONS = 12;

/** Clicking a position in the grid walks through these, then starts again. */
const GRID_CYCLE: CellState[] = ["EMPTY", "BLANK", "BREAKER", "RCD", "RCD_3P"];

/** Outside the grid there can also be contactors. */
const EXTRA_CYCLE: CellState[] = [...GRID_CYCLE, "CONTACTOR"];

export const STATE_LABELS: Record<CellState, string> = {
  EMPTY: "Nothing there",
  BLANK: "Blank",
  BREAKER: "Breaker",
  RCD: "RCD",
  RCD_3P: "RCD, three phase",
  CONTACTOR: "Contactor",
};

/** Positions carrying a device — the ones a thermal photo can be pinned to. */
export function isDevice(state: CellState): boolean {
  return (
    state === "BREAKER" || state === "RCD" || state === "RCD_3P" || state === "CONTACTOR"
  );
}

/** Positions an RCD test lands on. A breaker has nothing to trip. */
export function isRcd(state: CellState): boolean {
  return state === "RCD" || state === "RCD_3P";
}

/**
 * How many tests a device accounts for on the instrument.
 *
 * A three-phase RCD is tested across each phase in turn, so it swallows three
 * of the instrument's records rather than one.
 */
export function testsFor(state: CellState): number {
  return state === "RCD_3P" ? 3 : 1;
}

/** What the instrument's three records are called, in the order they're taken. */
export const PHASES = ["L1", "L2", "L3"] as const;

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
  return { layout: "GRID", numbering: "SEQUENTIAL", sections: [createSection("Main")] };
}

/** A blank freehand board: an empty frame, nothing placed on it yet. */
export function createFreeBoard(frame = DEFAULT_FRAME): Board {
  return {
    layout: "FREE",
    numbering: "SEQUENTIAL",
    sections: [],
    frame,
    items: [],
  };
}

/** A device dropped onto a freehand board, sized to something tappable. */
export function createItem(state: CellState, x: number, y: number): FreeItem {
  return {
    id: newId(),
    state,
    label: "",
    x: clamp01(x),
    y: clamp01(y),
    w: 0.22,
    h: 0.09,
    order: null,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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

/** Where a photo is pinned on a freehand board. */
export function freeSlotKey(itemId: string): string {
  return `free:${itemId}`;
}

/** The item a freehand slot names, if it is still on the board. */
export function freeItemFor(board: Board, slot: string): FreeItem | null {
  if (!slot.startsWith("free:")) return null;
  const id = slot.slice(5);
  return board.items?.find((item) => item.id === id) ?? null;
}

/**
 * Every device on a freehand board, in the order it is tested.
 *
 * The operator numbers the RCDs themselves, because nothing about where a
 * device sits says when they got to it. Anything left unnumbered falls in
 * behind, top to bottom and left to right — which is how most people work a
 * board they have not thought about.
 */
export function orderedItems(board: Board): FreeItem[] {
  const items = [...(board.items ?? [])];
  return items.sort((a, b) => {
    if (a.order !== null && b.order !== null) return a.order - b.order;
    if (a.order !== null) return -1;
    if (b.order !== null) return 1;
    // Same row within a tolerance, so a bank of four reads left to right.
    if (Math.abs(a.y - b.y) > 0.04) return a.y - b.y;
    return a.x - b.x;
  });
}

/** Accepts whatever came back from the database and returns something usable. */
export function normaliseBoard(value: unknown): Board {
  if (!value || typeof value !== "object") return createBoard();
  const raw = value as Partial<Board> & { cells?: unknown; rows?: unknown; extras?: unknown };

  const numbering: Numbering = raw.numbering === "ODD_EVEN" ? "ODD_EVEN" : "SEQUENTIAL";

  if (raw.layout === "FREE") {
    const frame = typeof raw.frame === "number" && raw.frame > 0.2 && raw.frame < 6
      ? raw.frame
      : DEFAULT_FRAME;
    return {
      layout: "FREE",
      numbering,
      sections: [],
      frame,
      items: Array.isArray(raw.items)
        ? raw.items.slice(0, MAX_ITEMS).map(normaliseItem).filter(Boolean as never)
        : [],
    };
  }

  if (Array.isArray(raw.sections) && raw.sections.length > 0) {
    return {
      layout: "GRID",
      numbering,
      sections: raw.sections.slice(0, MAX_SECTIONS).map(normaliseSection),
    };
  }

  // Boards drawn before sections existed: one section holding everything.
  if (Array.isArray(raw.cells)) {
    return {
      layout: "GRID",
      numbering,
      sections: [normaliseSection({ id: "main", name: "Main", ...raw })],
    };
  }

  return createBoard();
}

function normaliseItem(value: unknown): FreeItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<FreeItem>;
  if (!EXTRA_CYCLE.includes(raw.state as CellState) || raw.state === "EMPTY") return null;

  const size = (given: unknown, least: number) =>
    typeof given === "number" && Number.isFinite(given)
      ? Math.min(1, Math.max(least, given))
      : least * 2;

  const w = size(raw.w, MIN_ITEM_W);
  const h = size(raw.h, MIN_ITEM_H);
  const place = (given: unknown, extent: number) =>
    typeof given === "number" && Number.isFinite(given)
      ? Math.min(1 - extent, Math.max(0, given))
      : 0;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    state: raw.state as CellState,
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : "",
    x: place(raw.x, w),
    y: place(raw.y, h),
    w,
    h,
    order:
      typeof raw.order === "number" && Number.isFinite(raw.order) && raw.order > 0
        ? Math.floor(raw.order)
        : null,
  };
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
  const all = isFreeBoard(board)
    ? (board.items ?? [])
    : board.sections.flatMap((section) => [...section.cells, ...section.extras]);
  const count = (state: CellState) => all.filter((cell) => cell.state === state).length;

  const parts: string[] = [];
  if (isFreeBoard(board)) parts.push("Drawn freehand");
  else if (board.sections.length > 1) parts.push(`${board.sections.length} sections`);
  const breakers = count("BREAKER");
  const rcds = count("RCD") + count("RCD_3P");
  const contactors = count("CONTACTOR");
  if (breakers) parts.push(`${breakers} breaker${breakers === 1 ? "" : "s"}`);
  if (rcds) parts.push(`${rcds} RCD${rcds === 1 ? "" : "s"}`);
  if (contactors) parts.push(`${contactors} contactor${contactors === 1 ? "" : "s"}`);
  return parts.join("  ·  ") || "Not drawn up yet";
}
