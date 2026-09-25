/**
 * OEC-WHS002 — energised electrical testing, justification and PCBU
 * authorisation.
 *
 * This is the one document in the library that is not a method statement. It
 * is an authorisation: a form that says why work is being done with the supply
 * on, what was considered instead, what the risk actually is at this board on
 * this day, and who accepted it. So it is not filled in from the job the way a
 * SWMS is. It is asked, section by section, in the form's own order and its
 * own words.
 *
 * Two rules run through all of it.
 *
 * Nothing is invented. Where the form wants evidence — a fault level, a
 * licence number, the outcome of a consultation — the app asks and leaves the
 * box empty if the answer is not known, and says so before anyone downloads
 * it. An authorisation with a plausible-looking number in it that nobody
 * checked is worse than one with a gap.
 *
 * And nothing is assumed from the kind of work. Choosing RCD testing does not
 * authorise anybody to work energised; the form's own gate decides, and it
 * turns on whether a cover comes off, not on what the job is called.
 */

/** The form's own words, printed at the top of page one. */
export const GATE =
  "Complete and sign this form before an escutcheon, cover or barrier is removed, or before testing/thermal imaging places a person near exposed energised parts. De-energised work must be used unless section 157 of the Work Health and Safety Regulation 2025 permits the work and every required control is in place.";

export type Rating = "H" | "M" | "L";

export type Whs002 = {
  /* identification */
  switchboardId?: string;
  circuits?: string;
  nominalVoltage?: string;
  supplyInfo?: string;
  assessedOn?: string;
  assessedAt?: string;
  validFrom?: string;
  validTo?: string;
  /* scope */
  activity?: string;
  activityMethod?: string;
  /* permitted circumstance */
  circumstance?: string;
  circumstanceEvidence?: string;
  /* alternatives, keyed by row */
  alternatives?: Record<string, string>;
  /* the risk assessment, keyed by hazard */
  risk?: Record<string, RiskRow>;
  /* section 158 preliminaries, consultation, competency, pre-start */
  preliminaries?: Record<string, string>;
  consultation?: Record<string, string>;
  equipment?: Record<string, string>;
  preStart?: Record<string, string>;
  /* observer */
  observer?: string;
  observerName?: string;
  observerCompetency?: string;
  observerBasis?: string;
  /* authorisation */
  decision?: string;
  conditions?: string;
  /* close-out */
  closeOut?: string[];
  defects?: string;
};

export type RiskRow = {
  /** Which of the hazard's conditions is true at this board. */
  condition?: string;
  /** Anything the assessor saw that the options do not cover. */
  note?: string;
  initial?: Rating;
  residual?: Rating;
};

/* --- the risk assessment -------------------------------------------------- */

/**
 * One condition, as it will be recorded.
 *
 * The condition and the controls come together on purpose. The form has a
 * column for what was found and a column for what is done about it, and a
 * board recorded as wet and overheating with "controls verified" beside it is
 * a form that contradicts itself. So choosing the condition chooses the
 * controls that answer it, and the ratings that go with it — all three stay
 * editable, but they start out agreeing.
 */
export type Condition = {
  value: string;
  /** Written into "Site-specific condition" exactly as it reads here. */
  label: string;
  /** Added to the controls the form already prints for this hazard. */
  controls: string;
  initial: Rating;
  residual: Rating;
  /** A condition that means the work does not go ahead at all. */
  stop?: boolean;
};

export type HazardRow = {
  key: string;
  /** Exactly as the form prints it — this is how the row is found. */
  hazard: string;
  /** Shown beside the question, so the assessor sees what they are adding to. */
  printedControls: string;
  /** Asked only when the work includes this. */
  when?: (answers: Whs002) => boolean;
  conditions: Condition[];
};

const doingThermal = (answers: Whs002) =>
  answers.activity === "THERMAL" || answers.activity === "BOTH";
const doingRcd = (answers: Whs002) => answers.activity === "RCD" || answers.activity === "BOTH";

