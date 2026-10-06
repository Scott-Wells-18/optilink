/**
 * How every OptiLink report looks.
 *
 * The palette is the brand's own, not a document template's: the logo is black
 * type beside a blue arc, and the app already names those colours as tokens in
 * globals.css. The reports use the same three so a report and the dashboard
 * that produced it are recognisably the same company.
 *
 * Severity keeps red, amber and green — those have to mean what they mean.
 */

export const PAGE = { width: 595.28, height: 841.89 } as const;
export const MARGIN = 42;
export const CONTENT = PAGE.width - MARGIN * 2;

export const COLOURS = {
  /** Body text. --ink */
  ink: "#0a1d2e",
  /** Softer body text, for notes and captions. */
  inkSoft: "#4a6072",
  /** Header bars and table heads. --accent-deep */
  bar: "#14528f",
  /** Text on a header bar. */
  onBar: "#ffffff",
  /** Title and scope blocks on the cover. A tint of the accent. */
  band: "#d7eef9",
  /** Rules, key lines, small marks. --accent */
  accent: "#1b9bd8",
  /** Hairlines inside tables. */
  hair: "#c7d6e2",
  /** Zebra striping and inset panels. */
  soft: "#f2f7fb",
  /** Photo and image wells. */
  well: "#f5f8fa",
  /** Corrective-action blocks and anything that has to alarm. */
  alert: "#c0272d",
} as const;

export const SEVERITY = {
  fail: { fill: "#d7262d", ink: "#ffffff" },
  concern: { fill: "#f0a020", ink: "#111111" },
  pass: { fill: "#1f9254", ink: "#ffffff" },
  none: { fill: "#e6edf3", ink: "#0a1d2e" },
} as const;

export function shortDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function longDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function timeOfDay(date: Date): string {
  return date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

/** A year on from a survey — when the next one falls due. */
export function yearAfter(date: Date): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * Text bound for a PDF page.
 *
 * The reports are set in Helvetica, one of the fonts every reader has built
 * in — which is worth having, but it can only carry the WinAnsi character set.
 * A site name pasted out of a spreadsheet or a circuit labelled with a Greek
 * letter would otherwise come out as rubbish or throw, so anything outside
 * that set is folded down to the nearest thing that is in it.
 *
 * A unit is never dropped. Deleting the omega off "200 MΩ" leaves "200 M",
 * which on a test report reads as a number with no unit, so the units that
 * turn up in this trade are written out in words rather than removed.
 */
const SUBSTITUTIONS: [RegExp, string][] = [
  /*
   * The units first, because dropping one is worse than spelling it.
   *
   * WinAnsi has no omega, so "2.4 \u03a9" came out as "2.4" and "> 200 M\u03a9" as
   * "> 200 M" \u2014 a resistance with its unit deleted, on a report whose whole
   * subject is resistance. It is written out instead: "2.4 ohm", "200 Mohm",
   * which is what it would be said as anyway. The prefix is kept against the
   * word so the pair cannot be split over a line break.
   */
  [/([MkGm])\s*[\u03a9\u2126]/g, "$1ohm"],
  [/[\u03a9\u2126]/g, "ohm"],
  // Greek mu is not in WinAnsi; the micro sign is. "10 \u03bcF" must stay 10 \u00b5F.
  [/\u03bc/g, "\u00b5"],
  [/[\u03a6\u03d5\u0444]/g, "ph"], // phase
  [/[\u2206\u0394]/g, "d"], // increment, delta
  [/\u2264/g, "<="],
  [/\u2265/g, ">="],
  [/\u2248/g, "~"],
  [/\u00b7/g, "\u00b7"], // middle dot is in WinAnsi, kept as written
  [/[\u2192\u21d2]/g, "->"],
  [/\u2190/g, "<-"],
  [/[\u2032\u2035]/g, "'"], // prime, for feet and minutes
  [/[\u2033\u2036]/g, '"'], // double prime, for inches and seconds
  [/[\u2010\u2011\u2012\u2015]/g, "-"], // the hyphens WinAnsi lacks
  [/\u00a0/g, " "],
];

/**
 * WinAnsi carries more than Latin-1: the dashes, curly quotes, the ellipsis
 * and a handful of others are all there, so they are kept rather than flattened.
 */
const ALLOWED_ABOVE_LATIN1 =
  "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152" +
  "\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a" +
  "\u0153\u017e\u0178";

export function safe(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  // Anything still outside the set has no sensible stand-in, so it goes.
  const keep = new RegExp(`[^\\u0000-\\u00ff${ALLOWED_ABOVE_LATIN1}]`, "g");
  return out.replace(keep, "");
}
