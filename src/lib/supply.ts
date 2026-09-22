/**
 * A switchboard's own details: where it stands, and what feeds it.
 *
 * A recording of current only means something next to the thing that limits
 * it. Seventy amps is comfortable behind a 100 A main and a serious problem
 * behind an 80 A one, and the same seventy amps at the end of a long thin
 * submain is a voltage drop question as well as a capacity one. So a board
 * carries where it is fed from, what device is in front of it, the cables that
 * reach it and how far they run, and the power analysis quotes all of it.
 *
 * It also carries the area it is in, because a depot has several boards and
 * "the main switchboard" is not a place anyone can be sent to.
 *
 * Held as JSON on the board rather than as columns: it is written once when
 * the board is drawn, read by the report, and never queried.
 */

/** Fed straight off the network — a pillar, a pole, or the street main. */
export const STREET = "STREET";

export type Supply = {
  /** The part of the site the board stands in — "Workshop, north wall". */
  area: string | null;
  /** `STREET`, the id of another board at the same site, or null. */
  fedFrom: string | null;
  /** Said in words where it is neither the street nor a board on the list. */
  fedFromNote: string | null;
  /** The length of the run that feeds it, in metres. */
  lengthM: number | null;
  /** The device in front of the board — "100 A HRC fuse", "63 A MCB". */
  protectiveDevice: string | null;
  /** The active conductors of the feed — "25 mm² Cu XLPE". */
  activeCable: string | null;
  /** The neutral, which is not always the same size as the actives. */
  neutralCable: string | null;
};

export const EMPTY_SUPPLY: Supply = {
  area: null,
  fedFrom: null,
  fedFromNote: null,
  lengthM: null,
  protectiveDevice: null,
  activeCable: null,
  neutralCable: null,
};

/** Whatever came out of the database, as a `Supply`. */
export function normaliseSupply(value: unknown): Supply {
  if (!value || typeof value !== "object") return { ...EMPTY_SUPPLY };
  const raw = value as Record<string, unknown>;

  const length = Number(raw.lengthM);
  return {
    area: text(raw.area, 160),
    fedFrom: text(raw.fedFrom, 40),
    fedFromNote: text(raw.fedFromNote, 160),
    lengthM: Number.isFinite(length) && length > 0 ? Math.round(length * 10) / 10 : null,
    protectiveDevice: text(raw.protectiveDevice, 80),
    activeCable: text(raw.activeCable, 80),
    neutralCable: text(raw.neutralCable, 80),
  };
}

/**
 * What is still missing before a report can be issued off this board.
 *
 * A power analysis is read against the board it was taken on. Half of the
 * detail gives half an answer, and a report that quietly says "not recorded"
 * against the protective device is a report that cannot say anything about
 * headroom at all — so the whole set is required, and the download says which
 * pieces are short rather than producing something hollow.
 */
export function missingFrom(supply: Supply): string[] {
  const missing: string[] = [];
  if (!supply.area) missing.push("the area it is in");
  if (!supply.fedFrom && !supply.fedFromNote) missing.push("where it is fed from");
  if (supply.lengthM === null) missing.push("the length of the run");
  if (!supply.protectiveDevice) missing.push("the protective device");
  if (!supply.activeCable) missing.push("the mains active size");
  if (!supply.neutralCable) missing.push("the mains neutral size");
  return missing;
}

/** "a, b and c" — a list as it would be said out loud. */
export function inWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

/** True where nothing has been filled in, so the report can say so plainly. */
export function isBlank(supply: Supply): boolean {
  return Object.values(supply).every((value) => value === null);
}

/**
 * Where the board is fed from, in words.
 *
 * `boards` is the other switchboards at the same site, so a feed from one of
 * them reads as its name rather than as an id.
 */
export function describeFeed(
  supply: Supply,
  boards: { id: string; name: string }[],
): string | null {
  if (supply.fedFrom === STREET) return "The street supply";
  if (supply.fedFrom) {
    const board = boards.find((item) => item.id === supply.fedFrom);
    if (board) return board.name;
  }
  return supply.fedFromNote;
}

/** "42 m" — the run, where it was recorded. */
export function describeLength(supply: Supply): string | null {
  return supply.lengthM === null ? null : `${supply.lengthM} m`;
}
