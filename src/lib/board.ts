/**
 * A drawn switchboard.
 *
 * A board is made of one or more sections — a main switchboard often has a
 * lighting section, a power section and so on, each its own run of positions.
 * Every section is two columns, so one "row" is a pair: adding a row adds two
 * positions. Fifteen rows is thirty positions, which covers most sections.
 */

/**
 * What is in a way.
 *
 * These are devices, not colours. An RCD and an RCBO are different things and
 * a board that says "RCD" where an RCBO sits is wrong on a compliance
 * document: an RCD protects people and nothing else, while an RCBO is an RCD
 * and a breaker in one enclosure and protects the cable as well. Both take an
 * RCD test; only one of them will trip on an overload.
 *
 * Every device comes in single and three-phase. A three-phase device is three
 * modules tall and occupies the way above and the way below its own.
 */
export type CellState =
  | "EMPTY"
  | "BLANK"
  | "BREAKER"
  | "BREAKER_3P"
  | "RCD"
  | "RCD_3P"
  | "RCBO"
  | "RCBO_3P"
  | "CONTACTOR"
  | "CONTACTOR_3P";

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

/**
 * Every device that can go in a way, in the order they are offered.
 *
 * Single-phase first with its three-phase twin beside it, so the pair reads as
 * one device in two sizes rather than as two unrelated things.
 */
export const DEVICES: CellState[] = [
  "BLANK",
  "BREAKER",
  "BREAKER_3P",
  "RCD",
  "RCD_3P",
  "RCBO",
  "RCBO_3P",
  "CONTACTOR",
  "CONTACTOR_3P",
];

/**
 * What can go in a way on the grid.
 *
 * Breakers and RCBOs, and nothing else. A way on the rail is fed off the
 * busbar and protects one circuit; an RCD protecting a group of circuits, or
 * a contactor switching a load, does not sit there — it sits up by the mains
 * or on a board of its own. Offering them in a way would draw boards that
 * cannot be built.
 */
const GRID_CYCLE: CellState[] = [
  "EMPTY",
  "BLANK",
  "BREAKER",
  "BREAKER_3P",
  "RCBO",
  "RCBO_3P",
];

/**
 * What can go beside the main switch, or on a sub-board alongside.
 *
 * Everything. That is where the RCDs and the contactors live, along with
 * anything else that is not fed off the rail.
 */
const EXTRA_CYCLE: CellState[] = ["EMPTY", ...DEVICES];

/** Everything a saved board may legitimately hold. */
const KNOWN: CellState[] = EXTRA_CYCLE;

/** True where a device can go in a way on the rail rather than only beside it. */
export function fitsTheGrid(state: CellState): boolean {
  return GRID_CYCLE.includes(state);
}

export const STATE_LABELS: Record<CellState, string> = {
  EMPTY: "Nothing there",
  BLANK: "Blank",
  BREAKER: "Breaker",
  BREAKER_3P: "Breaker, three phase",
  RCD: "RCD",
  RCD_3P: "RCD, three phase",
  RCBO: "RCBO",
  RCBO_3P: "RCBO, three phase",
  CONTACTOR: "Contactor",
  CONTACTOR_3P: "Contactor, three phase",
};

/** The short name, for a palette button or a tight column. */
export const STATE_SHORT: Record<CellState, string> = {
  EMPTY: "Empty",
  BLANK: "Blank",
  BREAKER: "Breaker",
  BREAKER_3P: "Breaker 3φ",
  RCD: "RCD",
  RCD_3P: "RCD 3φ",
  RCBO: "RCBO",
  RCBO_3P: "RCBO 3φ",
  CONTACTOR: "Contactor",
  CONTACTOR_3P: "Contactor 3φ",
};

/** Positions carrying a device — the ones a thermal photo can be pinned to. */
export function isDevice(state: CellState): boolean {
  return state !== "EMPTY" && state !== "BLANK";
}

/**
 * Positions an RCD test lands on.
 *
 * An RCBO as well as an RCD. They are not the same device — an RCD protects
 * people and nothing else, an RCBO is an RCD and a breaker in one enclosure
 * and protects the cable too — but both carry the same residual-current
 * element and are tested exactly the same way. A breaker has nothing to trip
 * and a contactor is not a protective device at all.
 */
