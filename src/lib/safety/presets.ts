/**
 * The wording a job starts from, so that almost none of it has to be typed.
 *
 * A SWMS, a JSA and an OEC-WHS002 all ask the same few things in different
 * words: what is the work, how is it done, what else was considered, what is
 * controlled. Writing that out by hand for every job is where the time goes,
 * and it is also where the mistakes go — the paragraph that still mentions
 * RCD testing on a thermal-only job, the one that says an inspection passed
 * before anybody inspected anything.
 *
 * So the wording is held here, composed from what was actually selected, and
 * handed back as a draft the assessor edits. Three rules shape all of it:
 *
 *  1. **Composition is total.** `compose` is a pure function of the current
 *     selection and builds every block from nothing each time. There is no
 *     path by which a paragraph from an answer that has since changed can
 *     survive into the result — which is the only way to be sure changing an
 *     answer removes what the old one said.
 *  2. **Nothing is claimed.** Not one sentence here says a test passed, a
 *     circumstance applied, a control was verified or an authorisation was
 *     given. Those are confirmations a person makes against evidence, and the
 *     draft says what still needs confirming rather than quietly supplying it.
 *  3. **Measurements are never invented.** Where a number belongs — a rating,
 *     a fault level, a trip time, an instrument's verification date — the
 *     wording points at it and `confirm` lists it as outstanding.
 */

/* --- the shared testing wording ------------------------------------------- */

/**
 * The reusable paragraphs, as supplied.
 *
 * These are the words themselves and are not generated from anything, so they
 * read the same on every job that selects them — which is the point. They are
 * exported so the preview, the OEC-WHS002 filler and the tests all use one
 * copy rather than three that drift apart.
 */
export const WORDING = {
  rcdMethod:
    "Identify the selected protective device and circuit. Perform the appropriate instrument test sequence using suitable verified equipment; record device type, rating, settings, trip results and circuit restoration. Energisation is required for the operational test, not for installation or repair.",
  rcdAlternatives:
    "De-energised inspection and insulation testing cannot establish the device's operational trip response. Consider a suitable protected test point and closed-cover method first. Record why the selected method and any exposed-live access are necessary for this particular circuit.",
  thermalMethod:
    "Inspect the identified electrical equipment under a representative recorded operating load. Record load conditions, image references and thermal limitations. Use a closed-cover view or suitable infrared window where it can achieve the required inspection.",
  thermalAlternatives:
    "A de-energised inspection cannot reproduce heating under load. Consider an infrared window, remote sensing and safe load scheduling before opening covers. Record which alternatives are available and why the chosen access is necessary.",
  measureMethod:
    "Measure the identified operating quantity at the selected test point using suitable rated instruments and accessories. Limit the scope to the recorded test; installation, termination, adjustment and repair remain de-energised.",
  measureAlternatives:
    "De-energised inspection cannot establish the required operating measurement. Consider an accessible protected test point, remote measurement and closed-cover testing. Record the actual reason these alternatives are suitable or unsuitable.",
  generalControls:
    "Identify all supplies and accessible emergency isolation. Establish a controlled work area with clear entry and exit. Minimise exposed parts and exposure time; use suitable barriers, rated instruments and assessed PPE. Confirm affected loads, communication, emergency arrangements and observer requirements. Stop for changed conditions or inadequate controls.",
  preparation:
    "Isolate, lock/tag and verify de-energised for installation, repairs and physical adjustments. Follow the assessed switching sequence for necessary testing. Account for people and tools, restore barriers and covers, and verify safe restoration before handover.",
} as const;

/**
 * What the shared paragraphs are not.
 *
 * Printed under the proposed wording wherever it is shown, because the whole
 * risk of a preset library is that selecting one starts to feel like having
 * satisfied something. It is not a disclaimer bolted on; it is the reason the
 * blocks below carry no tick, no rating and no approval.
 */
export const WORDING_LIMITS =
  "These paragraphs supply reusable wording. They do not satisfy a permitted-circumstance checkbox, site evidence, a verified-control tick or a risk rating. The assessor confirms the applicable circumstance and the supporting evidence. Where none applies, the document must not approve energised work.";

/** The testing methods a job can select, each with its own two paragraphs. */
export type MethodKey = "RCD" | "THERMAL" | "MEASURE";

export const METHODS: Record<
  MethodKey,
  {
    label: string;
    note: string;
    method: string;
    alternatives: string;
    /**
     * Statements the method itself calls for, whatever the job is.
     *
     * Selecting RCD testing on a socket-outlet installation is RCD testing,
     * and it needs the RCD statement — the installation's own statement does
     * not cover a trip test. A controlled measurement has no statement of its
     * own: it is part of the verification the job's statement already
     * describes, which is why it carries none.
     */
    requires?: string[];
  }
