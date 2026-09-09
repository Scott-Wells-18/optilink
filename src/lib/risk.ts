import type { RiskLevel } from "@prisma/client";

export const RISK_ORDER: RiskLevel[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export const RISK_META: Record<
  RiskLevel,
  {
    label: string;
    short: string;
    timeframe: string;
    /** Tailwind classes for the on-screen and printed badge. */
    badge: string;
    dot: string;
    hex: string;
    clientMeaning: string;
  }
> = {
  CRITICAL: {
    label: "Critical",
    short: "Act now",
    timeframe: "Immediately",
    badge: "bg-red-50 text-red-800 ring-1 ring-red-300",
    dot: "bg-red-600",
    hex: "#DC2626",
    clientMeaning:
      "There is a danger present right now. This needs to be made safe straight away.",
  },
  HIGH: {
    label: "High",
    short: "Within 7 days",
    timeframe: "Within 7 days",
    badge: "bg-orange-50 text-orange-800 ring-1 ring-orange-300",
    dot: "bg-orange-500",
    hex: "#EA580C",
    clientMeaning:
      "Not an emergency, but it will get worse and should be booked in this week.",
  },
  MEDIUM: {
    label: "Medium",
    short: "Within 30 days",
    timeframe: "Within 30 days",
    badge: "bg-amber-50 text-amber-800 ring-1 ring-amber-300",
    dot: "bg-amber-400",
    hex: "#D97706",
    clientMeaning:
      "Worth fixing at a convenient time, before it turns into a bigger job.",
  },
  LOW: {
    label: "Low",
    short: "Monitor",
    timeframe: "Monitor / next inspection",
    badge: "bg-sky-50 text-sky-800 ring-1 ring-sky-300",
    dot: "bg-sky-500",
    hex: "#0284C7",
    clientMeaning:
      "No action needed today. We have recorded it so we can compare next visit.",
  },
  INFO: {
    label: "Satisfactory",
    short: "No action",
    timeframe: "No action required",
    badge: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300",
    dot: "bg-emerald-500",
    hex: "#059669",
    clientMeaning: "Checked and found to be in good order.",
  },
};

/** Returns the most severe of the given levels, or null when there are none. */
export function highestRisk(levels: Array<RiskLevel | null | undefined>): RiskLevel | null {
  for (const level of RISK_ORDER) {
    if (levels.some((candidate) => candidate === level)) return level;
  }
  return null;
}

export function riskRank(level: RiskLevel): number {
  return RISK_ORDER.indexOf(level);
}
