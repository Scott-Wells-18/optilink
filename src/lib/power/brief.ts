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
  HEADROOM: "Current Headroom",
  DRAW: "Current Draw",
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
 * The objective, in paragraphs.
 *
 * The board, the area, the site, the client and whoever asked are dropped into
 * a fixed template; nothing about the installation is written into the wording
 * itself. What the wording is careful about is the difference between four
 * things a client will otherwise read as one: the current the logger recorded,
 * the arithmetic difference between that and the protective device, the
 * maximum demand of the installation, and how much load may actually be added.
 * Only the first of those is measured here, and the paragraphs say so.
 */
export function objective(context: BriefContext): string[] {
  const { board, area, client, site, contact } = context;
  // Named down to the room where the area is known, because "the main
  // switchboard at Kogarah Depot" is not somewhere anyone can be sent. The
  // area is printed exactly as it was typed: it is the name of a place on
  // that site, and "Workshop Area" is not "workshop Area".
  const at = `${board}${area ? ` in the ${area}` : ""}, ${site}`;
  const asked = contact ? ` The recording was requested by ${contact}.` : "";

  if (context.brief === "HEADROOM") {
    return [
      `The purpose of this recording is to measure the electrical current drawn at ${at} ` +
        `during the monitoring period, and to provide ${client} with information to assist in ` +
        `assessing the potential for additional electrical load.${asked}`,
      `The highest recorded phase current is compared with the rating of the protective ` +
        `device supplying the monitored board. The difference provides an indication of ` +
        `recorded current headroom under the operating conditions present during the ` +
        `monitoring period.`,
      `This comparison does not, by itself, determine the maximum demand of the installation ` +
        `or confirm the amount of additional load that may be connected.`,
    ];
  }

  return [
    `The purpose of this recording is to measure the electrical current drawn at ${at} while ` +
      `the installation operated under normal conditions, as a record of the installation for ` +
      `${client}.${asked}`,
    `It sets out the current carried by each phase and by the neutral across the monitoring ` +
      `period, how the load was shared between the phases, and when the highest demand was ` +
      `recorded.`,
    `The recorded data describes the electrical loading present during the monitoring period. ` +
      `It does not, by itself, determine the maximum demand of the installation or confirm ` +
      `the amount of additional load that may be connected.`,
  ];
}