> = {
  RCD: {
    label: "RCD operational testing",
    note: "Instrument trip testing of a residual current device",
    method: WORDING.rcdMethod,
    alternatives: WORDING.rcdAlternatives,
    requires: ["SWMS014"],
  },
  THERMAL: {
    label: "Thermal imaging",
    note: "Infrared inspection under a representative load",
    method: WORDING.thermalMethod,
    alternatives: WORDING.thermalAlternatives,
    requires: ["SWMS013"],
  },
  MEASURE: {
    label: "Controlled operating measurement",
    note: "Voltage, current, fault loop — a reading the supply has to be on for",
    method: WORDING.measureMethod,
    alternatives: WORDING.measureAlternatives,
  },
};

/* --- the activities -------------------------------------------------------- */

/**
 * The categories the activities are offered under, in order.
 *
 * A job is any number of activities from any number of these. Nothing in one
 * category implies anything in another: an installation does not bring testing
 * with it, and testing does not imply anything was installed.
 */
export type PresetGroup =
  | "INSTALL"
  | "TESTING"
  | "THERMAL"
  | "MONITORING"
  | "COMMISSIONING"
  | "OTHER";

export type Preset = {
  id: string;
  group: PresetGroup;
  label: string;
  /** The scope paragraph, as supplied. */
  scope: string;
  /**
   * The testing methods selecting this activity brings.
   *
   * Only an activity that *is* a test brings one. An installation brings none:
   * how it is verified is asked as a follow-up, so selecting a GPO never
   * quietly puts a test method on the paperwork.
   */
  methods?: MethodKey[];
  /**
   * A reading with the supply on that may or may not be part of this activity.
   * Never assumed: it raises the "readings with the supply on" follow-up.
   */
  offers?: MethodKey[];
  /** The main-job answer this stands for, which decides the SWMS. */
  nature?: string;
  /** Statements this activity needs beyond the one its nature brings. */
  requires?: string[];
  /** JSA risk rows it adds. */
  hazards?: string[];
  /**
   * Anything this activity needs confirmed before the wording is true, in the
   * words the assessor will have to answer. Never guessed at, never filled.
   */
  confirm?: string[];
  /** A sentence added after the scope, about how the job is bounded. */
  bound?: string;
  /**
   * An attribute of an RCD test rather than a test of its own — across several
   * boards, or a retest. Offered under the phase types and only once one of
   * them is selected, so it can never stand as a contradictory third choice.
   */
  rcdAttribute?: boolean;
  /** Kept so saved jobs still compose; no longer offered. */
  legacy?: boolean;
};

/** Said once, however many activities bound an energised stage to the tests. */
const BOUND_TO_TESTS = "Any energised stage is limited to the tests selected for this job.";

/**
 * Every activity, in the order it is offered.
 *
 * Testing stands on its own. An RCD test, a thermal survey and a current
 * recording are each a whole day's work with nothing installed, and each can
 * equally sit beside an installation on the same visit.
 */
