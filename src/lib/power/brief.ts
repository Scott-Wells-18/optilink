/**
 * Why the logger went on.
 *
 * Two jobs bring a logger to a board, and they are read differently. One asks
 * what is left — how much current is still available before the protection in
 * front of the board becomes the limit — and is the question behind every
 * "can we add this". The other asks what is being used, which is a record of
 * the installation rather than a question about it.
 *
 * The objective is written out on the report so the reader knows which of the
 * two they are holding before they reach the first chart.
 */

export const BRIEFS = ["HEADROOM", "DRAW"] as const;
export type Brief = (typeof BRIEFS)[number];

export const BRIEF_LABELS: Record<Brief, string> = {
  HEADROOM: "Current headroom",
  DRAW: "Current draw",
};

export const BRIEF_NOTES: Record<Brief, string> = {
  HEADROOM: "How much capacity is left for future load",
  DRAW: "What the installation is drawing now",
};

export function isBrief(value: unknown): value is Brief {
  return typeof value === "string" && (BRIEFS as readonly string[]).includes(value);
}

export type BriefContext = {
  brief: Brief;
  /** The board the logger was fitted to. */
  board: string;
  /** The part of the site that board stands in. */
  area: string | null;
  client: string;
  site: string;
  /** Who asked for the work, where anyone did. */
  contact: string | null;
};

/**
 * The objective, as a paragraph.
 *
 * Written as a statement of purpose rather than as a filled-in form: the
 * reader is a client, and "the objective is to read the current for" is not
 * how a report to a client reads.
 */
export function objective(context: BriefContext): string {
  const { board, area, client, site, contact } = context;
  // Named down to the room where the area is known, because "the main
  // switchboard at Kogarah Depot" is not somewhere anyone can be sent.
  const at = `${board}${area ? ` in the ${lower(area)}` : ""}, ${site}`;
  const asked = contact ? ` The recording was requested by ${contact}.` : "";

  if (context.brief === "HEADROOM") {
    return (
      `This recording was carried out to establish the spare current capacity available at ` +
      `${at}, so that ${client} can assess what further load the board is able to take. ` +
      `The highest current reached on each phase is read against the rating of the ` +
      `protective device feeding the board, and the difference between the two is the ` +
      `capacity remaining for future installations.${asked}`
    );
  }

  return (
    `This recording was carried out to establish the current drawn by ${at} under normal ` +
    `operating conditions, as a record of the installation for ${client}. It sets out what ` +
    `each phase and the neutral carried across the recording period, how the load was ` +
    `shared between the phases, and when the highest demand occurred.${asked}`
  );
}

/**
 * An area as it reads mid-sentence.
 *
 * It is typed as a label — "Workshop, north wall" — and dropped into a
 * sentence it becomes "in the Workshop, north wall". Only the first letter is
 * touched, and only where the rest of the word is lower case, so "Level 2
 * plant room" softens and "MSB room" is left alone.
 */
function lower(area: string): string {
  const [first, ...rest] = area;
  const word = area.split(/\s|,/)[0] ?? "";
  if (word.length > 1 && word.slice(1) !== word.slice(1).toLowerCase()) return area;
  return first.toLowerCase() + rest.join("");
}