export const HAZARDS: HazardRow[] = [
  {
    key: "shock",
    hazard: "Electric shock / inadvertent contact",
    printedControls:
      "Barriers/insulating covers, controlled body position, approach distance and dry stable footing.",
    conditions: [
      {
        value: "SHALLOW",
        label:
          "Escutcheon removed; exposed terminals are recessed behind the chassis and the working position is dry, level and clear.",
        controls: "Work from the side of the board; no part of the body forward of the escutcheon line.",
        initial: "H",
        residual: "L",
      },
      {
        value: "CLOSE",
        label:
          "Exposed terminals are within arm's reach of the working position and cannot be shrouded.",
        controls:
          "Insulating mat and temporary insulating barrier fitted over adjacent terminals; one hand kept clear; second person controls the zone.",
        initial: "H",
        residual: "M",
      },
      {
        value: "WET",
        label: "The working position is damp, cramped or unstable.",
        controls: "Do not proceed energised. Isolate, dry and make the position safe, or reschedule.",
        initial: "H",
        residual: "H",
        stop: true,
      },
    ],
  },
  {
    key: "arc",
    hazard: "Arc flash / arc blast / available fault energy",
    printedControls:
      "Assess switchboard condition, fault level/arc information and exposure; select arc-rated PPE and positioning.",
    conditions: [
      {
        value: "KNOWN",
        label:
          "Prospective fault current for this board is known and recorded in the supply information above.",
        controls:
          "Arc-rated clothing selected against the recorded fault level; face shield worn; stand to the side of the hinge line.",
        initial: "H",
        residual: "M",
      },
      {
        value: "UNKNOWN",
        label:
          "Prospective fault current is not known for this board and could not be obtained before the work.",
        controls:
          "Treat as the worst case for a board of this size: full arc-rated clothing and face shield, minimum exposure time, no work forward of the escutcheon line.",
        initial: "H",
        residual: "M",
      },
      {
        value: "MAIN",
        label:
          "Main switchboard at or above the supply authority's point of attachment, with no upstream protection on the tested section.",
        controls:
          "Do not proceed without recorded arc-flash information and the PCBU's specific approval for this board.",
        initial: "H",
        residual: "H",
        stop: true,
      },
    ],
  },
  {
    key: "adjacent",
    hazard: "Adjacent exposed energised parts",
    printedControls:
      "Expose the minimum area; install temporary insulating barriers where practicable; prevent bridging phases/earth.",
    conditions: [
      {
        value: "SHROUDED",
        label: "Adjacent parts are shrouded or behind fitted barriers once the escutcheon is off.",
        controls: "Only the panel being tested is opened; the rest stays covered.",
        initial: "M",
        residual: "L",
      },
      {
        value: "BUS",
        label: "Unshrouded busbar or incoming terminals are exposed alongside the work.",
        controls:
          "Temporary insulating barrier fitted over the exposed run before any tool goes in; insulated tools only; no reaching across.",
        initial: "H",
        residual: "M",
      },
    ],
  },
  {
    key: "backfeed",
    hazard: "Backfeed / multiple supplies / stored energy",
    printedControls:
      "Identify all sources including generator, UPS, solar and capacitors; mark accessible emergency isolation.",
    conditions: [
      {
        value: "SINGLE",
        label: "One supply only; no generator, UPS, solar or capacitor bank feeds this board.",
        controls: "Main switch identified as the single point of isolation and kept accessible.",
        initial: "M",
        residual: "L",
      },
      {
        value: "MULTI",
        label: "The board has a second source — generator, UPS, solar or stored energy.",
        controls:
          "Every source identified and marked before opening; isolation sequence agreed with the site; second source isolated or confirmed incapable of backfeeding the tested section.",
        initial: "H",
        residual: "M",
      },
      {
        value: "UNCERTAIN",
        label: "It is not certain whether another source can feed this board.",
        controls: "Do not proceed until the supply arrangement is established.",
        initial: "H",
        residual: "H",
        stop: true,
      },
    ],
  },
  {
    key: "condition",
    hazard: "Damaged, wet, contaminated or overheated board",
    printedControls: "Do not proceed; isolate where safe and escalate to the responsible person.",
    conditions: [
      {
        value: "SOUND",
        label:
          "Enclosure, escutcheon, terminations and cable entries inspected and found sound, dry and clean.",
        controls: "Condition re-checked on opening; work stops if anything is found that the inspection missed.",
        initial: "M",
        residual: "L",
      },
      {
        value: "MINOR",
        label:
          "Minor defects found — dust, surface corrosion or a damaged cover — none of them affecting the parts being tested.",
        controls:
          "Defects recorded and reported; the affected area is not disturbed; testing limited to the sound section.",
        initial: "H",
        residual: "M",
      },
      {
        value: "BAD",
        label: "Damage, moisture, contamination or heat damage is present at or near the work.",
        controls: "Do not proceed energised. Isolate where safe and escalate to the responsible person.",
        initial: "H",
        residual: "H",
        stop: true,
      },
    ],
  },
  {
    key: "entry",
    hazard: "Unauthorised entry / inadvertent contact",
    printedControls: "Barricade and sign; authorised persons only; maintain a controlled work zone.",
    conditions: [
      {
        value: "PLANT",
        label: "The board is in a locked plant room with no through traffic.",
        controls: "Door held closed and signed for the duration; nobody admitted without the worker's agreement.",
        initial: "M",
        residual: "L",
      },
      {
        value: "PUBLIC",
        label: "The board is in an occupied area, corridor or workshop that others use.",
        controls:
          "Barriers and signs set at the approach; a second person keeps the zone; work paused whenever anyone enters it.",
        initial: "H",
        residual: "M",
      },
    ],
  },
  {
    key: "access",
    hazard: "Restricted access, poor light or obstructed exit",
    printedControls:
      "Clear entry/exit, suitable task lighting, stable work position and unobstructed emergency access.",
    conditions: [
      {
        value: "CLEAR",
        label: "Clear floor space in front of the board, adequate light and an unobstructed exit.",
        controls: "Access kept clear for the duration; tools and case kept out of the exit path.",
        initial: "M",
        residual: "L",
      },
      {
        value: "TIGHT",
        label: "The approach is narrow, poorly lit or partly obstructed by stored goods.",
        controls:
          "Obstructions cleared and task lighting set before the board is opened; exit path confirmed with the observer.",
        initial: "H",
        residual: "M",
      },
    ],
  },
  {
    key: "outage",
    hazard: "Unexpected outage or plant operation",
    printedControls:
      "Identify loads; approve outage/contingency; warn persons; put plant and life-safety systems in a safe state.",
    conditions: [
      {
        value: "NONCRITICAL",
        label:
          "The circuits being tested carry no life-safety, medical, security, communications or process-control load.",
        controls: "Loads identified from the board's schedule and confirmed with the site before testing.",
        initial: "M",
        residual: "L",
      },
      {
        value: "CRITICAL",
        label:
          "One or more tested circuits carry critical load, so tripping it has consequences beyond the board.",
        controls:
          "Outage approved in writing by the responsible site representative; contingency agreed; affected people warned; testing timed to suit.",
        initial: "H",
        residual: "M",
      },
      {
        value: "UNKNOWN",
        label: "What the circuits feed cannot be established from the board or the site.",
        controls: "Do not test those circuits until what they feed is known.",
        initial: "H",
        residual: "H",
        stop: true,
      },
    ],
  },
  {
    key: "rcd",
    hazard: "RCD testing: probes, settings and wrong circuit",
    printedControls:
      "Positive identification; rated tester/probes; correct RCD type/rating/sequence; prove tester before/after.",
    when: doingRcd,
    conditions: [
      {
        value: "LABELLED",
        label: "The board is legibly labelled and each RCD and its circuits were positively identified.",
        controls:
          "Identification confirmed against the board's own schedule; tester proved before and after; type and rating set per device.",
        initial: "M",
        residual: "L",
      },
      {
        value: "POOR",
        label: "Labelling is missing, wrong or illegible on part of the board.",
        controls:
          "Circuits identified by test before any trip test; nothing tested on an assumption; new labelling recorded and reported.",
        initial: "H",
        residual: "M",
      },
    ],
  },
  {
    key: "camera",
    hazard: "Thermal imaging: covers removed and camera positioning",
    printedControls:
      "Use competent thermographer/electrical worker; secure covers, straps and camera; maintain clearance; no reaching across live parts.",
    when: doingThermal,
    conditions: [
      {
        value: "STANDOFF",
        label: "Every panel can be imaged from outside the exposed zone with the lens fitted.",
        controls: "Camera on a strap, imaged from a standing position; no part of the camera or body enters the zone.",
        initial: "M",
        residual: "L",
      },
      {
        value: "CLOSE",
        label: "One or more panels can only be imaged from close to exposed parts.",
        controls:
          "Escutcheon removed only for that panel and refitted before moving on; camera held at the strap's length; observer positioned to see the hands.",
        initial: "H",
        residual: "M",
      },
    ],
  },
  {
    key: "load",
    hazard: "Thermal imaging: inadequate load / misleading result",
    printedControls:
      "Confirm representative stable load, operating conditions, emissivity/reflections and limitations; record load and image references.",
    when: doingThermal,
    conditions: [
      {
        value: "REPRESENTATIVE",
        label: "The site was operating normally and the load at the time was representative.",
        controls: "Load recorded with the images; emissivity and reflected temperature set for the surfaces imaged.",
        initial: "M",
        residual: "L",
      },
      {
        value: "LIGHT",
        label: "Load at the time of the survey was light or unrepresentative.",
        controls:
          "Recorded as a limitation on the report; findings qualified; a re-survey under representative load recommended.",
        initial: "M",
        residual: "M",
      },
    ],
  },
  {
    key: "rescue",
    hazard: "Emergency response / delayed rescue",
    printedControls:
      "Observer, accessible isolation, LV rescue kit, first aid/AED, communications and site emergency process confirmed.",
    conditions: [
      {
        value: "FULL",
        label:
          "A second person is present, the isolation point is reachable from the working position, and the rescue kit and first aid are on site.",
        controls: "Emergency procedure and site contact confirmed with the observer before opening the board.",
        initial: "H",
        residual: "L",
      },
      {
        value: "REMOTE",
        label:
          "Help is some distance away — a remote site, restricted access, or an isolation point away from the board.",
        controls:
          "Isolation point manned or clearly communicated; phone coverage checked; site emergency contact briefed before work starts; exposure kept to the minimum.",
        initial: "H",
        residual: "M",
      },
    ],
  },
];

