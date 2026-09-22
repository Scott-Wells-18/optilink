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
  const { board, client, site, contact } = context;
  const at = `${board} at ${site}`;
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
