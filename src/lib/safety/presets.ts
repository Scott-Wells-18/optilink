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

/* --- the presets ----------------------------------------------------------- */

export type PresetGroup = "INSTALL" | "TESTING" | "MONITORING" | "COMMISSIONING";

export type Preset = {
  id: string;
  group: PresetGroup;
  label: string;
  /** The scope paragraph, as supplied. */
  scope: string;
  /**
   * The testing methods this job normally involves.
   *
   * `methods` are proposed with their box already ticked; `offers` are shown
   * unticked. Neither is forced: a job is whatever was selected, and the
   * wording for a method nobody selected never appears. This is what lets an
   * installation be booked with no testing at all, and a test to be booked
   * with no installation.
   */
  methods?: MethodKey[];
  offers?: MethodKey[];
  /** The main-job answer this stands for, which decides the SWMS. */
  nature: string;
  /** Statements this scope needs beyond the one its nature brings. */
  requires?: string[];
  /**
   * Anything this scope needs confirmed before the wording is true, in the
   * words the assessor will have to answer. Never guessed at, never filled.
   */
  confirm?: string[];
  /** A sentence added after the scope, about how the job is bounded. */
  bound?: string;
};

/**
 * The twenty-four, in the order they are offered.
 *
 * Testing stands on its own. An RCD test, a thermal survey and a current
 * recording are each a whole day's work with nothing installed, so they are
 * main jobs here rather than something reached by first claiming to be doing
 * an installation — which is how a method statement nobody was following used
 * to end up on the front of the paperwork.
 */