export function isRcd(state: CellState): boolean {
  return state === "RCD" || state === "RCD_3P" || state === "RCBO" || state === "RCBO_3P";
}

/** Switches all three phases, and takes up more than one way to do it. */
export function isThreePhase(state: CellState): boolean {
  return state.endsWith("_3P");
}

/**
 * How far a device reaches either side of the way it is clicked into.
 *
 * Module widths off the real gear, not a guess:
 *
 *  - A three-pole breaker is three modules, one per phase, with a single
 *    toggle bar across them. Clicked in the middle, it takes the way above
 *    and the way below.
 *  - A three-phase RCBO or RCD is **four**: the three poles, plus a fourth
 *    for the neutral and the test button. The toggle bar still runs across
 *    the three poles, and the button sits under them — so clicked in the
 *    middle of the poles it takes one way above and two below.
 *  - A three-pole contactor is three modules.
 *
 * Getting this wrong is not cosmetic: the number of ways a device occupies is
 * how many ways are left, and a board drawn one short does not match the one
 * on the wall.
 */
export type Extent = { above: number; below: number };

export function extentOf(state: CellState): Extent {
  if (!isThreePhase(state)) return { above: 0, below: 0 };
  // The fourth module — neutral and test button — hangs below the poles.
  if (state === "RCBO_3P" || state === "RCD_3P") return { above: 1, below: 2 };
  return { above: 1, below: 1 };
}

/** How many ways a device takes up on the board. */
export function polesOf(state: CellState): number {
  const { above, below } = extentOf(state);
  return above + below + 1;
}

/**
 * How many tests a device accounts for on the instrument.
 *
 * A three-phase RCD is tested across each phase in turn, so it swallows three
 * of the instrument's records rather than one.
 */
export function testsFor(state: CellState): number {
  return isRcd(state) && isThreePhase(state) ? 3 : 1;
}

/**
 * Which part of a device a way is drawing.
 *
 * A single device fills its way on its own and is "whole". A three-phase one
 * is three modules tall, so the way above it draws the device's top, its own
 * way draws the middle — where the toggle is — and the way below draws the
 * bottom. Drawn that way the three read as one device standing across three
 * ways, which is what it is.
 */
export type Part =
  /** A one-module device, all of it in its own way. */
  | "whole"
  /** The first pole, above the way the device was clicked into. */
  | "top"
  /** The way it was clicked into: the middle pole, and where the toggle is. */
  | "middle"
  /** The third pole. */
  | "bottom"
  /** The fourth module of an RCD or RCBO: the neutral and the test button. */
  | "button";

export type Span = { state: CellState; part: Part };

/**
 * What a way is really showing: its own device, or part of the three-phase one
 * standing across it.
 *
 * Worked out from where the device sits rather than written onto its
 * neighbours, so nothing has to be cleared when one is placed and nothing is
 * lost when one is taken away: whatever was in those ways is still there, and
 * comes back the moment the device is removed.
 */
const PARTS: Record<number, Part> = { [-1]: "top", 0: "middle", 1: "bottom", 2: "button" };

/** How far from the way a device was clicked into each of its parts sits. */
const STEPS: Record<Part, number> = { whole: 0, top: -1, middle: 0, bottom: 1, button: 2 };

/**
 * The way a device was clicked into, given one of the ways it covers.
 *
 * Everything about a device — its name, the photos pinned to it, the tests
 * taken against it — belongs to that one way, whichever of its modules is
 * being looked at.
 */
export function ownerOf(index: number, part: Part): number {
  return index - STEPS[part] * COLUMNS;
}

/** Which phase a module switches, or null for the neutral and test module. */
export function phaseOf(part: Part): string | null {
  if (part === "top") return PHASES[0];
  if (part === "middle") return PHASES[1];
  if (part === "bottom") return PHASES[2];
  return null;
}

export function spanAt(section: BoardSection, index: number): Span {
  // Which way is the device that covers this one clicked into? Anything from
  // two ways above (a four-module RCBO whose button module this is) to one
  // way below (whose first pole this is).
  for (let offset = -2; offset <= 1; offset += 1) {
    const at = index + offset * COLUMNS;
    const state = section.cells[at]?.state ?? "EMPTY";
    if (!isThreePhase(state)) continue;

    // A device saved somewhere it cannot fit — a board drawn before that was
    // prevented, or edited outside the app — is drawn in its own way alone
    // rather than hanging off the end of the rail.
    if (!fitsAt(section, at, state)) continue;

    const { above, below } = extentOf(state);
    const step = -offset;
    if (step >= -above && step <= below) return { state, part: PARTS[step] };
  }

  const own = section.cells[index]?.state ?? "EMPTY";
  return { state: own, part: "whole" };
}

