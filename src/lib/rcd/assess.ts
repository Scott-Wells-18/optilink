import { RCD_KIND_LIMITS, type RcdLimits } from "@/lib/standards/rcd";
import type { Reading, RcdRow } from "@/lib/rcd/parse";

/**
 * Judging a set of readings against the standard.
 *
 * The limits come from AS/NZS 3017 Table 6.1 — maximum disconnection times —
 * together with the requirement that a device must NOT operate at half its
 * rated residual current. Every number here can be overridden from settings,
 * because the edition of the standard on the shelf is the one that counts.
 */

export type RcdKindKey = keyof typeof RCD_KIND_LIMITS;

export type Verdict = "PASS" | "CONCERN" | "FAIL";

/** Where each figure comes from, printed beside the limits in the report. */
export const LIMIT_SOURCE =
  "AS/NZS 3017 Table 6.1 — maximum disconnection times. The operating-button check is required by AS/NZS 3000 Clause 8.";

export type Tuning = {
  limits: Record<RcdKindKey, RcdLimits>;
  /** A reading at or above this share of its limit is a concern. */
  concernPercent: number;
};

export const DEFAULT_TUNING: Tuning = {
  limits: RCD_KIND_LIMITS,
  concernPercent: 80,
};

/**
 * Which row of the table applies, from what the instrument recorded: its
 * rated residual current, and whether it called the device selective.
 */
export function kindFor(row: {
  ratingMa: number | null;
  selective: boolean;
}): RcdKindKey {
  if (row.selective) return "DELAYED";
  const rating = row.ratingMa ?? 30;
  if (rating <= 10) return "TYPE_I";
  if (rating <= 30) return "TYPE_II";
  return "TYPE_III";
}

export type Assessment = {
  verdict: Verdict;
  reasons: string[];
  kind: RcdKindKey;
  limits: RcdLimits;
};

/** The worse of the two phases — a device has to pass on both. */
function worst(a: Reading, b: Reading): Reading {
  const values = [a, b].filter((reading) => reading !== null) as Exclude<Reading, null>[];
  if (values.length === 0) return null;
  if (values.some((reading) => reading === "NO_TRIP")) return "NO_TRIP";
  return Math.max(...(values as number[]));
}

export function assessRow(row: RcdRow, tuning: Tuning = DEFAULT_TUNING): Assessment {
  const kind = kindFor(row);
  const limits = tuning.limits[kind];
  const reasons: string[] = [];
  let verdict: Verdict = "PASS";

  const fail = (reason: string) => {
    reasons.push(reason);
    verdict = "FAIL";
  };
  const concern = (reason: string) => {
    reasons.push(reason);
    if (verdict !== "FAIL") verdict = "CONCERN";
  };

  // Half rated current: the device must hold. Tripping here means it will
  // nuisance-trip in service.
  const half = worst(row.halfAt0, row.halfAt180);
  if (typeof half === "number") {
    fail(`Tripped at half rated current (${half} ms); it should not operate.`);
  }

  const checks: [Reading, number | null, number | null, string][] = [
    [worst(row.ratedAt0, row.ratedAt180), limits.maxAtRatedMs, limits.minAtRatedMs, "at rated current"],
    [worst(row.fiveAt0, row.fiveAt180), limits.maxAt5xMs, null, "at five times rated current"],
  ];

  let measured = false;
  for (const [reading, max, min, where] of checks) {
    if (reading === null || max === null) continue;
    if (reading === "NO_TRIP") {
      fail(`Did not trip ${where}.`);
      continue;
    }
    measured = true;
    if (reading > max) {
      fail(`${reading} ms ${where}, over the ${max} ms limit.`);
      continue;
    }
    if (min !== null && reading < min) {
      fail(`${reading} ms ${where}, under the ${min} ms minimum for a time-delayed device.`);
      continue;
    }
    if (reading >= (max * tuning.concernPercent) / 100) {
      concern(
        `${reading} ms ${where}, within ${100 - tuning.concernPercent}% of the ${max} ms limit.`,
      );
    }
  }

  // Touch voltage above the instrument's limit is a fault in its own right.
  if (
    row.touchVolts !== null &&
    row.limitVolts !== null &&
    row.touchVolts > row.limitVolts
  ) {
    fail(`Touch voltage ${row.touchVolts} V, over the ${row.limitVolts} V limit.`);
  }

  if (!measured && verdict === "PASS") {
    return {
      verdict: "CONCERN",
      reasons: ["No trip time was recorded for this device."],
      kind,
      limits,
    };
  }

  if (reasons.length === 0) reasons.push("Within limits at every test current.");
  return { verdict, reasons, kind, limits };
}

/** How a reading prints in the results table. */
export function showReading(reading: Reading): string {
  if (reading === null) return "—";
  if (reading === "NO_TRIP") return "No trip";
  return `${reading} ms`;
}
