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
 */
export const POSITION_ISSUE_TYPES: readonly IssueType[] = [
  "RISING_TEMPERATURE",
  "TERMINATION_ISSUE",
  "REPAIRED",
];

/** A motor is reported on whole, so everything is on the table there. */
export const ITEM_ISSUE_TYPES: readonly IssueType[] = ISSUE_TYPES;

export const ISSUE_LABELS: Record<IssueType, string> = {
  DUST_INGRESS: "Dust ingress",
  RISING_TEMPERATURE: "Rising temperature",
  TERMINATION_ISSUE: "Termination issue",
  REPAIRED: "Repaired",
};

export const ISSUE_NOTES: Record<IssueType, string> = {
  DUST_INGRESS: "Build-up on or around the device. One photo.",
  RISING_TEMPERATURE: "Running warmer than it should. Thermal and visual.",
  TERMINATION_ISSUE: "Loose, discoloured or damaged termination. Thermal and visual.",
  REPAIRED: "Put right on the day. Thermal and visual.",
};

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
