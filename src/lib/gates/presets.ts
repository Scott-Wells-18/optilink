/**
 * The wording a gate service report starts from.
 *
 * Same idea as the safety presets and the same three rules: composition is
 * total so a changed answer cannot leave a sentence behind, nothing is
 * claimed that nobody has confirmed, and no measurement is invented.
 *
 * There is one more rule here, because a service report is read as a record of
 * what was done. **Planned work is not completed work.** Every scenario below
 * describes what is intended; the completed-work paragraph is composed only
 * from the tasks the technician has actually ticked off, and a scenario with
 * nothing ticked produces no completed-work statement at all. A pass, a
 * measurement, the weather, a defect, a priority, who was notified and the
 * service outcome are all specific to the visit and none of them is proposed.
 */

export type ServiceKind = "SCHEDULED" | "BREAKDOWN" | "FOLLOW_UP";

export const SERVICE_LABELS: Record<ServiceKind, string> = {
  SCHEDULED: "Scheduled service",
  BREAKDOWN: "Breakdown",
  FOLLOW_UP: "Follow-up",
};

/* --- the wording every gate visit shares ---------------------------------- */

export const COMMON = {
  method:
    "Identify the installed gate/operator, controller and accessories and use their applicable manufacturer instructions. Isolate for physical work and control stored energy. Carry out powered tests only within a controlled exclusion area, with accessible emergency isolation. Record limitations and actual responses.",
  limitation:
    "Inspection is limited to the recorded unit, accessible components, fitted accessories and tests performed at this visit. Inaccessible or untested items are identified separately. Any repair outside this scope requires an updated assessment and subsequent verification.",
  boomTasks:
    "Inspect cabinet, anchors, arm mounting, spring/attachments, linkage, release, electrical condition and fitted safety devices. Clean and carry out manufacturer-specified servicing. Verify controlled travel and record outstanding defects.",
  slidingTasks:
    "Inspect leaf, track, wheels, guides, rack/pinion, stops, anti-derailment provisions, operator mounting, manual release, electrical condition and fitted safety devices. Clean and carry out specified servicing; verify controlled travel and record defects.",
} as const;

/* --- the scenarios --------------------------------------------------------- */

export type Scenario = {
  id: string;
  /** Which of the three service choices it sits under. */
  under: ServiceKind;
  label: string;
  /** Boom, sliding, or either. Decides which routine task list is folded in. */
  suits?: "BOOM" | "SLIDING";
  /** The scope paragraph, as supplied. */
  scope: string;
  /** Proposed planned work beyond the routine list for the gate's type. */
  planned?: string;
  /** A limitation this scenario adds to the common one. */
  limitation?: string;
  /** Proposed recommendation wording. Never an outcome. */
  recommendation?: string;
  /** Fields the technician has to fill, which are never pre-filled. */
  record?: string[];
};

