/**
 * Sections on an amp report.
 *
 * Three phases of the one board are three recordings and belong together. So a
 * recording can be put in a named section, and the ones sharing a name are
 * numbered as one: the section takes the number a standalone recording would
 * have taken, and its own are lettered under it.
 *
 *   1.  Pit Jacks Distribution Board
 *       a.  A-Phase
 *       b.  B-Phase
 *       c.  C-Phase
 *   2.  Shed Main
 *
 * A section sits where its first recording sits, so the order of the report is
 * still the order the recordings are in. A recording put in a section after the
 * others moves up to join them rather than splitting the section in two — a
 * section printed twice under two numbers is not a section.
 */

/** What a recording needs for this to work: a name, and maybe a section. */
export type Groupable = { groupName?: string | null };

/** One line of the report's numbering, in the order it is printed. */
export type Numbered<T> = {
  item: T;
  /** "1." standing alone, or "a." inside a section. */
  label: string;
  /** The section it belongs to, or null where it stands on its own. */
  group: string | null;
  /** The section's own number, for the heading above it. */
  groupNumber: number | null;
  /** True on the first recording of a section, which carries its heading. */
  opensGroup: boolean;
};

/** "Pit Jacks DB" and "pit jacks db" are the same section. */
function key(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  return trimmed ? trimmed.toLocaleLowerCase() : null;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** "a", "b", … "z", "aa", "ab" — a section of more than twenty-six still reads. */
function letter(at: number): string {
  let out = "";
  let n = at;
  do {
    out = LETTERS[n % 26] + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * The recordings in printing order, each with the number it is printed under.
 *
 * The sections are found first, so a recording added to a section later still
 * prints with the rest of it. Everything else keeps the order it was given.
 */
export function numberRecordings<T extends Groupable>(rows: T[]): Numbered<T>[] {
  // Where each section starts, by the first recording that is in it.
  const firstAt = new Map<string, number>();
  rows.forEach((row, at) => {
    const group = key(row.groupName);
    if (group && !firstAt.has(group)) firstAt.set(group, at);
  });

  // Each section's recordings gathered behind its first, and everything else
  // left where it is.
  const order: { group: string | null; rows: T[] }[] = [];
  const slots = new Map<string, { group: string | null; rows: T[] }>();
  for (const row of rows) {
    const group = key(row.groupName);
    if (!group) {
      order.push({ group: null, rows: [row] });
      continue;
    }
    const held = slots.get(group);
    if (held) {
      held.rows.push(row);
      continue;
    }
    const slot = { group: row.groupName?.trim() ?? null, rows: [row] };
    slots.set(group, slot);
    order.push(slot);
  }

  const out: Numbered<T>[] = [];
  order.forEach((slot, index) => {
    const number = index + 1;
    if (slot.group === null) {
      out.push({
        item: slot.rows[0],
        label: `${number}.`,
        group: null,
        groupNumber: null,
        opensGroup: false,
      });
      return;
    }
    slot.rows.forEach((row, at) => {
      out.push({
        item: row,
        label: `${letter(at)}.`,
        group: slot.group,
        groupNumber: number,
        opensGroup: at === 0,
      });
    });
  });
  return out;
}

/** The sections on a report, for offering them back when another is added. */
export function groupNames(rows: Groupable[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const name = row.groupName?.trim();
    if (!name) continue;
    const at = name.toLocaleLowerCase();
    if (!seen.has(at)) seen.set(at, name);
  }
  return [...seen.values()];
}
