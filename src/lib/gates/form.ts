import type { GateType } from "@/lib/gates/models";

/**
 * What a gate service asks, and what counts as an answer.
 *
 * Every item from the service report template is here, adapted for the gate in
 * front of the technician: a sliding gate has no boom to check the balance of
 * and no spring to check the wear on, and leaving those as compulsory fields
 * is how a report ends up with "N/A" down a whole column or, worse, "P".
 *
 * The one rule underneath all of it: an unanswered item is not a pass. There
 * are four states, and "not answered yet" is one of them. Nothing in this file
 * turns into a tick on a page without somebody having chosen it.
 */

/* --- what the visit was for ----------------------------------------------- */

export type ServiceKind = "SCHEDULED" | "BREAKDOWN" | "FOLLOW_UP";

export const SERVICE_KINDS: readonly ServiceKind[] = [
  "SCHEDULED",
  "BREAKDOWN",
  "FOLLOW_UP",
];

export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  SCHEDULED: "Scheduled",
  BREAKDOWN: "Breakdown",
  FOLLOW_UP: "Follow-up",
};

/* --- how an item came out -------------------------------------------------- */

/**
 * Pass, fail, not applicable, or not tested.
 *
 * "Not tested" is a real answer and a different one from N/A: N/A means the
 * gate does not have the thing, and NOT_TESTED means it does and we did not
 * get to it. Both print, and NOT_TESTED asks why.
 */
export type Result = "PASS" | "FAIL" | "NA" | "NOT_TESTED";

export const RESULTS: readonly Result[] = ["PASS", "FAIL", "NA", "NOT_TESTED"];

export const RESULT_LABELS: Record<Result, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  NA: "N/A",
  NOT_TESTED: "Not tested",
};

/** What goes in the Result column of the report. */
export const RESULT_MARKS: Record<Result, string> = {
  PASS: "P",
  FAIL: "F",
  NA: "NA",
  NOT_TESTED: "NT",
};

/** One answered item: the result, and whatever was written against it. */
export type Answer = { result: Result; note?: string };

export type Answers = Record<string, Answer>;

/**
 * Whether an item has been answered well enough to go on a report.
 *
 * A failure must say what failed — it carries into the defects section and a
 * defect with no finding against it is not a defect. An item recorded as not
 * tested must say why, because "not tested" with no reason reads as an
 * oversight whether it was one or not. A pass needs nothing.
 */
export function answerIsComplete(answer: Answer | undefined): boolean {
  if (!answer) return false;
  if (answer.result === "FAIL" || answer.result === "NOT_TESTED") {
    return Boolean(answer.note?.trim());
  }
  return true;
}

/* --- the items ------------------------------------------------------------- */

export type Item = {
  id: string;
  label: string;
  /**
   * Which gates it applies to. An item with no `only` applies to both — most
   * of them do, because a cabinet is a cabinet and a photocell is a photocell.
   */
  only?: GateType;
  /**
   * Shown only where a fitted accessory says it is there. An item about a
   * safety edge on a gate with no safety edge is not a question.
   */
  needs?: Accessory;
};

export type Section = { id: string; title: string; note?: string; items: Item[] };

/**
 * Mechanical and electrical inspection.
 *
 * The template's twelve items, with the three that are about a boom replaced
 * for a sliding gate by the things that carry a sliding gate: the track, the
 * rollers and the rack.
 */
export const MECHANICAL: Section = {
  id: "mechanical",
  title: "Mechanical and electrical inspection",
  note: "Record untested items and the reason in the notes beside them.",
  items: [
    { id: "cabinet", label: "Cabinet, door, lock and seals; corrosion or water ingress" },
    { id: "foundation", label: "Foundation, base plate and anchors; damage or movement" },

    { id: "boom", label: "Boom straightness, cracks, mounting and fasteners", only: "BOOM" },
    {
      id: "markings",
      label: "Reflective markings, rubber strip and support rest if fitted",
      only: "BOOM",
    },
    { id: "spring", label: "Spring and attachments; wear, corrosion or damage", only: "BOOM" },
    {
      id: "balance",
      label: "Boom balance checked under manufacturer procedure",
      only: "BOOM",
    },

    { id: "leaf", label: "Gate leaf, frame and infill; damage, distortion or fasteners", only: "SLIDING" },
    { id: "track", label: "Track and ground guide; wear, debris, drainage and alignment", only: "SLIDING" },
    { id: "rollers", label: "Rollers, guide wheels and end stops; wear, play or noise", only: "SLIDING" },
    { id: "rack", label: "Rack and pinion engagement, backlash and fastenings", only: "SLIDING" },
    { id: "antiderail", label: "Anti-derailment brackets and leaf retention", only: "SLIDING" },

    { id: "drive", label: "Linkages, pivots and drive; wear, play or abnormal noise" },
    { id: "release", label: "Manual release and controlled manual operation" },
    { id: "cables", label: "Cables, glands, conduit and wiring condition" },
    { id: "earthing", label: "Earthing and electrical connections inspected" },
    {
      id: "board",
      label: "Control board, transformer and fuses; heat or moisture damage",
    },
    { id: "isolator", label: "Isolator and battery equipment condition if fitted" },
  ],
};