/** Whether a position is taken up by a device clicked into another way. */
export function isSpanned(section: BoardSection, index: number): boolean {
  const part = spanAt(section, index).part;
  return part !== "whole" && part !== "middle";
}

/**
 * Whether a three-phase device will fit at this position.
 *
 * It needs a way above and a way below in the same column, and neither of
 * them may already be taken by another three-phase device. That rules out the
 * top and bottom of every column, which is where one physically cannot go.
 */
export function fitsAt(section: BoardSection, index: number, state: CellState): boolean {
  const { above, below } = extentOf(state);
  if (above === 0 && below === 0) return true;

  const column = index % COLUMNS;
  const last = section.rows * COLUMNS;

  // Every way it needs has to exist, in this same column.
  for (let step = -above; step <= below; step += 1) {
    const at = index + step * COLUMNS;
    if (at < 0 || at >= last || at % COLUMNS !== column) return false;
  }

  // And none of them may be spoken for by another multi-module device. Written
  // from the cells alone, so it cannot call back into the span it is being
  // asked about: for each way it wants, look at every way a device could sit
  // in and still reach it, and this way itself never counts against it.
  for (let step = -above; step <= below; step += 1) {
    const wanted = index + step * COLUMNS;
    for (let offset = -2; offset <= 1; offset += 1) {
      const at = wanted + offset * COLUMNS;
      if (at === index) continue;
      const other = section.cells[at]?.state ?? "EMPTY";
      if (!isThreePhase(other)) continue;
      const reach = extentOf(other);
      if (-offset >= -reach.above && -offset <= reach.below) return false;
    }
  }
  return true;
}

/** Kept for the three-module case, which is what most callers mean. */
export function fitsThreePhase(section: BoardSection, index: number): boolean {
  return fitsAt(section, index, "BREAKER_3P");
}

/** What the instrument's three records are called, in the order they're taken. */
export const PHASES = ["L1", "L2", "L3"] as const;

export function nextState(state: CellState, inExtras = false): CellState {
  const cycle = inExtras ? EXTRA_CYCLE : GRID_CYCLE;
  // A way holding something the cycle no longer offers — an RCD drawn into
  // the grid before that was stopped — starts the cycle again rather than
  // sticking.
  const at = cycle.indexOf(state);
  return cycle[(at + 1) % cycle.length];
}

/**
 * The next thing that will actually fit here.
 *
 * A three-phase device needs the way above and the way below, so at the top or
 * the bottom of a column, or beside another one, the cycle steps over it
 * rather than stopping on something that could not physically be there.
 */
export function nextFitting(section: BoardSection, index: number): CellState {
  let next = nextState(section.cells[index].state);
  for (let guard = 0; guard < GRID_CYCLE.length; guard += 1) {
    if (fitsAt(section, index, next)) return next;
    next = nextState(next);
  }
  return "EMPTY";
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
  if (!KNOWN.includes(raw.state as CellState) || raw.state === "EMPTY") return null;

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
    state: KNOWN.includes(raw.state as CellState) ? (raw.state as CellState) : "EMPTY",
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
  const breakers = count("BREAKER") + count("BREAKER_3P");
  const rcds = count("RCD") + count("RCD_3P");
  const rcbos = count("RCBO") + count("RCBO_3P");
  const contactors = count("CONTACTOR") + count("CONTACTOR_3P");
  if (breakers) parts.push(`${breakers} breaker${breakers === 1 ? "" : "s"}`);
  if (rcds) parts.push(`${rcds} RCD${rcds === 1 ? "" : "s"}`);
  if (rcbos) parts.push(`${rcbos} RCBO${rcbos === 1 ? "" : "s"}`);
  if (contactors) parts.push(`${contactors} contactor${contactors === 1 ? "" : "s"}`);
  return parts.join("  ·  ") || "Not drawn up yet";
}
