/**
 * What a thermal inspection can turn up at a position, and what has to be
 * photographed for each. Dust ingress is self-evident in one shot; everything
 * else wants the thermal image and a plain photo of the same thing, so the
 * report can put them side by side.
 */

export type IssueType =
  | "DUST_INGRESS"
  | "RISING_TEMPERATURE"
  | "TERMINATION_ISSUE"
  | "REPAIRED";

export type PhotoKind = "PLAIN" | "THERMAL" | "VISUAL";

export const ISSUE_TYPES: readonly IssueType[] = [
  "DUST_INGRESS",
  "RISING_TEMPERATURE",
  "TERMINATION_ISSUE",
  "REPAIRED",
];

/**
 * Dust is a state of the whole enclosure, not of one way in it, so it is
 * reported once from the board rather than offered against every position.
 *
 * A termination issue shows up as heat like any other, so it is not its own
 * finding any more — it is a cause of a rising temperature. The enum keeps the
 * value so findings recorded under it still read.
 */
export const POSITION_ISSUE_TYPES: readonly IssueType[] = [
  "RISING_TEMPERATURE",
  "REPAIRED",
];

/** A motor is reported on whole, so dust belongs here too. */
export const ITEM_ISSUE_TYPES: readonly IssueType[] = [
  "DUST_INGRESS",
  "RISING_TEMPERATURE",
  "REPAIRED",
];

export const ISSUE_LABELS: Record<IssueType, string> = {
  DUST_INGRESS: "Dust ingress",
  RISING_TEMPERATURE: "Rising temperature",
  TERMINATION_ISSUE: "Termination issue",
  REPAIRED: "Repaired",
};

export const ISSUE_NOTES: Record<IssueType, string> = {
  DUST_INGRESS: "Build-up on or around the device. One photo.",
  RISING_TEMPERATURE: "Running warmer than it should. Thermal and visual, then what is behind it.",
  TERMINATION_ISSUE: "Loose, discoloured or damaged termination.",
  REPAIRED: "Put right on the day. Thermal and visual.",
};

/* --- what is behind a rising temperature, and what to do about it --------- */

export type IssueCause = "INTERNAL_HEATING" | "TERMINAL_CONNECTION";

export const ISSUE_CAUSES: readonly IssueCause[] = [
  "INTERNAL_HEATING",
  "TERMINAL_CONNECTION",
];

export const CAUSE_LABELS: Record<IssueCause, string> = {
  INTERNAL_HEATING: "Internal heating",
  TERMINAL_CONNECTION: "Terminal connection",
};

/** Only a rising temperature is worked through to a cause and a fix. */
export function needsSurvey(type: IssueType): boolean {
  return type === "RISING_TEMPERATURE";
}

/**
 * The recommendation catalogue. Stored as keys rather than sentences, because
 * half of them name the device they are about — "replace the breaker",
 * "replace the contactor" — and that is only known where it is shown.
 */
const RECOMMENDATIONS: Record<string, (device: string) => string> = {
  REPLACE_DEVICE: (device) => `Replace the ${device}`,
  DISCONNECT_INSPECT: () => "Disconnect all cables and inspect for heat degradation damage",
  CLEAN_RETERMINATE: () => "Clean and reterminate",
  REPLACE_TERMINAL: (device) => `Replace the ${device} terminal connection`,
  CUT_BACK_CABLING: () => "Cut back or replace damaged cabling",
  RETERMINATE_CABLE: () => "Reterminate cable",
  REPLACE_CABLES_LENGTH: (device) =>
    `Replace cables into the board to allow more length to terminate into the ${device}`,
  CLEAN_CONDUCTORS: () => "Ensure all conductors and terminals are cleaned before reterminating",
  DISCONNECT_RELUG: () => "Disconnect, cut back cable and re-lug",
  CLEAN_TERMINAL_RETERMINATE: () => "Clean terminal and reterminate cable",
  MONITOR: () => "Continue to monitor equipment regularly",
};

const BY_CAUSE: Record<IssueCause, string[]> = {
  INTERNAL_HEATING: [
    "REPLACE_DEVICE",
    "DISCONNECT_INSPECT",
    "CLEAN_RETERMINATE",
    "MONITOR",
  ],
  TERMINAL_CONNECTION: [
    "REPLACE_TERMINAL",
    "CUT_BACK_CABLING",
    "RETERMINATE_CABLE",
    "REPLACE_CABLES_LENGTH",
    "CLEAN_CONDUCTORS",
    "DISCONNECT_RELUG",
    "CLEAN_TERMINAL_RETERMINATE",
    "MONITOR",
  ],
};

export const RECOMMENDATION_KEYS: readonly string[] = Object.keys(RECOMMENDATIONS);

/** What is on offer for a cause, worded for the device it is about. */
export function recommendationsFor(
  cause: IssueCause,
  device: string,
): { key: string; label: string }[] {
  return BY_CAUSE[cause].map((key) => ({ key, label: RECOMMENDATIONS[key](device) }));
}

/** One stored recommendation, put back into words. */
export function recommendationText(key: string, device: string): string {
  return RECOMMENDATIONS[key]?.(device) ?? key;
}

export type PhotoSlot = { kind: PhotoKind; label: string };

const PLAIN_ONLY: PhotoSlot[] = [{ kind: "PLAIN", label: "Photo" }];
const THERMAL_AND_VISUAL: PhotoSlot[] = [
  { kind: "THERMAL", label: "Thermal photo" },
  { kind: "VISUAL", label: "Visual photo" },
];

/** Which photos an issue of this type has to carry before it can be saved. */
export function photoSlotsFor(type: IssueType): PhotoSlot[] {
  return type === "DUST_INGRESS" ? PLAIN_ONLY : THERMAL_AND_VISUAL;
}

/** The slot key used for a motor, which has no positions to pick from. */
export const MOTOR_SLOT = "motor";

/** Dust ingress is filed against the board itself, not a position on it. */
export const BOARD_SLOT = "board";

/** The main switch sits above the sections and belongs to none of them. */
export const MAIN_SWITCH_SLOT = "main";