export const PRESETS: Preset[] = [
  /* installation and replacement */
  {
    id: "GPO_SINGLE",
    group: "INSTALL",
    label: "Single-phase GPO installation",
    scope:
      "Install a single-phase socket-outlet circuit, including cable installation, termination and identification.",
    nature: "GENERAL",
    confirm: ["The circuit rating and protective device, from the job details."],
  },
  {
    id: "GPO_EXTEND",
    group: "INSTALL",
    label: "Additional GPOs on an existing circuit",
    scope: "Extend the identified existing circuit to additional socket outlets.",
    nature: "GENERAL",
    confirm: [
      "Which existing circuit is being extended, and how its identity was established.",
      "The interruption arrangements agreed for that circuit.",
    ],
  },
  {
    id: "GPO_REPLACE",
    group: "INSTALL",
    label: "GPO replacement",
    scope: "Replace the identified socket outlet under isolation.",
    nature: "GENERAL",
    bound: BOUND_TO_TESTS,
  },
  {
    id: "OUTLET_THREE",
    group: "INSTALL",
    label: "Three-phase outlet installation",
    scope:
      "Install a three-phase outlet circuit, including conductor identification and termination.",
    nature: "GENERAL",
    confirm: ["Which phases are installed, and the protective device fitted."],
  },
  {
    id: "APPLIANCE_SINGLE",
    group: "INSTALL",
    label: "Single-phase appliance circuit",
    scope:
      "Install a dedicated single-phase appliance circuit, local isolation and connection arrangements.",
    nature: "GENERAL",
    confirm: ["The circuit rating, from the job details."],
  },
  {
    id: "APPLIANCE_THREE",
    group: "INSTALL",
    label: "Three-phase appliance circuit",
    scope:
      "Install a dedicated three-phase appliance circuit, isolation and connection arrangements.",
    nature: "GENERAL",
    confirm: [
      "Which phases are connected.",
      "The equipment affected, and the restoration arrangements agreed for it.",
    ],
  },
  {
    id: "DEVICE_REPLACE",
    group: "INSTALL",
    label: "Circuit breaker or RCBO replacement",
    scope:
      "Replace the identified protective device under isolation, checking selection, connections and identification before restoration.",
    nature: "BOARD_MAINT",
    confirm: [
      "Whether the device fitted is an RCBO. If its trip test is done on this visit, select the RCD testing for it under Electrical testing.",
    ],
  },
  {
    id: "CIRCUIT_NEW",
    group: "INSTALL",
    label: "New outgoing circuit",
    scope:
      "Install a new outgoing circuit at the identified switchboard, with associated cabling, protection and labelling.",
    nature: "BOARD_MAINT",
    bound: BOUND_TO_TESTS,
  },
  {
    id: "SUBBOARD",
    group: "INSTALL",
    label: "Subboard installation",
    scope:
      "Install a subboard, feeder, outgoing circuits, earthing, protection and identification within the recorded job scope.",
    nature: "BOARD_NEW",
    confirm: ["Which boards are involved, and where the feeder is isolated."],
  },
  {
    id: "BOARD_REPLACE",
    group: "INSTALL",
    label: "Switchboard replacement",
    scope:
      "Replace the identified switchboard under controlled isolation and reconnect identified circuits.",
    nature: "BOARD_MODIFY",
    confirm: [
      "Every supply to the board, including any second or standby supply.",
      "The staged restoration sequence agreed for it.",
    ],
    bound:
      "Testing that needs the supply on is selected separately and is not implied by the replacement itself.",
  },

  /* electrical testing */
  {
    id: "RCD_SINGLE",
    group: "TESTING",
    label: "Single-phase RCD testing",
    scope:
      "Perform operational RCD testing on the identified single-phase devices and record results and restoration.",
    nature: "RCD",
    methods: ["RCD"],
  },
  {
    id: "RCD_THREE",
    group: "TESTING",
    label: "Three-phase RCD testing",
    scope:
      "Perform operational RCD testing on the identified three-phase devices using the selected phase test sequence; record each phase and restoration.",
    nature: "RCD",
    methods: ["RCD"],
    confirm: ["The three-phase device type and configuration, and the phase test sequence used."],
  },
  {
    id: "RCD_BOARDS",
    group: "TESTING",
    label: "Across multiple boards",
    scope:
      "Test the selected RCDs across the listed switchboards in the recorded sequence, with board-specific identification, interruption controls and restoration.",
    nature: "RCD",
    methods: ["RCD"],
    rcdAttribute: true,
    confirm: [
      "The local conditions at each board, recorded separately rather than once for all of them.",
      "The isolation and interruption arrangements for each board.",
    ],
  },
  {
    id: "RCD_RETEST",
    group: "TESTING",
    label: "Retest after rectification",
    scope:
      "Retest the identified RCD/circuit after recorded rectification and document the final operational result.",
    nature: "RCD",
    methods: ["RCD"],
    rcdAttribute: true,
    confirm: [
      "The earlier result and the rectification carried out, which are preserved rather than replaced.",
    ],
  },
  {
    id: "VOLTAGE_PHASE",
    group: "TESTING",
    label: "Supply voltage and phase checks",
    scope:
      "Record voltage and phase measurements at the identified circuit/test points using rated equipment and the assessed access method.",
    nature: "RCD",
    methods: ["MEASURE"],
  },
  {
    id: "LOOP",
    group: "TESTING",
    label: "Earth fault-loop or disconnection verification",
    scope:
      "Complete the selected fault-loop or automatic-disconnection verification method at identified test points and record protection details and results.",
    nature: "RCD",
    offers: ["MEASURE"],
  },

  /* thermal imaging */
  {
    id: "THERMAL_CLOSED",
    group: "THERMAL",
    label: "Closed-cover inspection",
    scope:
      "Thermally inspect accessible electrical equipment under representative load using a closed-cover method within its stated limitations.",
    nature: "THERMAL",
    methods: ["THERMAL"],
    confirm: ["The actual electrical exposure of the closed-cover position used."],
  },
  {
    id: "THERMAL_WINDOW",
    group: "THERMAL",
    label: "Inspection through an infrared window",
    scope:
      "Thermally inspect the identified equipment through a suitable infrared window under recorded operating load.",
    nature: "THERMAL",
    methods: ["THERMAL"],
    bound:
      "The inspection is through the fitted window; no cover is recorded as removed, and the window's own limitations apply to what could be seen.",
    confirm: ["The window's limitations, and what they prevented being inspected."],
  },
  {
    id: "THERMAL_OPEN",
    group: "THERMAL",
    label: "Inspection requiring cover access",
    scope:
      "Thermally inspect the identified equipment under representative load using the assessed minimum-access method.",
    nature: "THERMAL",
    methods: ["THERMAL"],
    requires: ["WHS002"],
    confirm: [
      "The actual justification for the access required, for this equipment on this day.",
    ],
  },

  /* current monitoring */
  {
    id: "LOGGER",
    group: "MONITORING",
    label: "Current logger installation or retrieval",
    scope:
      "Fit or retrieve current-monitoring equipment at the identified conductors, using isolation for installation/removal where practicable, and record the monitoring scope.",
    nature: "GENERAL",
    offers: ["MEASURE"],
    bound:
      "Fitting and removal are assessed separately from the recording itself. That a recording is taken with the supply on does not justify fitting or removing the equipment exposed-live.",
  },
  {
    id: "CURRENT_SHORT",
    group: "MONITORING",
    label: "Short-duration amp readings",
    scope:
      "Record current on the identified operating circuit using the assessed sensor and access method; record time, conditions and instrument details.",
    nature: "GENERAL",
    methods: ["MEASURE"],
    bound:
      "A protected test point or closed-cover access is used where one can achieve the measurement.",
  },

  /* gates and equipment */
  {
    id: "GATE_COMMISSION",
    group: "COMMISSIONING",
    label: "Gate electrical and functional commissioning",
    scope:
      "Verify the gate supply and electrical installation, then perform controlled movement and fitted safety-device tests within a segregated travel area.",
    nature: "GENERAL",
    requires: ["SWMS015"],
    offers: ["MEASURE"],
    bound:
      "Exposure to live parts is assessed separately from ordinary powered movement: the two are different risks and are controlled differently.",
  },
  {
    id: "MOTOR",
    group: "COMMISSIONING",
    label: "Motor or pump commissioning",
    scope:
      "Verify the installed motor or pump circuit, rotation and controlled operating response within the recorded commissioning scope.",
    nature: "GENERAL",
    offers: ["MEASURE"],
    bound:
      "Installation and physical adjustment are carried out isolated. Powered tests are run under the controls recorded for them, including those for moving plant.",
  },

  /* concrete cutting and other work */
  {
    id: "CONCRETE_CUT",
    group: "OTHER",
    label: "Concrete cutting with a demolition saw",
    scope:
      "Saw-cut concrete at the marked locations with a demolition saw, using wet cutting and prompt slurry collection.",
    requires: ["SWMS016"],
    hazards: ["HOT_WORKS"],
    bound:
      "Hidden services and the material are verified before cutting, silica exposure is assessed, and the cutting SWMS/JSA is implemented.",
    confirm: ["How hidden services were located, and what the material is."],
  },

  /* no longer offered: both of these are now two ticks */
  {
    id: "RCD_AND_THERMAL",
    group: "TESTING",
    label: "Combined RCD testing and thermal imaging",
    scope:
      "Perform identified RCD operational tests and thermal inspection under representative load.",
    nature: "RCD",
    methods: ["RCD", "THERMAL"],
    requires: ["SWMS013"],
    legacy: true,
  },
];