/** Which rows this job's answers actually put in play. */
export function hazardsInPlay(answers: Whs002): HazardRow[] {
  return HAZARDS.filter((hazard) => !hazard.when || hazard.when(answers));
}

export function conditionOf(hazard: HazardRow, value: string | undefined): Condition | undefined {
  return hazard.conditions.find((condition) => condition.value === value);
}

/* --- the rest of the form ------------------------------------------------- */

export type Choice = { value: string; label: string; note?: string };

export const ACTIVITIES: Choice[] = [
  { value: "RCD", label: "RCD testing at an energised switchboard" },
  { value: "THERMAL", label: "Thermal imaging of an energised switchboard under representative load" },
  { value: "BOTH", label: "Both activities" },
  { value: "OTHER", label: "Other testing only (describe)" },
];

export const CIRCUMSTANCES: Choice[] = [
  {
    value: "SAFETY",
    label: "Necessary in the interests of health and safety for the equipment to remain energised.",
    note: "Life-safety, medical, security or process plant that cannot be shut down without creating a greater risk.",
  },
  {
    value: "PROPER",
    label: "Necessary for the electrical equipment to be energised so the work can be carried out properly.",
    note: "The measurement itself is of the energised state — a trip time, a thermal pattern under load.",
  },
  {
    value: "S155",
    label: "Necessary for testing required under section 155 of the Regulation.",
    note: "Testing to determine whether the equipment is energised, required by the Regulation itself.",
  },
  {
    value: "NO_ALTERNATIVE",
    label: "No reasonable alternative means of carrying out the work.",
    note: "Only after the alternatives below have actually been considered and written down.",
  },
];

