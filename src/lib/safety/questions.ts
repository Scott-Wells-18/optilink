/**
 * The questions that decide a job's paperwork.
 *
 * Nobody is asked which SWMS to use. That is the app's job, and it is decided
 * from what the work actually involves — so the questions are about the work:
 * is any of it off the ground, is a board being opened, is anything being
 * worked on live. Each answer brings its own statements and its own risk rows
 * with it, and says how it should read in the job description.
 *
 * A question the quote has already answered is not asked. "Annual RCD testing
 * and thermal survey" settles four of them before anyone taps anything, which
 * is the whole point of reading the quote first.
 */

export type Option = {
  value: string;
  label: string;
  note?: string;
  /** Template codes this answer requires. */
  requires?: string[];
  /** Rows it adds to the JSA's risk table (keys into hazards.ts). */
  hazards?: string[];
  /** How it reads once folded into the job description. */
  describes?: string;
  /** Words in a quote that mean this is the answer, so it is not asked. */
  evidence?: string[];
};

export type Question = {
  key: string;
  question: string;
  note?: string;
  /** Asked even when the quote seems to have answered it. */
  always?: boolean;
  options: Option[];
};

/**
 * What kind of job it is, at heart.
 *
 * Asked first and always, because it decides which risk assessment the job
 * starts from — the company has four, and every other answer adds to whichever
 * one this picks.
 */
const NATURE: Question = {
  key: "nature",
  question: "What is the job, mainly?",
  note: "This decides which risk assessment it starts from. Everything else adds to it.",
  always: true,
  options: [
    {
      value: "GENERAL",
      label: "Electrical equipment and cabling",
      note: "Installing, repairing or replacing equipment on an existing installation",
      requires: ["SWMS001", "JSA001"],
      evidence: [
        "install", "installation", "replace", "repair", "wiring", "cabling", "cable",
        "gpo", "power point", "light", "lighting", "fitting", "circuit", "maintenance",
        "rcd", "safety switch", "thermal", "thermographic", "switchboard", "timer",
        "sensor", "floodlight", "exhaust", "fan", "motor", "isolator",
      ],
    },
    {
      value: "FITOUT",
      label: "Rough-in or fit-out",
      note: "New build, refit or strip-out — first fix through to final fix",
      requires: ["SWMS001A", "JSA001A"],
      evidence: ["rough in", "roughin", "rough-in", "fit out", "fitout", "fit-out", "new build", "refit", "shop fit", "construction", "first fix", "final fix"],
    },
    {
      value: "EMERGENCY",
      label: "Emergency or after-hours call-out",
      note: "A breakdown, a fault, something that could not wait",
      requires: ["SWMS002", "JSA002"],
      hazards: ["AFTER_HOURS"],
      describes: "The work is an emergency attendance outside normal hours.",
      evidence: ["emergency", "after hours", "after-hours", "call out", "call-out", "callout", "breakdown", "urgent", "fault find", "no power"],
    },
    {
      value: "DATA",
      label: "Communications or data cabling",
      note: "Structured cabling, fibre, a comms rack",
      requires: ["SWMS003", "JSA003"],
      hazards: ["DATA_CABLING"],
      describes: "The work includes communications and data cabling.",
      evidence: ["data cabling", "comms", "communications", "cat5", "cat6", "cat 6", "fibre", "fiber", "patch panel", "structured cabling", "comms rack", "network cabling"],
    },
  ],
};