export const PRESET_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const GROUP_LABELS: Record<PresetGroup, string> = {
  INSTALL: "Electrical installation and replacement",
  TESTING: "Electrical testing",
  THERMAL: "Thermal imaging",
  MONITORING: "Current monitoring",
  COMMISSIONING: "Gates and equipment",
  OTHER: "Concrete cutting and other work",
};

/** The order the categories are offered in, and the order wording is written in. */
export const GROUP_ORDER: PresetGroup[] = [
  "INSTALL",
  "TESTING",
  "THERMAL",
  "MONITORING",
  "COMMISSIONING",
  "OTHER",
];

/** Categories whose activities only test, inspect or record. */
const TEST_ONLY: PresetGroup[] = ["TESTING", "THERMAL", "MONITORING"];

/* --- the site modifiers ---------------------------------------------------- */

export type Modifier = {
  id: string;
  /** The compact question asked about it. */
  question: string;
  label: string;
  paragraph: string;
  requires?: string[];
  hazards?: string[];
  confirm?: string[];
};

/*
 * Concrete cutting used to be a site modifier. It is an activity now, under
 * its own category; `normalise` moves an old selection across.
 */
export const MODIFIERS: Modifier[] = [
  {
    id: "HEIGHT",
    question: "Any of it off the ground?",
    label: "At height",
    paragraph:
      "Provide suitable inspected access equipment, stable footing, controlled tool handling and protection of persons below; record any rescue arrangements required by the access method.",
    requires: ["SWMS007"],
    hazards: ["HEIGHT_LADDER"],
    confirm: ["The access method, and whether it requires a rescue arrangement."],
  },
  {
    id: "OCCUPIED",
    question: "Occupied depot, or public access?",
    label: "Occupied site or public access",
    paragraph:
      "Coordinate vehicle and pedestrian movements with site management. Physically segregate the work zone and maintain approved alternative routes and emergency access.",
    hazards: ["OCCUPIED_SITE"],
    confirm: ["The alternative routes agreed with site management."],
  },
  {
    id: "SUPPLIES",
    question: "More than one supply, or possible backfeed?",
    label: "Multiple supplies or backfeed",
    paragraph:
      "Identify mains, generator, UPS, solar, battery and auxiliary sources actually fitted; record isolation points and verify protection against unintended energisation.",
    hazards: ["BOARD_ISOLATION"],
    confirm: [
      "Which of those sources are actually fitted, and where each one is isolated.",
    ],
  },
  {
    id: "CRITICAL",
    question: "Critical or sensitive loads affected?",
    label: "Critical or sensitive loads",
    paragraph:
      "Identify affected critical equipment and persons. Agree interruption, contingency, shutdown and restoration arrangements before the work.",
    confirm: [
      "Which equipment and which people are affected.",
      "The interruption and contingency arrangements agreed, and with whom.",
    ],
  },
  {
    id: "OUTDOOR",
    question: "Outdoors or exposed?",
    label: "Outdoor conditions",
    paragraph:
      "Assess rain, water, wind, lighting and stable footing. Protect equipment and connections; stop where conditions make the selected method unsafe.",
  },
  {
    id: "ACCESS",
    question: "Restricted or obstructed access?",
    label: "Restricted or obstructed access",
    paragraph:
      "Arrange clear entry, exit, lighting and a stable position before work. If safe access cannot be established, stop and revise the method.",
  },
  {
    id: "ADJACENT",
    question: "Live parts adjacent to the work?",
    label: "Adjacent live parts",
    paragraph:
      "Limit exposure, preserve segregation and use suitable temporary insulating barriers where practicable. Record the exposed parts and measures to prevent bridging or inadvertent contact.",
    hazards: ["ENERGISED"],
    confirm: [
      "Which parts are exposed, and the measures used against bridging or inadvertent contact.",
    ],
  },
];