export const ALTERNATIVES: { key: string; label: string }[] = [
  { key: "WHOLE", label: "De-energise the complete switchboard" },
  { key: "SECTION", label: "De-energise the affected section or circuit" },
  { key: "TESTPOINT", label: "Use an external protected test point / closed-cover test" },
  { key: "WINDOW", label: "Use infrared window, remote sensor or permanent monitoring" },
  { key: "RESCHEDULE", label: "Reschedule shutdown or testing under different load" },
  { key: "OTHER", label: "Other alternative / overall justification" },
];

export const PRELIMINARIES: { key: string; label: string; help: string }[] = [
  {
    key: "ASSESSED",
    label: "A competent person has completed and recorded this risk assessment.",
    help: "Who carried it out, and the licence or competency that makes them the competent person.",
  },
  {
    key: "CLEAR",
    label: "The immediate work area is clear of obstructions and permits safe entry and exit.",
    help: "What was moved or cleared, and what the exit path is.",
  },
  {
    key: "ISOLATION",
    label: "The isolation point has been identified, clearly marked and kept accessible.",
    help: "Where it is, and how it is reached from the working position.",
  },
  {
    key: "CONSULTED",
    label:
      "The work is authorised after consultation with the person with management or control of the workplace.",
    help: "Who was consulted, when, and how — this is evidence of a conversation that happened, not an intention.",
  },
  {
    key: "LOADS",
    label: "Affected persons, loads and contingency arrangements have been identified and approved.",
    help: "What the circuits feed, who is affected, and who approved the arrangement.",
  },
];