export const SCENARIOS: Scenario[] = [
  /* scheduled */
  {
    id: "BOOM_SCHEDULED",
    under: "SCHEDULED",
    suits: "BOOM",
    label: "Scheduled boom service",
    scope:
      "Routine preventive servicing and inspection of the identified boom barrier and fitted accessories.",
  },
  {
    id: "SLIDING_SCHEDULED",
    under: "SCHEDULED",
    suits: "SLIDING",
    label: "Scheduled sliding-gate service",
    scope:
      "Routine preventive servicing and inspection of the identified sliding gate and fitted accessories.",
  },
  {
    id: "BOOM_HIGH_USE",
    under: "SCHEDULED",
    suits: "BOOM",
    label: "High-use depot boom service",
    scope:
      "Preventive inspection of a high-use depot boom barrier, with particular attention to anchors, arm/spring mechanism, wear and safety-device response.",
    recommendation:
      "Review service interval against recorded usage, environment and manufacturer guidance.",
  },
  {
    id: "COASTAL",
    under: "SCHEDULED",
    label: "Coastal or exposed gate service",
    scope:
      "Inspect the gate mechanism, cabinet, fixings and electrical/accessory condition with attention to corrosion, weather exposure and water ingress.",
    recommendation:
      "Rectify identified corrosion/ingress and review the service interval for exposure.",
  },

  /* breakdown */
  {
    id: "NO_OPERATION",
    under: "BREAKDOWN",
    label: "Gate does not operate",
    scope:
      "Investigate the reported failure to operate by identifying supply, command, release and controller conditions within the assessed diagnostic scope.",
    recommendation:
      "Record cause found, work performed and any further diagnostic or repair requirement.",
    record: ["The cause found, or that none was found."],
  },
  {
    id: "INTERMITTENT",
    under: "BREAKDOWN",
    label: "Intermittent gate operation",
    scope:
      "Investigate reported intermittent operation, including recorded errors, supply conditions, commands and fitted safety inputs.",
    limitation:
      "If the fault cannot be reproduced, that limitation is recorded rather than the fault being declared resolved.",
    record: ["Whether the fault was reproduced at this visit."],
  },
  {
    id: "BOOM_IMPACT",
    under: "BREAKDOWN",
    suits: "BOOM",
    label: "Boom arm impact or damage",
    scope:
      "Assess reported boom-arm impact damage, mounting, mechanism and associated safety accessories; carry out only authorised repairs.",
    recommendation:
      "Keep out of service where damage compromises stability or safety; verify operation after repair.",
    record: ["Which repairs were authorised, and by whom."],
  },
  {
    id: "TRACK_FAULT",
    under: "BREAKDOWN",
    suits: "SLIDING",
    label: "Sliding track, wheel or guide fault",
    scope:
      "Assess reported track, wheel, guide or rack condition and its effect on secure travel; carry out authorised isolated repairs.",
    recommendation:
      "Verify retention, stops and controlled travel before service release.",
  },
  {
    id: "PHOTOCELL",
    under: "BREAKDOWN",
    label: "Photocell or beam fault",
    scope:
      "Inspect, clean, align and test the identified photocell system, associated wiring and configured safety response.",
    recommendation:
      "Record each device's location and response; unresolved safety failure requires isolation or recorded safe restrictions.",
    record: ["Each device's location, and its response."],
  },
  {
    id: "LOOP",
    under: "BREAKDOWN",
    label: "Induction-loop issue",
    scope:
      "Investigate the identified approach, exit or presence loop and detector operation, distinguishing access commands from closing-safety functions.",
    recommendation: "Record actual detection/holding behaviour and any unavailable test.",
    record: ["The detection and holding behaviour observed, and any test that could not be run."],
  },
  {
    id: "ACCESS_CONTROL",
    under: "BREAKDOWN",
    label: "Remote, intercom or access-control issue",
    scope:
      "Investigate the identified access-command interface and gate response without bypassing fitted safety functions.",
    recommendation: "Verify authorised commands and the final operating sequence after changes.",
  },
  {
    id: "ADJUSTMENT",
    under: "BREAKDOWN",
    label: "Travel, slowdown or auto-close adjustment",
    scope:
      "Review and adjust authorised operating settings to suit the installed gate and accessories, then recheck travel and safety response.",
    record: [
      "The original settings, before any change.",
      "The new settings, and the measured opening, closing and auto-close times.",
    ],
  },
  {
    id: "SPRING",
    under: "BREAKDOWN",
    suits: "BOOM",
    label: "Spring, balance or release issue",
    scope:
      "Assess the reported boom balance, spring or manual-release issue using the exact manufacturer restraint and stored-energy procedure.",
    recommendation:
      "Verify the corrected configuration and retain out-of-service status for unresolved critical defects.",
  },
  {
    id: "SAFETY_EDGE",
    under: "BREAKDOWN",
    label: "Safety edge, stop or obstacle fault",
    scope:
      "Inspect and test the identified safety edge, stop or obstacle-response function using suitable methods and acceptance criteria.",
    recommendation:
      "Record response and measured evidence; do not release with failed required safety protection.",
    record: ["The response observed, and the measured evidence for it."],
  },
  {
    id: "SUPPLY",
    under: "BREAKDOWN",
    label: "Battery, supply or power-restoration issue",
    scope:
      "Inspect the recorded supply and fitted backup arrangement, including controlled loss/restoration behaviour where safe and applicable.",
    record: [
      "The measured voltage and battery test results.",
      "The behaviour on loss and restoration, or N/A where no backup is fitted.",
    ],
  },

  /* follow-up */
  {
    id: "FOLLOW_UP",
    under: "FOLLOW_UP",
    label: "Follow-up after repair",
    scope:
      "Verify the recorded repaired items and repeat the affected functional/safety tests; identify any areas outside the follow-up scope.",
    recommendation:
      "Link previous report and defect references and record final status of each outstanding item.",
    record: [
      "The previous report and defect references.",
      "The current status of each outstanding item — which is asked afresh, not carried over.",
    ],
  },
];

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function scenariosUnder(kind: ServiceKind): Scenario[] {
  return SCENARIOS.filter((scenario) => scenario.under === kind);
}

/* --- the outcome paragraphs ------------------------------------------------ */

/**
 * Offered, never chosen.
 *
 * Each of these is true only under a condition the technician confirms, and
 * two of them contradict each other, so the app does not pick. A report with
 * no outcome selected prints no outcome, which reads as unfinished — and an
 * unfinished report is a better outcome than one that returned a gate to
 * service on its own initiative.
 */
