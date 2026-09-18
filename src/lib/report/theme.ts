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