export const CONSULTED: { key: string; role: string; about: string; help: string }[] = [
  {
    key: "PCBU",
    role: "Person with management or control of workplace",
    about: "Board condition, access, loads, site controls, outages and emergency arrangements",
    help: "Their name and organisation. Leave it blank if nobody has been spoken to yet — the form is not valid without it, and the app will say so.",
  },
  {
    key: "ASSESSOR",
    role: "Risk assessor / competent person",
    about: "Hazards, controls, residual risk and stop-work triggers",
    help: "Whoever carried out the assessment above.",
  },
  {
    key: "WORKER",
    role: "Electrical worker / thermographer",
    about: "Scope, method, competency, tools, PPE and limitations",
    help: "Whoever is doing the testing.",
  },
  {
    key: "OBSERVER",
    role: "Safety observer",
    about: "Position, isolation, rescue, communications and no other duties",
    help: "Leave blank where an exemption is being sought below.",
  },
];

export const EQUIPMENT: { key: string; label: string; help: string; when?: (a: Whs002) => boolean }[] =
  [
    {
      key: "LICENCE",
      label: "Electrical worker name and licence number",
      help: "The licence number as it is printed on the card.",
    },
    {
      key: "THERMOGRAPHER",
      label: "Thermographer name and competency / training",
      help: "The thermography qualification and its level.",
      when: doingThermal,
    },
    {
      key: "TESTER",
      label: "RCD tester, leads and calibration / verification",
      help: "Make, serial and the date it was last calibrated or verified.",
      when: doingRcd,
    },
    {
      key: "CAMERA",
      label: "Thermal camera ID, condition and calibration / verification",
      help: "Make, serial and the date it was last calibrated.",
      when: doingThermal,
    },
    {
      key: "TOOLS",
      label: "Insulated tools, barriers and test accessories",
      help: "What is being taken to the board, and its rating.",
    },
    {
      key: "ARC",
      label: "Arc-rated clothing / PPE rating selected from assessment",
      help: "The arc rating chosen, and the assessment row it came from.",
    },
    {
      key: "GLOVES",
      label: "Insulating gloves and leather protectors where required",
      help: "Class and test date, or the reason none are required for this method.",
    },
    {
      key: "PPE",
      label: "Safety glasses, non-conductive footwear and site PPE",
      help: "Anything the site requires on top of the above.",
    },
  ];

export const PRE_START: { key: string; label: string }[] = [
  { key: "IDENTIFIED", label: "Exact switchboard, RCD/circuit and thermal-imaging panels positively identified." },
  { key: "CIRCUMSTANCE", label: "Permitted circumstance selected and written justification completed." },
  { key: "RISK", label: "Recorded site-specific risk assessment completed and residual risk accepted." },
  { key: "CONSULT", label: "Person with management or control consulted and site requirements confirmed." },
  { key: "ACCESS", label: "Clear access/exit, barricades, signs and authorised-entry control established." },
  { key: "ISOLATION", label: "Isolation point identified, marked, accessible and emergency disconnection method confirmed." },
  { key: "GEAR", label: "Tools, RCD tester, thermal camera, leads, barriers and PPE inspected and suitable." },
  { key: "OBSERVER", label: "Safety observer appointed, or testing-only exemption documented and authorised." },
  { key: "RESCUE", label: "LV rescue kit, first aid, AED, emergency contacts and communications confirmed." },
  { key: "LOADS", label: "Affected loads, safe shutdown, representative thermal load and restoration sequence confirmed." },
  { key: "DOCS", label: "OEC-SWMS014 and OEC-JSA014 are available and understood by the work team." },
];

export const DECISIONS: Choice[] = [
  { value: "APPROVED", label: "Approved" },
  { value: "CONDITIONS", label: "Approved with conditions" },
  { value: "REFUSED", label: "Not approved" },
];