/**
 * Safety and functional tests.
 *
 * The template's fourteen, with the boom-specific wording generalised and the
 * accessory-dependent ones shown only when that accessory is fitted.
 */
export const SAFETY: Section = {
  id: "safety",
  title: "Safety and functional tests",
  note:
    "Record device locations, test methods and actual responses. Do not use a person or vehicle " +
    "as an impact test target. Use the applicable manufacturer procedure and suitable test equipment.",
  items: [
    {
      id: "photocells",
      label: "Photocells cleaned, aligned and each beam tested",
      needs: "PHOTOCELLS",
    },
    { id: "closing", label: "Closing safety response verified for each applicable device" },
    { id: "opening", label: "Opening safety response verified where configured" },
    { id: "loops", label: "Approach / exit loops and access commands tested if fitted", needs: "LOOPS" },
    {
      id: "presence",
      label: "Presence loop prevents unsafe closing where configured",
      needs: "LOOPS",
    },
    {
      id: "edge",
      label: "Safety edge and monitored fault response tested if fitted",
      needs: "SAFETY_EDGE",
    },
    { id: "force", label: "Obstacle detection / force assessment as applicable" },
    { id: "estop", label: "Emergency stop response tested if fitted", needs: "ALARM" },
    { id: "controls", label: "Remotes, key switch, intercom and access control tested", needs: "ACCESS" },
    { id: "autoclose", label: "Automatic close delay and operating sequence checked" },
    { id: "limits", label: "Travel limits, slowdown and smooth movement checked" },
    {
      id: "lights",
      label: "Boom lights / warning lights / alarm outputs tested if fitted",
      needs: "WARNING_LIGHTS",
    },
    {
      id: "battery",
      label: "Battery backup and power restoration behaviour if fitted",
      needs: "BATTERY",
    },
    { id: "cycles", label: "Repeated operating cycles and final safety recheck completed" },
  ],
};

export const SECTIONS: Section[] = [MECHANICAL, SAFETY];

/* --- accessories ----------------------------------------------------------- */

export type Accessory =
  | "PHOTOCELLS"
  | "ALARM"
  | "LOOPS"
  | "SAFETY_EDGE"
  | "WARNING_LIGHTS"
  | "ACCESS"
  | "BATTERY";

export const ACCESSORIES: readonly Accessory[] = [
  "PHOTOCELLS",
  "ALARM",
  "LOOPS",
  "SAFETY_EDGE",
  "WARNING_LIGHTS",
  "ACCESS",
  "BATTERY",
];

export const ACCESSORY_LABELS: Record<Accessory, string> = {
  PHOTOCELLS: "Photocell beams",
  ALARM: "Alarm / safety interface",
  LOOPS: "Induction loops",
  SAFETY_EDGE: "Safety edges",
  WARNING_LIGHTS: "Warning lights",
  ACCESS: "Access controls",
  BATTERY: "Battery backup",
};

/**
 * The items that apply to this gate, with this equipment on it.
 *
 * An item for an accessory that is not fitted is left out rather than offered
 * and answered N/A fourteen times — but the technician can turn any of them
 * back on, because a gate with a safety edge nobody ticked still has a safety
 * edge.
 */
export function itemsFor(
  section: Section,
  type: GateType,
  accessories: Accessory[],
  showAll = false,
): Item[] {
  return section.items.filter((item) => {
    if (item.only && item.only !== type) return false;
    if (item.needs && !showAll && !accessories.includes(item.needs)) return false;
    return true;
  });
}

/* --- the preparation checklist ---------------------------------------------- */

export type Preparation =
  | "CONTACT"
  | "EXCLUSION"
  | "POWER"
  | "ISOLATION"
  | "STORED_ENERGY"
  | "PROCEDURE";

