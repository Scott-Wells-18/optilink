/**
 * Deciding whether two names are the same place.
 *
 * The instrument's site and board names are typed on its own keypad, in a
 * hurry, at a switchboard — so they are never going to match the record
 * character for character. "DB1" against "Distribution Board 1" is the same
 * board; "meal room" against "lunch room" is the same room. Neither is worth
 * stopping the operator for.
 *
 * "DB1" against "meal room" is a different board, and that has to be caught:
 * a report carrying one board's name and another board's readings is worse
 * than no report at all.
 *
 * So names are reduced to what they actually say — trade shorthand spelled
 * out, the words a room is variously called folded together, the filler words
 * everything shares thrown away — and then compared on what is left.
 */

/** Trade shorthand, spelled out. Matched on a whole word. */
const EXPANSIONS: Record<string, string> = {
  db: "distribution board",
  dbs: "distribution board",
  sb: "switchboard",
  swbd: "switchboard",
  swb: "switchboard",
  msb: "main switchboard",
  mssb: "main switchboard",
  dist: "distribution",
  distro: "distribution",
  bd: "board",
  brd: "board",
  pnl: "panel",
  mech: "mechanical",
  elec: "electrical",
  ac: "air conditioning",
  hvac: "air conditioning",
  lv: "low voltage",
  hv: "high voltage",
  ups: "uninterruptible supply",
  gpo: "outlet",
  lt: "lighting",
  ltg: "lighting",
  pwr: "power",
  gnd: "ground",
  grd: "ground",
  lvl: "level",
  flr: "floor",
  bldg: "building",
  wh: "warehouse",
  ws: "workshop",
  amen: "amenities",
  admin: "administration",
  stn: "station",
  cb: "breaker",
  mcb: "breaker",
  rcbo: "rcd",
};

/**
 * Words for the same place. Everything in a group folds to the group's first
 * word, so a crib room and a meal room stop disagreeing.
 */
const SYNONYMS: string[][] = [
  ["meal", "lunch", "crib", "smoko", "dining", "mess"],
  ["amenities", "toilet", "toilets", "bathroom", "washroom", "ablution", "ablutions", "wc"],
  ["store", "storage", "storeroom"],
  ["workshop", "works"],
  ["office", "admin", "administration"],
  ["kitchen", "kitchenette"],
  ["carpark", "car", "parking", "garage"],
  ["reception", "foyer", "lobby", "entry"],
  ["plant", "plantroom", "mechanical"],
  ["switchroom", "switch"],
  ["depot", "yard"],
  ["ground", "gf"],
  ["first", "1st"],
  ["second", "2nd"],
  ["third", "3rd"],
];

/**
 * Words that say nothing about which place this is. Every board is a board;
 * "DB1" and "DB2" are told apart by the number, never by the word.
 */
const FILLER = new Set([
  "board",
  "distribution",
  "switchboard",
  "panel",
  "room",
  "the",
  "and",
  "of",
  "at",
  "no",
  "number",
  "main",
  "sub",
  "unit",
  "area",
  "level",
  "floor",
  "building",
  "site",
  "rcd",
  "breaker",
  "test",
  "tests",
]);

const SYNONYM_OF = new Map<string, string>();
for (const group of SYNONYMS) {
  for (const word of group) if (!SYNONYM_OF.has(word)) SYNONYM_OF.set(word, group[0]);
}

export type NameParts = {
  /** The words that say which place this is, filler and shorthand resolved. */
  words: Set<string>;
  /** Every number in the name — "DB1" and "DB2" are not the same board. */
  numbers: Set<string>;
  /** True when nothing at all was written. */
  empty: boolean;
};

/** Pulls a name apart into the bits worth comparing. */
export function nameParts(raw: string): NameParts {
  const tokens = raw
    .toLowerCase()
    // "DB1" is two tokens, not one; so is "level2".
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const words = new Set<string>();
  const numbers = new Set<string>();

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      // Leading zeros are the keypad's, not the board's.
      numbers.add(String(Number.parseInt(token, 10)));
      continue;
    }
    const expanded = (EXPANSIONS[token] ?? token).split(" ");
    for (const part of expanded) {
      const canonical = SYNONYM_OF.get(part) ?? part;
      if (!FILLER.has(canonical)) words.add(canonical);
    }
  }

  return { words, numbers, empty: tokens.length === 0 };
}

/**
 * True when two names are near enough to be the same place.
 *
 * A number that disagrees settles it on its own — DB1 is not DB2, whatever
 * else the two names share. Past that, the names match when the shorter one's
 * distinctive words are all in the longer one, or when a single distinctive
 * word each side is a near-enough spelling of the other.
 */
export function namesMatch(a: string, b: string): boolean {
  const left = nameParts(a);
  const right = nameParts(b);

  // Nothing written on one side is nothing to disagree with.
  if (left.empty || right.empty) return true;

  // "DB1" against "DB2": same words, different board.
  if (left.numbers.size > 0 && right.numbers.size > 0) {
    const shared = [...left.numbers].some((value) => right.numbers.has(value));
    if (!shared) return false;
  }

  // Neither name says anything but its number, which agreed above if there
  // was one: "DB1" against "Distribution Board 1", or "Main Board" against
  // "Switchboard". There is nothing left to disagree about.
  if (left.words.size === 0 && right.words.size === 0) return true;

  // One side is only its number. That matches "1" against "DB 1", but never
  // "DB1" against "meal room" — a number is not a room.
  if (left.words.size === 0 || right.words.size === 0) {
    return left.numbers.size > 0 && right.numbers.size > 0;
  }

  const small = left.words.size <= right.words.size ? left.words : right.words;
  const large = small === left.words ? right.words : left.words;

  const covered = [...small].filter(
    (word) => large.has(word) || [...large].some((other) => closeEnough(word, other)),
  ).length;

  return covered === small.size;
}

/** A keypad's spelling of the same word: "meeting"/"meating", "kogarah"/"kogorah". */
function closeEnough(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  if (a.length < 4 || b.length < 4) return false;
  return distance(a, b) <= (Math.min(a.length, b.length) >= 7 ? 2 : 1);
}

/** Levenshtein, one row at a time. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}