export const CLOSE_OUT: { key: string; label: string }[] = [
  { key: "COVERS", label: "Covers/barriers refitted" },
  { key: "TOOLS", label: "Tools accounted for" },
  { key: "SUPPLY", label: "Supply restored safely" },
  { key: "FAILED", label: "Failed equipment isolated/tagged" },
  { key: "RESULTS", label: "Results and thermal images reported" },
];

/* --- what is still missing ------------------------------------------------ */

/**
 * Everything the form needs that has not been answered.
 *
 * Shown before the download rather than after it. A blank on an authorisation
 * is a question nobody answered, and the person downloading it is the last
 * person who can still answer it.
 */
export function whsGaps(answers: Whs002): string[] {
  const out: string[] = [];
  const need = (value: string | undefined, what: string) => {
    if (!value?.trim()) out.push(what);
  };

  need(answers.switchboardId, "which switchboard this authorises");
  need(answers.circuits, "which RCDs or circuits are being tested");
  need(answers.nominalVoltage, "the nominal voltage");
  need(answers.supplyInfo, "the supply and fault information, or a note that it could not be obtained");
  need(answers.assessedOn, "the date the assessment was actually carried out");
  need(answers.validFrom, "the date the authorisation runs from");
  need(answers.validTo, "the date the authorisation runs to");
  need(answers.activity, "which activity is being authorised");
  need(answers.activityMethod, "the test method, and why it needs the supply on");
  need(answers.circumstance, "the permitted circumstance under section 157");
  need(answers.circumstanceEvidence, "the justification for that circumstance");

  const alternatives = answers.alternatives ?? {};
  const unconsidered = ALTERNATIVES.filter((row) => !alternatives[row.key]?.trim());
  if (unconsidered.length > 0) {
    out.push(
      `why ${unconsidered.length} of the ${ALTERNATIVES.length} alternatives will not work: ${unconsidered
        .map((row) => row.label.toLowerCase())
        .join("; ")}`,
    );
  }

  const risk = answers.risk ?? {};
  for (const hazard of hazardsInPlay(answers)) {
    const row = risk[hazard.key];
    if (!row?.condition) out.push(`the site condition for "${hazard.hazard}"`);
    else if (!row.initial || !row.residual) out.push(`both ratings for "${hazard.hazard}"`);
  }

  const consultation = answers.consultation ?? {};
  for (const row of CONSULTED) {
    if (row.key === "OBSERVER" && answers.observer === "EXEMPT") continue;
    if (!consultation[row.key]?.trim()) out.push(`who was consulted as ${row.role.toLowerCase()}`);
  }

  const gear = answers.equipment ?? {};
  for (const item of EQUIPMENT) {
    if (item.when && !item.when(answers)) continue;
    if (!gear[item.key]?.trim()) out.push(item.label.toLowerCase());
  }

  const preliminaries = answers.preliminaries ?? {};
  for (const item of PRELIMINARIES) {
    if (!preliminaries[item.key]?.trim()) out.push(`evidence for "${item.label}"`);
  }

  const preStart = answers.preStart ?? {};
  for (const item of PRE_START) {
    if (!preStart[item.key]?.trim()) out.push(`the pre-start check "${item.label}"`);
  }

  if (!answers.observer) out.push("whether a safety observer is appointed");
  if (answers.observer === "APPOINTED") {
    need(answers.observerName, "the safety observer's name");
    need(answers.observerCompetency, "the observer's CPR and low-voltage rescue date");
  }
  if (answers.observer === "EXEMPT") {
    need(answers.observerBasis, "the detailed basis for the observer exemption");
  }

  if (!answers.decision) out.push("the authorisation decision");
  if (answers.decision === "CONDITIONS") need(answers.conditions, "the conditions of the approval");

  return out;
}

/**
 * The stop-work conditions the assessor has recorded.
 *
 * These are not gaps — they are answers, and they say the work does not go
 * ahead energised. The form is still produced, because a refusal that was
 * written down is worth having, but nobody should be able to miss them.
 */
export function stopConditions(answers: Whs002): string[] {
  const risk = answers.risk ?? {};
  const out: string[] = [];
  for (const hazard of hazardsInPlay(answers)) {
    const condition = conditionOf(hazard, risk[hazard.key]?.condition);
    if (condition?.stop) out.push(`${hazard.hazard}: ${condition.label}`);
  }
  return out;
}