export const PREPARATIONS: readonly Preparation[] = [
  "CONTACT",
  "EXCLUSION",
  "POWER",
  "ISOLATION",
  "STORED_ENERGY",
  "PROCEDURE",
];

export const PREPARATION_LABELS: Record<Preparation, string> = {
  CONTACT: "Site contact consulted",
  EXCLUSION: "Traffic and pedestrian exclusion established",
  POWER: "Power sources identified including battery",
  ISOLATION: "Isolation and verification completed for applicable work",
  STORED_ENERGY: "Stored energy in the drive and counterbalance controlled",
  PROCEDURE: "Relevant risk assessment / work procedure applied",
};

/* --- the outcome ------------------------------------------------------------ */

export type Outcome = "RETURNED" | "RETURNED_WITH_DEFECTS" | "ISOLATED";

export const OUTCOMES: readonly Outcome[] = [
  "RETURNED",
  "RETURNED_WITH_DEFECTS",
  "ISOLATED",
];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  RETURNED: "Returned to service",
  RETURNED_WITH_DEFECTS: "Returned with documented non-safety defects",
  ISOLATED: "Isolated / out of service",
};

/* --- defects ---------------------------------------------------------------- */

export type Priority = "IMMEDIATE" | "URGENT" | "ROUTINE";

export const PRIORITIES: readonly Priority[] = ["IMMEDIATE", "URGENT", "ROUTINE"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  IMMEDIATE: "Immediate",
  URGENT: "Urgent",
  ROUTINE: "Routine",
};

export const PRIORITY_NOTES: Record<Priority, string> = {
  IMMEDIATE: "Unsafe; keep out of service.",
  URGENT: "Prompt rectification.",
  ROUTINE: "Planned work.",
};

export type Defect = {
  /** "D1", "D2" — the reference the report and the notes share. */
  ref: string;
  finding: string;
  priority: Priority;
  action: string;
  /** Set where the defect came from a failed inspection item. */
  fromItem?: string;
};

/**
 * The defects a set of answers implies, merged with the ones written by hand.
 *
 * Every failure becomes a defect, with the note typed against it as the
 * finding — so a failure is written once and appears in both places. A defect
 * the technician has already filled in keeps what they wrote; only the
 * finding tracks the note, because that is the one they typed upstairs.
 */
export function defectsFrom(
  sections: Section[],
  answers: Answers,
  held: Defect[],
  type: GateType,
  accessories: Accessory[],
): Defect[] {
  const byItem = new Map(held.filter((d) => d.fromItem).map((d) => [d.fromItem!, d]));
  const freehand = held.filter((defect) => !defect.fromItem);

  const out: Defect[] = [];
  for (const section of sections) {
    for (const item of itemsFor(section, type, accessories, true)) {
      if (answers[item.id]?.result !== "FAIL") continue;
      const existing = byItem.get(item.id);
      out.push({
        ref: existing?.ref ?? "",
        finding: answers[item.id]?.note?.trim() || item.label,
        priority: existing?.priority ?? "URGENT",
        action: existing?.action ?? "",
        fromItem: item.id,
      });
    }
  }

  // Numbered in the order they are printed, failures first.
  return [...out, ...freehand].map((defect, at) => ({ ...defect, ref: `D${at + 1}` }));
}

/**
 * Whether a failed safety test rules out returning the gate to service.
 *
 * A gate whose closing safety, safety edge, force test, emergency stop or
 * photocells failed is not a gate that goes back into use because somebody
 * picked the first option on a list. The report will not print "Returned to
 * service" over one.
 */
const SAFETY_CRITICAL = new Set([
  "photocells",
  "closing",
  "opening",
  "edge",
  "force",
  "estop",
  "presence",
  "spring",
  "boom",
  "antiderail",
  "leaf",
]);

export function failedSafety(answers: Answers): string[] {
  return [...SAFETY_CRITICAL].filter((id) => answers[id]?.result === "FAIL");
}

export function outcomeAllowed(outcome: Outcome, answers: Answers): boolean {
  if (outcome !== "RETURNED") return true;
  return failedSafety(answers).length === 0;
}

/* --- dates ------------------------------------------------------------------ */

/**
 * A year on, to the day.
 *
 * The default rather than the rule: a gate on a busy loading dock or in salt
 * air gets looked at more often, and the form lets that be said with its
 * reason. 29 February lands on 28 February.
 */
export function yearAfter(date: Date): Date {
  const out = new Date(
    Date.UTC(date.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()),
  );
  if (out.getUTCMonth() !== date.getUTCMonth()) out.setUTCDate(0);
  return out;
}