export type OutcomeWording = {
  id: string;
  label: string;
  /** What has to be true before it may be offered as selected. */
  when: string;
  text: string;
  /** Placeholders the technician fills. The text is useless until they do. */
  fills?: string[];
};

export const OUTCOMES: OutcomeWording[] = [
  {
    id: "NO_PARTS",
    label: "No parts replaced",
    when: "Nothing was replaced at this visit.",
    text: "No parts replaced during this visit.",
  },
  {
    id: "UNTESTED",
    label: "Untested item",
    when: "An item in scope could not be tested.",
    text: "Not tested: [item], because [reason]; follow-up required: [action].",
    fills: ["item", "reason", "action"],
  },
  {
    id: "SERVICEABLE",
    label: "Serviceable outcome",
    when: "Every applicable check carried out at this visit was satisfactory.",
    text:
      "Returned to service following the recorded satisfactory applicable checks; limitations and recommendations are listed.",
  },
  {
    id: "SAFETY_DEFECT",
    label: "Safety defect",
    when: "A listed safety defect is unresolved.",
    text:
      "Unit isolated/out of service pending rectification and verification of the listed safety defects.",
  },
  {
    id: "NON_SAFETY",
    label: "Non-safety defects",
    when: "Defects remain but none of them is a safety defect.",
    text:
      "Returned to service with the listed non-safety defects, restrictions and agreed follow-up.",
  },
];

export const OUTCOME_BY_ID = new Map(OUTCOMES.map((outcome) => [outcome.id, outcome]));

/* --- composing ------------------------------------------------------------- */

export type GateSelection = {
  scenarioId: string;
  /** Boom or sliding, from the asset. Decides the routine task list. */
  kind?: "BOOM" | "SLIDING";
  /**
   * The routine and scenario tasks the technician has confirmed were done.
   *
   * Empty means no completed-work paragraph is composed. This is the line
   * between a plan and a record, and it is the reason the planned-work block
   * and the completed-work block are two different blocks rather than one
   * block that changes tense.
   */
  completed?: string[];
  /** Outcome paragraphs the technician has selected. */
  outcomeIds?: string[];
};

export type GateBlock = { id: string; heading: string; text: string };

export type GateComposition = {
  blocks: GateBlock[];
  /** What the technician still has to record for the wording to be true. */
  record: string[];
  /** Whether a completed-work statement was composed at all. */
  completedWork: boolean;
};

export function composeGate(selection: GateSelection): GateComposition {
  const scenario = SCENARIO_BY_ID.get(selection.scenarioId);
  if (!scenario) return { blocks: [], record: [], completedWork: false };

  const kind = selection.kind ?? scenario.suits ?? "BOOM";
  const routine = kind === "SLIDING" ? COMMON.slidingTasks : COMMON.boomTasks;

  const blocks: GateBlock[] = [
    { id: "scope", heading: "Scope", text: scenario.scope },
    { id: "method", heading: "Method", text: COMMON.method },
    {
      id: "planned",
      heading: "Planned work",
      text: [routine, scenario.planned].filter(Boolean).join("\n\n"),
    },
    {
      id: "limitation",
      heading: "Limitations",
      text: [COMMON.limitation, scenario.limitation].filter(Boolean).join("\n\n"),
    },
  ];

  // Completed work, and only from what was confirmed. A scenario with nothing
  // ticked gets no block: the report then says what was planned and says
  // nothing about what was done, which is exactly the state it is in.
  const done = (selection.completed ?? []).filter((line) => line.trim());
  if (done.length > 0) {
    blocks.push({
      id: "completed",
      heading: "Work completed",
      text: done.map((line) => `· ${line.trim()}`).join("\n"),
    });
  }

  if (scenario.recommendation) {
    blocks.push({
      id: "recommendations",
      heading: "Recommendations",
      text: scenario.recommendation,
    });
  }

  const outcomes = (selection.outcomeIds ?? [])
    .map((id) => OUTCOME_BY_ID.get(id))
    .filter((outcome): outcome is OutcomeWording => Boolean(outcome));
  if (outcomes.length > 0) {
    blocks.push({
      id: "outcome",
      heading: "Outcome",
      text: outcomes.map((outcome) => outcome.text).join("\n\n"),
    });
  }

  return {
    blocks,
    record: [
      ...(scenario.record ?? []),
      ...outcomes.flatMap((outcome) =>
        (outcome.fills ?? []).map((fill) => `The [${fill}] in the ${outcome.label.toLowerCase()} wording.`),
      ),
    ],
    completedWork: done.length > 0,
  };
}