export const MODIFIER_BY_ID = new Map(MODIFIERS.map((modifier) => [modifier.id, modifier]));

/* --- the selection --------------------------------------------------------- */

export type Selection = {
  /**
   * The first activity, in offered order.
   *
   * There is no "main" job any more — every ticked activity counts the same —
   * but saved presets, the API and the stored answers all carry a `presetId`,
   * so the first activity stands in it and the rest go in `alsoIds`.
   */
  presetId: string;
  /** Every other activity selected. */
  alsoIds?: string[];
  /**
   * Methods ticked by hand under the old layout.
   *
   * Methods now follow from the activities and follow-ups. A job saved before
   * that still carries these and still composes with them, so its paperwork
   * does not change underneath it; the job step offers to clear them.
   */
  methods?: MethodKey[];
  /** Site modifiers that apply. */
  modifierIds?: string[];
  /** Answers to the follow-ups, keyed by follow-up id. */
  answers?: Record<string, string>;
};

/** Every activity selected, in offered order, with no repeats. */
export function activityIds(selection: Selection | null): string[] {
  if (!selection) return [];
  const ids = new Set([selection.presetId, ...(selection.alsoIds ?? [])]);
  return PRESETS.filter((preset) => ids.has(preset.id)).map((preset) => preset.id);
}

/**
 * A selection from a flat list of activity ids, or null when there are none.
 * Everything else on the selection is carried across untouched.
 */
export function fromActivities(
  ids: string[],
  rest: Omit<Selection, "presetId" | "alsoIds"> = {},
): Selection | null {
  const wanted = new Set(ids);
  const ordered = PRESETS.filter((preset) => wanted.has(preset.id)).map((preset) => preset.id);
  if (ordered.length === 0) return null;
  return { ...rest, presetId: ordered[0], alsoIds: ordered.slice(1) };
}

/**
 * A selection as it is now written, whatever version saved it.
 *
 * Concrete cutting moves from the site modifiers to the activities, and an RCD
 * attribute left without a phase type is kept (it still composes) — the job
 * step simply lets it be unticked.
 */
export function normalise(selection: Selection): Selection {
  const mods = selection.modifierIds ?? [];
  const ids = activityIds(selection);
  if (mods.includes("CUTTING") && !ids.includes("CONCRETE_CUT")) ids.push("CONCRETE_CUT");
  const next = fromActivities(ids, {
    methods: selection.methods ?? [],
    modifierIds: mods.filter((id) => id !== "CUTTING" && MODIFIER_BY_ID.has(id)),
    answers: selection.answers ?? {},
  });
  return next ?? selection;
}

/* --- the follow-ups -------------------------------------------------------- */