export const QUESTIONS: Question[] = [
  NATURE,
  {
    key: "heights",
    question: "Will any of it be done off the ground?",
    note: "Anything above about two metres, or anywhere a fall could happen.",
    options: [
      { value: "NONE", label: "No — all at ground level" },
      {
        value: "LADDER",
        label: "Ladder or step platform only",
        requires: ["SWMS007"],
        hazards: ["HEIGHT_LADDER"],
        describes: "Part of the work is carried out at height from a ladder or step platform.",
        evidence: ["ladder", "step platform", "stepladder"],
      },
      {
        value: "EWP",
        label: "Scissor lift, boom or EWP",
        requires: ["SWMS007"],
        hazards: ["HEIGHT_EWP"],
        describes:
          "Part of the work is carried out at height from an elevated work platform.",
        evidence: ["ewp", "scissor", "boom lift", "knuckle boom", "elevated work platform", "cherry picker", "travel tower"],
      },
      {
        value: "ROOF",
        label: "Roof, scaffold or an unprotected edge",
        requires: ["SWMS007"],
        hazards: ["HEIGHT_ROOF"],
        describes: "Part of the work is carried out on a roof or at an unprotected edge.",
        evidence: ["roof", "scaffold", "gantry", "mezzanine", "unprotected edge"],
      },
    ],
  },
  {
    key: "board",
    question: "Is a switchboard involved, and what happens to it?",
    options: [
      { value: "NONE", label: "No switchboard work" },
      {
        value: "OPEN",
        label: "Opened for isolation, inspection or maintenance",
        requires: ["SWMS004B"],
        hazards: ["BOARD_ISOLATION"],
        describes:
          "A switchboard is isolated and opened for inspection and maintenance.",
        evidence: ["isolation", "isolate", "main switchboard", "msb", "escutcheon", "board inspection", "switchboard maintenance", "thermal imaging", "thermographic", "rcd testing"],
      },
      {
        value: "NEW",
        label: "A new board installed, or an existing one upgraded",
        requires: ["SWMS004"],
        hazards: ["BOARD_ISOLATION", "BOARD_WORKS"],
        describes: "A switchboard is installed or upgraded.",
        evidence: ["new switchboard", "switchboard install", "board upgrade", "new db", "db install", "upgrade the board"],
      },
      {
        value: "MODIFY",
        label: "An existing board modified, relocated or removed",
        requires: ["SWMS004A"],
        hazards: ["BOARD_ISOLATION", "BOARD_WORKS"],
        describes: "An existing switchboard is modified, relocated or removed.",
        evidence: ["switchboard removal", "remove the board", "relocate the board", "board modification", "modify the board", "replace the board"],
      },
    ],
  },
  {
    key: "energised",
    question: "Will anything be worked on or tested while it is live?",
    note: "Testing that needs supply on counts — RCD trip testing and thermal imaging both do.",
    options: [
      { value: "NO", label: "No — everything isolated and proven dead first" },
      {
        value: "YES",
        label: "Yes — testing or inspection that cannot be done dead",
        requires: ["WHS002"],
        hazards: ["ENERGISED"],
        describes:
          "Some testing is carried out energised because isolation would defeat the test; the energised work justification and PCBU authorisation is completed before it starts.",
        evidence: ["rcd testing", "trip test", "thermal imaging", "thermographic", "thermal survey", "infrared", "live testing", "energised", "energized"],
      },
    ],
  },
  {
    key: "testing",
    question: "Is anything being tested, tagged or commissioned?",
    options: [
      { value: "NO", label: "No" },
      {
        value: "RCD",
        label: "RCD testing",
        requires: ["SWMS014"],
        hazards: ["TEST_AND_TAG"],
        describes: "Every accessible RCD is trip tested and the results recorded.",
        evidence: ["rcd", "safety switch", "rcd test", "trip test", "residual current"],
      },
      {
        value: "TAG",
        label: "Test and tag, or commissioning",
        requires: ["SWMS005"],
        hazards: ["TEST_AND_TAG"],
        describes: "Equipment is tested and tagged, and the installation commissioned.",
        evidence: ["test and tag", "test & tag", "tagging", "commission", "commissioning", "as/nzs 3760"],
      },
      {
        value: "BOTH",
        label: "Both",
        requires: ["SWMS014", "SWMS005"],
        hazards: ["TEST_AND_TAG"],
        describes:
          "Every accessible RCD is trip tested, and equipment is tested, tagged and commissioned.",
      },
    ],
  },
  {
    key: "thermal",
    question: "Any thermal imaging?",
    options: [
      { value: "NO", label: "No" },
      {
        value: "YES",
        label: "Yes — switchboards surveyed with an infrared camera",
        requires: ["SWMS013"],
        describes:
          "Switchboards are surveyed with an infrared camera under normal load.",
        evidence: ["thermal", "thermographic", "thermography", "infrared", "thermal imaging", "ir survey"],
      },
    ],
  },
  {
    key: "ground",
    question: "Any digging, trenching or pit work?",
    options: [
      { value: "NONE", label: "No" },
      {
        value: "DIG",
        label: "Excavation or trenching",
        requires: ["SWMS006"],
        hazards: ["EXCAVATION"],
        describes: "The work includes excavation and trenching.",
        evidence: ["excavat", "trench", "dig", "digging", "bore", "directional drill", "underground run"],
      },
      {
        value: "PIT",
        label: "Cabling or conduit into an existing pit",
        requires: ["SWMS006A"],
        hazards: ["PIT_CABLING"],
        describes: "Cabling and conduit are installed into an existing pit.",
        evidence: ["pit", "haul", "hauling", "draw in", "conduit run", "duct"],
      },
      {
        value: "BOTH",
        label: "Both",
        requires: ["SWMS006", "SWMS006A"],
        hazards: ["EXCAVATION", "PIT_CABLING"],
        describes:
          "The work includes excavation and trenching, and cabling and conduit into pits.",
      },
    ],
  },
  {
    key: "hot",
    question: "Any welding, grinding or cutting with a spark or a flame?",
    options: [
      { value: "NO", label: "No" },
      {
        value: "YES",
        label: "Yes",
        requires: ["SWMS012"],
        hazards: ["HOT_WORKS"],
        describes: "Hot works are carried out under a permit.",
        evidence: ["hot work", "welding", "weld", "grinding", "angle grinder", "oxy", "cutting disc", "brazing"],
      },
    ],
  },
  {
    key: "asbestos",
    question: "Could asbestos be disturbed?",
    note: "Old switchboard panels, eaves, vinyl, anything pre-1990 that has to be drilled or cut.",
    options: [
      { value: "NO", label: "No — nothing suspect, or the register is clear" },
      {
        value: "YES",
        label: "Yes, or it cannot be ruled out",
        requires: ["SWMS009"],
        hazards: ["ASBESTOS"],
        describes:
          "Material that may contain asbestos is present and is managed under the site register.",
        evidence: ["asbestos", "acm", "zelemite", "asbestos register"],
      },
    ],
  },
  {
    key: "supply",
    question: "Anything to do with the incoming supply?",
    options: [
      { value: "NO", label: "No" },
      {
        value: "TEMP",
        label: "Temporary or builder's supply",
        requires: ["SWMS008"],
        hazards: ["TEMP_POWER"],
        describes: "A temporary supply is installed and maintained for the works.",
        evidence: ["temporary supply", "temp power", "builders supply", "builder's supply", "festoon", "site supply"],
      },
      {
        value: "MAKESAFE",
        label: "Disconnection or make-safe",
        requires: ["SWMS010"],
        hazards: ["MAKE_SAFE"],
        describes: "The supply is disconnected and the installation made safe.",
        evidence: ["disconnect", "disconnection", "make safe", "make-safe", "demolition", "abolish"],
      },
    ],
  },
  {
    key: "duct",
    question: "Any ventilation ductwork coming out?",
    options: [
      { value: "NO", label: "No" },
      {
        value: "YES",
        label: "Yes",
        requires: ["SWMS011"],
        hazards: ["DUCT_REMOVAL"],
        describes: "Ventilation ductwork is removed.",
        evidence: ["duct removal", "ductwork", "remove duct", "exhaust duct", "ventilation duct"],
      },
    ],
  },
  {
    key: "site",
    question: "Will the site be occupied while you work?",
    note: "Staff, tenants, the public — anyone who is not on the job.",
    always: true,
    options: [
      { value: "NO", label: "No — shut down, or out of hours" },
      {
        value: "YES",
        label: "Yes — people will be about",
        hazards: ["OCCUPIED_SITE"],
        describes: "The site remains occupied while the work is carried out.",
      },
    ],
  },
];

export const BY_KEY = new Map(QUESTIONS.map((question) => [question.key, question]));

export function optionFor(key: string, value: string): Option | undefined {
  return BY_KEY.get(key)?.options.find((option) => option.value === value);
}
