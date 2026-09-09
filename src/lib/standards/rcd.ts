import type { RcdKind } from "@prisma/client";

/**
 * RCD verification against AS/NZS 3017 (Electrical installations — Verification
 * guidelines), Table 6.1 — maximum disconnection times, together with the
 * ramp-test acceptance range in AS/NZS 3017 and the operating-button check
 * required by AS/NZS 3000 Clause 8.
 *
 * Limits are stated as maximum permitted trip times in milliseconds.
 */

export type RcdLimits = {
  kindLabel: string;
  description: string;
  /** Maximum trip time at the rated residual current (I∆n). */
  maxAtRatedMs: number;
  /** Maximum trip time at 5 × I∆n. Null when the test does not apply. */
  maxAt5xMs: number | null;
  /** Minimum trip time — only time-delayed (S-type) devices have one. */
  minAtRatedMs: number | null;
};

export const RCD_KIND_LIMITS: Record<RcdKind, RcdLimits> = {
  TYPE_I: {
    kindLabel: "Type I (≤ 10 mA)",
    description: "High-sensitivity RCD, typically 10 mA.",
    maxAtRatedMs: 40,
    maxAt5xMs: 40,
    minAtRatedMs: null,
  },
  TYPE_II: {
    kindLabel: "Type II (≤ 30 mA)",
    description: "Standard 30 mA personal-protection RCD or RCBO.",
    maxAtRatedMs: 300,
    maxAt5xMs: 40,
    minAtRatedMs: null,
  },
  TYPE_III: {
    kindLabel: "Type III (> 30 mA)",
    description: "Equipment or fire-protection RCD, typically 100–300 mA.",
    maxAtRatedMs: 300,
    maxAt5xMs: 40,
    minAtRatedMs: null,
  },
  DELAYED: {
    kindLabel: "Time-delayed (S-type)",
    description:
      "Selective / time-delayed RCD used upstream so downstream devices trip first.",
    maxAtRatedMs: 500,
    maxAt5xMs: 150,
    minAtRatedMs: 130,
  },
};

export type RcdCheck = {
  name: string;
  value: string;
  limit: string;
  pass: boolean | null; // null = not tested
};

export type RcdAssessment = {
  limits: RcdLimits;
  checks: RcdCheck[];
  /** null when nothing has been tested yet. */
  pass: boolean | null;
  overridden: boolean;
  failureReasons: string[];
  plainEnglish: string;
  /** Acceptable ramp-trip window, e.g. "15 – 30 mA". */
  rampWindow: { min: number; max: number };
};