export const PRESETS: Preset[] = [
  /* installation */
  {
    id: "GPO_SINGLE",
    group: "INSTALL",
    label: "Single-phase GPO installation",
    scope:
      "Install and verify a single-phase socket-outlet circuit, including cable installation, termination, identification and applicable electrical testing.",
    nature: "GENERAL",
    offers: ["RCD", "MEASURE"],
    confirm: ["The circuit rating and protective device, from the job details."],
  },
  {
    id: "GPO_EXTEND",
    group: "INSTALL",
    label: "Additional GPOs on an existing circuit",
    scope:
      "Extend the identified existing circuit to additional socket outlets and verify the altered work and affected circuit.",
    nature: "GENERAL",
    offers: ["RCD", "MEASURE"],
    confirm: [
      "Which existing circuit is being extended, and how its identity was established.",
      "The interruption arrangements agreed for that circuit.",
    ],
  },
  {
    id: "GPO_REPLACE",
    group: "INSTALL",
    label: "Replacement GPO",
    scope:
      "Replace the identified socket outlet under isolation and complete the applicable verification before return to service.",
    nature: "GENERAL",
    offers: ["RCD", "MEASURE"],
    bound:
      "Any energised stage is restricted to the tests selected for this job; the replacement itself is carried out isolated.",
  },
  {
    id: "OUTLET_THREE",
    group: "INSTALL",
    label: "Three-phase outlet installation",
    scope:
      "Install and verify a three-phase outlet circuit, including conductor identification, termination and applicable electrical tests.",
    nature: "GENERAL",
    offers: ["RCD", "MEASURE"],
    confirm: [
      "Which phases are installed, and the RCD test configuration for the device fitted.",
    ],
  },
  {
    id: "APPLIANCE_SINGLE",
    group: "INSTALL",
    label: "Single-phase appliance circuit",
    scope:
      "Install and verify a dedicated single-phase appliance circuit, local isolation and connection arrangements.",
    nature: "GENERAL",
    offers: ["RCD", "MEASURE"],
    confirm: ["The circuit rating, from the job details."],
  },
  {
    id: "APPLIANCE_THREE",
    group: "INSTALL",
    label: "Three-phase appliance circuit",
    scope:
      "Install and verify a dedicated three-phase appliance circuit, isolation and connection arrangements.",
    nature: "GENERAL",
    offers: ["RCD", "MEASURE"],
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
      "Replace the identified protective device under isolation; verify selection, connections, identification and applicable test results before restoration.",
    nature: "BOARD_MAINT",
    offers: ["RCD", "MEASURE"],
    confirm: [
      "Whether the device fitted is an RCBO, and so whether operational RCD testing applies.",
      "The test points used for that testing.",
    ],
  },
  {
    id: "CIRCUIT_NEW",
    group: "INSTALL",
    label: "New outgoing circuit at an existing board",
    scope:
      "Install and verify a new outgoing circuit at the identified switchboard, with associated cabling, protection and labelling.",
    nature: "BOARD_MAINT",
    offers: ["RCD", "MEASURE"],
    bound: "Any energised stage is limited to the tests selected for this job.",
  },
  {
    id: "SUBBOARD",
    group: "INSTALL",
    label: "Subboard installation",
    scope:
      "Install and verify a subboard, feeder, outgoing circuits, earthing, protection and identification within the recorded job scope.",
    nature: "BOARD_NEW",
    offers: ["RCD", "MEASURE"],
    confirm: [
      "Which boards are involved, and where the feeder is isolated.",
      "Which verification tasks are in scope for this visit.",
    ],
  },
  {
    id: "BOARD_REPLACE",
    group: "INSTALL",
    label: "Switchboard replacement",
    scope:
      "Replace the identified switchboard under controlled isolation, reconnect verified circuits and complete inspection and testing before handover.",
    nature: "BOARD_MODIFY",
    offers: ["RCD", "MEASURE"],
    confirm: [
      "Every supply to the board, including any second or standby supply.",
      "The staged restoration sequence agreed for it.",
    ],
    bound:
      "Testing that needs the supply on is selected separately and is not implied by the replacement itself.",
  },

  /* testing on its own */
  {
    id: "RCD_SINGLE",
    group: "TESTING",
    label: "Single-phase RCD testing only",
    scope:
      "Perform operational RCD testing on the identified single-phase devices and record results and restoration; no installation or repair is included.",
    nature: "RCD",
    methods: ["RCD"],
  },
  {
    id: "RCD_THREE",
    group: "TESTING",
    label: "Three-phase RCD testing only",
    scope:
      "Perform operational RCD testing on the identified three-phase device using the selected phase test sequence; record each phase and restoration.",
    nature: "RCD",
    methods: ["RCD"],
    confirm: ["The device type and configuration, and the phase test sequence used."],
  },
  {
    id: "RCD_BOARDS",
    group: "TESTING",
    label: "Multiple-board RCD testing",
    scope:
      "Test selected RCDs across the listed switchboards in the recorded sequence, with board-specific identification, interruption controls and restoration.",
    nature: "RCD",
    methods: ["RCD"],
    confirm: [
      "The local conditions at each board, recorded separately rather than once for all of them.",
      "The isolation and interruption arrangements for each board.",
    ],
  },
  {
    id: "RCD_RETEST",
    group: "TESTING",
    label: "RCD retest after rectification",
    scope:
      "Retest the identified RCD/circuit after recorded rectification and document the final operational result.",
    nature: "RCD",
    methods: ["RCD"],
    confirm: [
      "The earlier result and the rectification carried out, which are preserved rather than replaced.",
    ],
  },
  {
    id: "THERMAL_CLOSED",
    group: "TESTING",
    label: "Thermal inspection with covers closed",
    scope:
      "Thermally inspect accessible electrical equipment under representative load using a closed-cover method within its stated limitations.",
    nature: "THERMAL",
    methods: ["THERMAL"],
    confirm: ["The actual electrical exposure of the closed-cover position used."],
  },
  {
    id: "THERMAL_WINDOW",
    group: "TESTING",
    label: "Thermal inspection through an infrared window",
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
    group: "TESTING",
    label: "Thermal inspection requiring cover access",
    scope:
      "Thermally inspect the identified equipment under representative load using the assessed minimum-access method.",
    nature: "THERMAL",
    methods: ["THERMAL"],
    requires: ["WHS002"],
    confirm: [
      "The actual justification for the access required, for this equipment on this day.",
    ],
  },
  {
    id: "RCD_AND_THERMAL",
    group: "TESTING",
    label: "Combined RCD testing and thermal imaging",
    scope:
      "Perform identified RCD operational tests and thermal inspection under representative load, coordinating interruption and restoration so each result remains valid.",
    nature: "RCD",
    methods: ["RCD", "THERMAL"],
    requires: ["SWMS013"],
    confirm: ["The order the two were actually carried out in."],
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
    confirm: [
      "Whether the verification method selected needs the supply on. The operating measurement wording is included only where it does.",
    ],
  },

  /* monitoring */
  {
    id: "LOGGER",
    group: "MONITORING",
    label: "Current logger installation and retrieval",
    scope:
      "Fit or retrieve current-monitoring equipment at the identified conductors, using isolation for installation/removal where practicable, and record the monitoring scope.",
    nature: "GENERAL",
    offers: ["MEASURE"],
    bound:
      "Fitting and removal are assessed separately from the recording itself. That a recording is taken with the supply on does not justify fitting or removing the equipment exposed-live.",
    confirm: ["Whether fitting, removal, or both are in scope for this visit."],
  },
  {
    id: "CURRENT_SHORT",
    group: "MONITORING",
    label: "Short-duration circuit current recording",
    scope:
      "Record current on the identified operating circuit using the assessed sensor and access method; record time, conditions and instrument details.",
    nature: "GENERAL",
    methods: ["MEASURE"],
    bound:
      "A protected test point or closed-cover access is used where one can achieve the measurement.",
  },

  /* commissioning */
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
];

