import type { IssueType } from "@/lib/issues";

/**
 * How a finding is ranked.
 *
 * The rank comes from the temperature rise — the hot spot measured against a
 * reference away from it — following the Infraspection Institute's
 * experience-based criteria for electrical and rotating equipment. Nothing
 * here is a judgement call: two numbers off the thermogram decide it.
 */

export type Priority = "P1" | "P2" | "P3" | "P4" | "INFO" | "NONE";

export const PRIORITY_BANDS: {
  priority: Priority;
  band: string;
  range: string;
  action: string;
  colour: string;
  /** The flatter, louder colour the printed report uses for the band. */
  print: string;
  printInk: string;
}[] = [
  {
    priority: "INFO",
    print: "#d9d9d9",
    printInk: "#111111",
    band: "INFORMATION",
    range: "N/A",
    action: "For client information; thermogram taken for information or reference.",
    colour: "#8894a3",
  },
  {
    priority: "P4",
    print: "#9fe6a0",
    printInk: "#111111",
    band: "MONITOR",
    range: "0 to 10°C",
    action: "Possible deficiency and warrants further monitoring.",
    colour: "#2f8f4e",
  },
  {
    priority: "P3",
    print: "#29abe2",
    printInk: "#111111",
    band: "MODERATE",
    range: "10 to 20°C",
    action: "Indicates deficiency; repair as time permits.",
    colour: "#c8991a",
  },
  {
    priority: "P2",
    print: "#f7941e",
    printInk: "#111111",
    band: "HIGH",
    range: "20 to 40°C",
    action: "Corrective measures required ASAP.",
    colour: "#dd6b20",
  },
  {
    priority: "P1",
    print: "#ed1c24",
    printInk: "#ffffff",
    band: "EXTREME",
    range: "40°C and above",
    action: "Corrective measures required immediately.",
    colour: "#d22630",
  },
];

/** The rise itself: the hot spot above the reference beside it. */
export function temperatureRise(
  refTemp: number | null | undefined,
  hotTemp: number | null | undefined,
): number | null {
  if (typeof refTemp !== "number" || typeof hotTemp !== "number") return null;
  return Math.round((hotTemp - refTemp) * 10) / 10;
}

export function priorityFor(
  type: IssueType,
  rise: number | null,
): Priority {
  // A repaired or replaced part is carried in the report for the record, and
  // is ranked with a dash rather than a priority.
  if (type === "REPAIRED") return "NONE";
  // Dust is not a temperature finding; it is filed as a deficiency to be put
  // right as time permits, which is where the moderate band sits.
  if (type === "DUST_INGRESS") return "P3";
  if (rise === null) return "INFO";
  if (rise >= 40) return "P1";
  if (rise >= 20) return "P2";
  if (rise >= 10) return "P3";
  return "P4";
}

export function bandFor(priority: Priority) {
  return PRIORITY_BANDS.find((entry) => entry.priority === priority) ?? PRIORITY_BANDS[0];
}

/** How the priority is printed: "P1", or a dash for a repair. */
export function priorityLabel(priority: Priority): string {
  if (priority === "NONE") return "-";
  if (priority === "INFO") return "Info";
  return priority;
}

/** P1 first, repairs last — the order the report is laid out in. */
export const PRIORITY_ORDER: Priority[] = ["P1", "P2", "P3", "P4", "INFO", "NONE"];

/** A repair carries no band, so it prints as a yellow dash. */
export const REPAIRED_PRINT = { print: "#fff200", printInk: "#111111" };

export function printColours(priority: Priority) {
  return priority === "NONE" ? REPAIRED_PRINT : bandFor(priority);
}