export type FollowUpOption = {
  value: string;
  label: string;
  note?: string;
  /** Added to the scope when chosen. */
  sentence?: string;
  /** Methods chosen with it. */
  methods?: MethodKey[];
};

export type FollowUp = {
  id: string;
  question: string;
  note?: string;
  options: FollowUpOption[];
  /** Listed as still to confirm while it has no answer. */
  outstanding: string;
};

/**
 * The few things the activities cannot say for themselves.
 *
 * Each is asked only when an activity that raises it is selected. None of them
 * is answered by default: until one is answered the wording says nothing about
 * it, and it sits in the still-to-confirm list.
 */
export const FOLLOW_UPS: Record<"verify" | "live" | "logger", FollowUp> = {
  verify: {
    id: "verify",
    question: "How is the installed or replaced work verified on this visit?",
    note: "Nothing is written about testing the installation until this is answered.",
    options: [
      {
        value: "DEAD",
        label: "De-energised tests only",
        note: "Continuity, insulation resistance and polarity, with the circuit isolated",
        sentence:
          "The installed work is verified by de-energised testing (continuity, insulation resistance and polarity) under isolation; results are recorded as the tests are performed.",
      },
      {
        value: "LIVE",
        label: "De-energised tests, then live checks once restored",
        note: "Adds the controlled operating measurement wording",
        sentence:
          "The installed work is verified by de-energised testing under isolation, followed by the live verification checks selected once the supply is restored; results are recorded as the tests are performed.",
        methods: ["MEASURE"],
      },
      {
        value: "NONE",
        label: "Not part of this visit",
        sentence:
          "Testing and verification of the installed work are not part of this visit, and no test results are recorded against it in these documents.",
      },
    ],
    outstanding: "How the installed or replaced work is verified on this visit.",
  },
  live: {
    id: "live",
    question: "Are any readings taken with the supply on?",
    note: "Voltage, current or fault-loop readings for the selected activities.",
    options: [
      {
        value: "YES",
        label: "Yes — readings need the supply on",
        note: "Adds the controlled operating measurement wording",
        methods: ["MEASURE"],
      },
      {
        value: "NO",
        label: "No — nothing is measured live",
        sentence: "No readings are taken with the supply on as part of this scope.",
      },
    ],
    outstanding: "Whether any readings are taken with the supply on.",
  },
  logger: {
    id: "logger",
    question: "Logger fitting, retrieval, or both?",
    options: [
      { value: "FIT", label: "Fitting only", sentence: "This visit fits the monitoring equipment; retrieval is a separate visit." },
      { value: "RETRIEVE", label: "Retrieval only", sentence: "This visit retrieves monitoring equipment fitted on an earlier visit." },
      { value: "BOTH", label: "Both", sentence: "The monitoring equipment is fitted and retrieved on this job." },
    ],
    outstanding: "Whether fitting, removal, or both are in scope for this visit.",
  },
};

/** The follow-ups that apply to a selection, in the order they are asked. */
export function followUpsFor(selection: Selection | null): FollowUp[] {
  const chosen = activityIds(selection).map((id) => PRESET_BY_ID.get(id)!);
  const out: FollowUp[] = [];
  const answers = selection?.answers ?? {};

  if (chosen.some((preset) => preset.group === "INSTALL")) out.push(FOLLOW_UPS.verify);

  const measured =
    chosen.some((preset) => preset.methods?.includes("MEASURE")) ||
    (out.includes(FOLLOW_UPS.verify) && answers.verify === "LIVE");
  if (!measured && chosen.some((preset) => preset.offers?.includes("MEASURE"))) {
    out.push(FOLLOW_UPS.live);
  }

  if (chosen.some((preset) => preset.id === "LOGGER")) out.push(FOLLOW_UPS.logger);
  return out;
}

/* --- composing ------------------------------------------------------------- */

/** One editable paragraph in the preview. */
export type Block = {
  /** Stable across recompositions, so an edit can be matched back to it. */
  id: string;
  heading: string;
  /** The wording as composed. What the assessor sees until they change it. */
  text: string;
};

export type Composition = {
  blocks: Block[];
  /** Template codes the selection calls for, deduplicated. */
  codes: string[];
  /** Why each of those codes is there. */
  why: Record<string, string>;
  /** JSA risk rows the selection adds. */
  hazards: string[];
  /** What still has to be confirmed before the wording is true. */
  confirm: string[];
  /** Which methods ended up selected, for the forms that ask. */
  methods: MethodKey[];
};

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