export const PRESET_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const GROUP_LABELS: Record<PresetGroup, string> = {
  TESTING: "Testing on its own",
  INSTALL: "Installation and alteration",
  MONITORING: "Monitoring and recording",
  COMMISSIONING: "Commissioning",
};

/** The order the groups are offered in: testing first, because it stands alone. */
export const GROUP_ORDER: PresetGroup[] = ["TESTING", "INSTALL", "MONITORING", "COMMISSIONING"];

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
    label: "Occupied depot or public access",
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
      "Identify affected critical equipment and persons. Agree interruption, contingency, shutdown and restoration arrangements before testing.",
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
    id: "CUTTING",
    question: "Any concrete cutting?",
    label: "Concrete cutting",
    paragraph:
      "Verify hidden services and material, use suitable wet cutting and prompt slurry collection, assess silica exposure and implement the applicable cutting SWMS/JSA.",
    requires: ["SWMS016"],
    hazards: ["HOT_WORKS"],
    confirm: ["How hidden services were located, and what the material is."],
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

/* --- composing ------------------------------------------------------------- */

export type Selection = {
  /** The main job. */
  presetId: string;
  /** Additional activities, as further preset ids. */
  alsoIds?: string[];
  /** Testing methods actually selected for this job. */
  methods?: MethodKey[];
  /** Site modifiers that apply. */
  modifierIds?: string[];
};

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
  /** JSA risk rows the selection adds. */
  hazards: string[];
  /** What still has to be confirmed before the wording is true. */
  confirm: string[];
  /** Which methods ended up selected, for the forms that ask. */
  methods: MethodKey[];
};

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

/**
 * The draft, built from nothing every time.
 *
 * Every block is derived from the current selection alone. Nothing is carried
 * over, merged in or remembered, so an answer that has been changed cannot
 * leave a sentence behind — which is the one property this has to have. The
 * caller holds the assessor's edits separately and drops the ones whose source
 * block has changed; see `applyEdits`.
 */