function ms(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value} ms` : "—";
}

export function assessRcd(input: {
  rcdKind: RcdKind;
  ratedCurrentMa: number;
  tripTimeRatedMs?: number | null;
  tripTime5xMs?: number | null;
  rampTripMa?: number | null;
  pushButtonOk?: boolean | null;
  notRequired?: boolean;
  resultOverride?: boolean | null;
}): RcdAssessment {
  const limits = RCD_KIND_LIMITS[input.rcdKind];
  // AS/NZS 3017 ramp test: the device should release between 50% and 100% of
  // its rated residual current.
  const rampWindow = {
    min: Math.round(input.ratedCurrentMa * 0.5 * 10) / 10,
    max: input.ratedCurrentMa,
  };

  const checks: RcdCheck[] = [];
  const failureReasons: string[] = [];

  if (input.notRequired) {
    return {
      limits,
      checks,
      pass: null,
      overridden: false,
      failureReasons: [],
      plainEnglish:
        "This device was recorded as not tested — see the note against it for the reason.",
      rampWindow,
    };
  }

  // Trip time at rated residual current.
  const rated = numeric(input.tripTimeRatedMs);
  if (rated === null) {
    checks.push({
      name: `Trip time at ${input.ratedCurrentMa} mA (I∆n)`,
      value: "—",
      limit: limitText(limits.minAtRatedMs, limits.maxAtRatedMs),
      pass: null,
    });
  } else {
    const tooSlow = rated > limits.maxAtRatedMs;
    const tooFast = limits.minAtRatedMs !== null && rated < limits.minAtRatedMs;
    const ok = !tooSlow && !tooFast;
    checks.push({
      name: `Trip time at ${input.ratedCurrentMa} mA (I∆n)`,
      value: ms(rated),
      limit: limitText(limits.minAtRatedMs, limits.maxAtRatedMs),
      pass: ok,
    });
    if (tooSlow) {
      failureReasons.push(
        `took ${rated} ms to trip at its rated current, against a limit of ${limits.maxAtRatedMs} ms`,
      );
    }
    if (tooFast) {
      failureReasons.push(
        `tripped in ${rated} ms, faster than the ${limits.minAtRatedMs} ms minimum for a time-delayed device (it may not be discriminating with downstream RCDs)`,
      );
    }
  }

  // Trip time at 5 × rated residual current.
  if (limits.maxAt5xMs !== null) {
    const fivex = numeric(input.tripTime5xMs);
    const fivexCurrent = Math.round(input.ratedCurrentMa * 5 * 10) / 10;
    if (fivex === null) {
      checks.push({
        name: `Trip time at ${fivexCurrent} mA (5 × I∆n)`,
        value: "—",
        limit: `≤ ${limits.maxAt5xMs} ms`,
        pass: null,
      });
    } else {
      const ok = fivex <= limits.maxAt5xMs;
      checks.push({
        name: `Trip time at ${fivexCurrent} mA (5 × I∆n)`,
        value: ms(fivex),
        limit: `≤ ${limits.maxAt5xMs} ms`,
        pass: ok,
      });
      if (!ok) {
        failureReasons.push(
          `took ${fivex} ms to trip at five times its rated current, against a limit of ${limits.maxAt5xMs} ms`,
        );
      }
    }
  }

  // Ramp test.
  const ramp = numeric(input.rampTripMa);
  if (ramp !== null) {
    const ok = ramp >= rampWindow.min && ramp <= rampWindow.max;
    checks.push({
      name: "Ramp test (operating current)",
      value: `${ramp} mA`,
      limit: `${rampWindow.min} – ${rampWindow.max} mA`,
      pass: ok,
    });
    if (!ok) {
      failureReasons.push(
        ramp > rampWindow.max
          ? `only released at ${ramp} mA, above its rated ${input.ratedCurrentMa} mA (it is letting more leakage through than it should)`
          : `released at ${ramp} mA, below half its rated current (it is likely to nuisance-trip)`,
      );
    }
  }

  // Operating (test) button.
  if (input.pushButtonOk !== null && input.pushButtonOk !== undefined) {
    checks.push({
      name: "Operating (test) button",
      value: input.pushButtonOk ? "Operated correctly" : "Did not operate",
      limit: "Must operate",
      pass: input.pushButtonOk,
    });
    if (!input.pushButtonOk) {
      failureReasons.push("did not trip when its own test button was pressed");
    }
  }

  const tested = checks.some((check) => check.pass !== null);
  const calculated = tested ? failureReasons.length === 0 : null;
  const pass = input.resultOverride ?? calculated;
  const overridden =
    input.resultOverride !== null && input.resultOverride !== undefined;

  return {
    limits,
    checks,
    pass,
    overridden,
    failureReasons,
    plainEnglish: explain(pass, failureReasons, input.ratedCurrentMa),
    rampWindow,
  };
}

function explain(
  pass: boolean | null,
  reasons: string[],
  ratedMa: number,
): string {
  if (pass === null) {
    return "This device has not been tested yet.";
  }
  if (pass) {
    return `This safety switch cut the power well within the time allowed by AS/NZS 3017. If someone contacted a live part, it would disconnect fast enough to protect them.`;
  }
  const detail = reasons.length
    ? ` It ${joinWithAnd(reasons)}.`
    : "";
  return `This safety switch did not meet the requirements of AS/NZS 3017.${detail} A ${ratedMa} mA RCD is what stands between a person and an electric shock, so a device that is slow or unreliable should be replaced before it is relied on again.`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function limitText(min: number | null, max: number): string {
  return min === null ? `≤ ${max} ms` : `${min} – ${max} ms`;
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