/** Paragraphs once each, in order, ignoring blanks and spacing differences. */
function paragraphs(values: (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.join("\n\n");
}

/**
 * Each activity's scope paragraph, with both RCD phase types said as one.
 *
 * Single- and three-phase testing on the same job is one RCD test of two kinds
 * of device, so it reads as one sentence rather than two that each start
 * "Perform operational RCD testing".
 */
function scopesOf(chosen: Preset[]): string[] {
  const ids = chosen.map((preset) => preset.id);
  if (!ids.includes("RCD_SINGLE") || !ids.includes("RCD_THREE")) {
    return chosen.map((preset) => preset.scope);
  }
  return chosen
    .filter((preset) => preset.id !== "RCD_THREE")
    .map((preset) =>
      preset.id === "RCD_SINGLE"
        ? "Perform operational RCD testing on the identified single-phase and three-phase devices, using the selected phase test sequence for three-phase devices; record the results for each device and phase, and restoration."
        : preset.scope,
    );
}

/**
 * The draft, built from nothing every time.
 *
 * Every block is derived from the current selection alone. Nothing is carried
 * over, merged in or remembered, so an answer that has been changed cannot
 * leave a sentence behind — which is the one property this has to have. The
 * caller holds the assessor's edits separately and checks them against the
 * fresh wording; see `applyEdits`.
 *
 * Several activities make one result: one scope, one method block, one set of
 * controls. A paragraph two activities share is written once, and the phrase
 * that says a job is testing only is written only when it is.
 */
export function compose(input: Selection): Composition {
  const selection = normalise(input);
  const chosen = activityIds(selection)
    .map((id) => PRESET_BY_ID.get(id))
    .filter((preset): preset is Preset => Boolean(preset));
  if (chosen.length === 0) {
    return { blocks: [], codes: [], why: {}, hazards: [], confirm: [], methods: [] };
  }

  const modifiers = (selection.modifierIds ?? [])
    .map((id) => MODIFIER_BY_ID.get(id))
    .filter((modifier): modifier is Modifier => Boolean(modifier));

  const follows = followUpsFor(selection);
  const answers = selection.answers ?? {};
  const picked = follows
    .map((follow) => follow.options.find((option) => option.value === answers[follow.id]))
    .filter((option): option is FollowUpOption => Boolean(option));

  // Only what the activities and follow-ups bring, plus anything an older job
  // ticked by hand. An installation with nothing to test carries no method.
  const methodOrder = Object.keys(METHODS) as MethodKey[];
  const wanted = new Set<MethodKey>([
    ...chosen.flatMap((preset) => preset.methods ?? []),
    ...picked.flatMap((option) => option.methods ?? []),
    ...(selection.methods ?? []),
  ]);
  const methods = methodOrder.filter((method) => wanted.has(method));

  const blocks: Block[] = [];

  /* the scope */
  const testOnly = chosen.every((preset) => TEST_ONLY.includes(preset.group));
  const both = methods.includes("RCD") && methods.includes("THERMAL");
  blocks.push({
    id: "scope",
    heading: "Scope of work",
    text: paragraphs([
      ...scopesOf(chosen),
      ...picked.map((option) => option.sentence),
      ...chosen.map((preset) => preset.bound),
      both
        ? "Interruption and restoration for RCD testing are coordinated with the thermal inspection so each result remains valid."
        : undefined,
      testOnly ? "No installation, alteration or repair work is included in this scope." : undefined,
    ]),
  });

  /* the method, one paragraph per method selected */
  if (methods.length > 0) {
    blocks.push({
      id: "method",
      heading: methods.length === 1 ? "Test method" : "Test methods",
      text: paragraphs(methods.map((method) => METHODS[method].method)),
    });
    blocks.push({
      id: "alternatives",
      heading: "Alternatives considered",
      text: paragraphs(methods.map((method) => METHODS[method].alternatives)),
    });
  }

  /* the controls, with the modifiers folded in after the general ones */
  blocks.push({
    id: "controls",
    heading: "Controls",
    text: paragraphs([WORDING.generalControls, ...modifiers.map((modifier) => modifier.paragraph)]),
  });

  blocks.push({
    id: "preparation",
    heading: "Preparation and reinstatement",
    text: WORDING.preparation,
  });

  const why: Record<string, string> = {};
  for (const preset of chosen) {
    for (const code of preset.requires ?? []) why[code] ??= `The job — ${preset.label}`;
  }
  for (const method of methods) {
    for (const code of METHODS[method].requires ?? []) why[code] ??= `The job — ${METHODS[method].label}`;
  }
  for (const modifier of modifiers) {
    for (const code of modifier.requires ?? []) why[code] ??= `${modifier.label} — ${modifier.question}`;
  }

  return {
    blocks,
    codes: Object.keys(why),
    why,
    hazards: unique([
      ...chosen.flatMap((preset) => preset.hazards ?? []),
      ...modifiers.flatMap((modifier) => modifier.hazards ?? []),
    ]),
    confirm: unique([
      ...chosen.flatMap((preset) => preset.confirm ?? []),
      ...(both ? ["The order the RCD testing and thermal inspection were actually carried out in."] : []),
      ...follows.filter((follow) => !answers[follow.id]).map((follow) => follow.outstanding),
      ...modifiers.flatMap((modifier) => modifier.confirm ?? []),
    ]),
    methods,
  };
}

/* --- holding on to edits --------------------------------------------------- */

/**
 * What the assessor typed over the top, and the wording they typed it over.
 *
 * Keeping the source alongside the edit is what lets a changed selection be
 * noticed. An edit is applied silently only while the block it was made
 * against still composes to the same words. Once the selection changes that
 * wording, the edit is *stale*: the job step keeps showing it and asks whether
 * to take the new wording or keep the edit, rather than overwriting it. The
 * document builder, which cannot ask, uses the fresh wording.
 */
export type Edit = { source: string; text: string };
export type Edits = Record<string, Edit>;

export type ShownBlock = Block & {
  /** The wording as composed now, before any edit. */
  proposed: string;
  edited: boolean;
  /** Edited against wording the selection has since changed. */
  stale: boolean;
};

export type Applied = {
  blocks: ShownBlock[];
  /** Stale edits, whether or not their block is still composed. */
  dropped: { id: string; heading: string; text: string }[];
};

export function applyEdits(
  composition: Composition,
  edits: Edits | null | undefined,
  { keepStale = false }: { keepStale?: boolean } = {},
): Applied {
  const dropped: Applied["dropped"] = [];
  const blocks = composition.blocks.map((block): ShownBlock => {
    const plain = { ...block, proposed: block.text, edited: false, stale: false };
    const edit = edits?.[block.id];
    if (!edit) return plain;
    if (edit.source !== block.text) {
      dropped.push({ id: block.id, heading: block.heading, text: edit.text });
      return keepStale ? { ...plain, text: edit.text, edited: true, stale: true } : plain;
    }
    return { ...plain, text: edit.text, edited: edit.text !== block.text };
  });

  // An edit whose block is not composed at all any more — the method it
  // belonged to was turned off — is stale on the same grounds.
  for (const [id, edit] of Object.entries(edits ?? {})) {
    if (composition.blocks.some((block) => block.id === id)) continue;
    dropped.push({ id, heading: headingFor(id), text: edit.text });
  }

  return { blocks, dropped };
}

export function headingFor(id: string): string {
  switch (id) {
    case "scope":
      return "Scope of work";
    case "method":
      return "Test method";
    case "alternatives":
      return "Alternatives considered";
    case "controls":
      return "Controls";
    case "preparation":
      return "Preparation and reinstatement";
    default:
      return id;
  }
}

/** The finished wording, as the forms want it: one block to a heading. */
export function textOf(blocks: Block[], id: string): string {
  return blocks.find((block) => block.id === id)?.text ?? "";
}

/* --- what OEC-WHS002 can be offered --------------------------------------- */

/**
 * The parts of OEC-WHS002 the wording can fill, and only those.
 *
 * Scope, method and alternatives are descriptions of intent, so a draft of
 * them saves real typing. The permitted circumstance, its evidence, the risk
 * ratings, the verified controls, the observer decision and the authorisation
 * are confirmations against what is actually in front of the assessor — this
 * returns none of them, and the form keeps asking.
 *
 * The alternatives rows are filled from the methods selected, so a thermal
 * job gets the thermal reasoning against the window row rather than an RCD
 * paragraph that mentions a test point.
 */
export type Whs002Proposal = {
  activityMethod: string;
  alternatives: Partial<Record<"TESTPOINT" | "WINDOW" | "OTHER", string>>;
  /** Shown beside the form: what it still needs before any box is ticked. */
  confirm: string[];
};

export function proposeWhs002(
  composition: Composition,
  blocks: Block[] = composition.blocks,
): Whs002Proposal {
  const scope = textOf(blocks, "scope");
  const method = textOf(blocks, "method");
  const controls = textOf(blocks, "controls");
  const preparation = textOf(blocks, "preparation");

  const alternatives: Whs002Proposal["alternatives"] = {};
  if (composition.methods.includes("RCD")) alternatives.TESTPOINT = WORDING.rcdAlternatives;
  if (composition.methods.includes("THERMAL")) alternatives.WINDOW = WORDING.thermalAlternatives;
  if (composition.methods.includes("MEASURE")) {
    alternatives.OTHER = WORDING.measureAlternatives;
  }

  return {
    activityMethod: [scope, method, controls, preparation].filter(Boolean).join("\n\n"),
    alternatives,
    confirm: [
      ...composition.confirm,
      "The permitted circumstance that applies, and the evidence for it.",
      "The initial and residual risk rating on every row.",
      "Whether an observer is required, and on what basis.",
    ],
  };
}