export function compose(selection: Selection): Composition {
  const main = PRESET_BY_ID.get(selection.presetId);
  if (!main) {
    return { blocks: [], codes: [], hazards: [], confirm: [], methods: [] };
  }

  const also = (selection.alsoIds ?? [])
    .filter((id) => id !== selection.presetId)
    .map((id) => PRESET_BY_ID.get(id))
    .filter((preset): preset is Preset => Boolean(preset));
  const chosen = [main, ...also];

  const modifiers = (selection.modifierIds ?? [])
    .map((id) => MODIFIER_BY_ID.get(id))
    .filter((modifier): modifier is Modifier => Boolean(modifier));

  // Only the methods actually selected. A preset proposes its own and offers
  // others, but what goes in is what came back — so a job with every method
  // turned off carries no testing wording at all, which is what an
  // installation with nothing to test should look like.
  const methods = unique(selection.methods ?? []).filter(
    (method): method is MethodKey => method in METHODS,
  );

  const blocks: Block[] = [];

  /* the scope */
  const scopes = chosen.map((preset) => preset.scope);
  const bounds = chosen.map((preset) => preset.bound).filter(Boolean) as string[];
  blocks.push({
    id: "scope",
    heading: "Scope of work",
    text: [...scopes, ...bounds].join("\n\n"),
  });

  /* the method, one paragraph per method selected */
  if (methods.length > 0) {
    blocks.push({
      id: "method",
      heading: methods.length === 1 ? "Test method" : "Test methods",
      text: methods.map((method) => METHODS[method].method).join("\n\n"),
    });
    blocks.push({
      id: "alternatives",
      heading: "Alternatives considered",
      text: methods.map((method) => METHODS[method].alternatives).join("\n\n"),
    });
  }

  /* the controls, with the modifiers folded in after the general ones */
  blocks.push({
    id: "controls",
    heading: "Controls",
    text: [WORDING.generalControls, ...modifiers.map((modifier) => modifier.paragraph)].join(
      "\n\n",
    ),
  });

  blocks.push({
    id: "preparation",
    heading: "Preparation and reinstatement",
    text: WORDING.preparation,
  });

  return {
    blocks,
    codes: unique([
      ...chosen.flatMap((preset) => preset.requires ?? []),
      ...methods.flatMap((method) => METHODS[method].requires ?? []),
      ...modifiers.flatMap((modifier) => modifier.requires ?? []),
    ]),
    hazards: unique(modifiers.flatMap((modifier) => modifier.hazards ?? [])),
    confirm: unique([
      ...chosen.flatMap((preset) => preset.confirm ?? []),
      ...modifiers.flatMap((modifier) => modifier.confirm ?? []),
    ]),
    methods,
  };
}

/* --- holding on to edits --------------------------------------------------- */

/**
 * What the assessor typed over the top, and the wording they typed it over.
 *
 * Keeping the source alongside the edit is what makes the first rule work. An
 * edit is shown only while the block it was made against still composes to the
 * same words; change an answer and the block recomposes, the source no longer
 * matches, and the edit is dropped rather than left sitting on top of wording
 * it was never written for. The dropped text is handed back so the person can
 * be told what went and put it back if they still want it.
 */
export type Edit = { source: string; text: string };
export type Edits = Record<string, Edit>;

export type Applied = {
  blocks: Block[];
  /** Edits that no longer apply, because what they were edits of has changed. */
  dropped: { id: string; heading: string; text: string }[];
};

export function applyEdits(composition: Composition, edits: Edits | null | undefined): Applied {
  const dropped: Applied["dropped"] = [];
  const blocks = composition.blocks.map((block) => {
    const edit = edits?.[block.id];
    if (!edit) return block;
    if (edit.source !== block.text) {
      dropped.push({ id: block.id, heading: block.heading, text: edit.text });
      return block;
    }
    return { ...block, text: edit.text };
  });

  // An edit whose block is not composed at all any more — the method it
  // belonged to was turned off — is dropped on the same grounds.
  for (const [id, edit] of Object.entries(edits ?? {})) {
    if (composition.blocks.some((block) => block.id === id)) continue;
    dropped.push({ id, heading: headingFor(id), text: edit.text });
  }

  return { blocks, dropped };
}

function headingFor(id: string): string {
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
