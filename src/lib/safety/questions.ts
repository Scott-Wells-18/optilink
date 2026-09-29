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
  /**
   * Asked only when the answers so far call for it.
   *
   * These are the follow-ups. Where two answers cannot both be true — testing
   * that needs the supply on, on a job where nothing is live — the app does not
   * pick one and carry on. It asks.
   */
  when?: (answers: Record<string, string>) => boolean;
  options: Option[];
};

/**
 * What kind of job it is, at heart.
 *
 * Every scope the company has written a statement for is on this list, because
 * every one of them is a job somebody does on its own. An annual RCD test is a
 * whole day's work with nothing installed; so is a thermal survey, so is a
 * board inspection. Offering only the installation scopes here meant reaching
 * a testing statement by first claiming to be doing something else, which put
 * a method on the front of the paperwork that nobody was following.
 *
 * The order is the order these come up, not the order they are numbered: the
 * testing and inspection scopes first, because those are the ones that are
 * most often the entire job.
 *
 * Only the method statement is listed against each answer. The risk assessment
 * written for it comes along on its own — see `decide.ts`.
 */
const NATURE: Question = {
  key: "nature",
  question: "What is the job?",
  note: "Whatever the work mainly is. Everything after this adds to it, so a job that is only testing stops here.",
  always: true,
  options: [
    {
      value: "RCD",
      label: "RCD testing",
      note: "Push-button and instrument trip testing of safety switches, and recording the results",
      requires: ["SWMS014"],
      hazards: ["TEST_AND_TAG"],
      describes: "Every accessible RCD is trip tested and the results recorded.",
      evidence: ["rcd testing", "rcd test", "safety switch", "trip test", "residual current", "rcd"],
    },
    {
      value: "THERMAL",
      label: "Thermal imaging of switchboards",
      note: "An infrared survey under normal load",
      requires: ["SWMS013"],
      describes: "Switchboards are surveyed with an infrared camera under normal load.",
      evidence: ["thermal imaging", "thermographic", "thermography", "infrared", "ir survey", "thermal survey", "thermal"],
    },
    {
      value: "TAGGING",
      label: "Testing, tagging and commissioning",
      note: "Portable appliance testing, tagging, and commissioning an installation",
      requires: ["SWMS005"],
      hazards: ["TEST_AND_TAG"],
      describes: "Equipment is tested and tagged, and the installation commissioned.",
      evidence: ["test and tag", "test & tag", "tagging", "commission", "commissioning", "as/nzs 3760"],
    },
    {
      value: "BOARD_MAINT",
      label: "Switchboard isolation, inspection or maintenance",
      note: "A board opened up and gone through — no new work installed",
      requires: ["SWMS004B"],
      hazards: ["BOARD_ISOLATION"],
      describes: "A switchboard is isolated and opened for inspection and maintenance.",
      evidence: ["board inspection", "switchboard maintenance", "msb", "main switchboard", "isolation", "isolate", "escutcheon"],
    },
    {
      value: "GENERAL",
      label: "Electrical equipment and cabling",
      note: "Installing, repairing or replacing equipment on an existing installation",
      requires: ["SWMS001"],
      describes: "Electrical equipment and cabling are installed, repaired or replaced.",
      evidence: [
        "install", "installation", "replace", "repair", "wiring", "cabling", "cable",
        "gpo", "power point", "light", "lighting", "fitting", "circuit", "maintenance",
        "timer", "sensor", "floodlight", "exhaust", "fan", "motor", "isolator",
      ],
    },
    {
      value: "FITOUT",
      label: "Rough-in or fit-out",
      note: "New build, refit or strip-out — first fix through to final fix",
      requires: ["SWMS001A"],
      describes: "The work is an electrical and communications rough-in and fit-out.",
      evidence: ["rough in", "roughin", "rough-in", "fit out", "fitout", "fit-out", "new build", "refit", "shop fit", "construction", "first fix", "final fix"],
    },
    {
      value: "EMERGENCY",
      label: "Emergency or after-hours call-out",
      note: "A breakdown, a fault, something that could not wait",
      requires: ["SWMS002"],
      hazards: ["AFTER_HOURS"],
      describes: "The work is an emergency attendance outside normal hours.",
      evidence: ["emergency", "after hours", "after-hours", "call out", "call-out", "callout", "breakdown", "urgent", "fault find", "no power"],
    },
    {
      value: "DATA",
      label: "Communications or data cabling",
      note: "Structured cabling, fibre, a comms rack",
      requires: ["SWMS003"],
      hazards: ["DATA_CABLING"],
      describes: "The work includes communications and data cabling.",
      evidence: ["data cabling", "comms", "communications", "cat5", "cat6", "cat 6", "fibre", "fiber", "patch panel", "structured cabling", "comms rack", "network cabling"],
    },
    {
      value: "BOARD_NEW",
      label: "Switchboard installation or upgrade",
      note: "A new board, or an existing one upgraded",
      requires: ["SWMS004"],
      hazards: ["BOARD_ISOLATION", "BOARD_WORKS"],
      describes: "A switchboard is installed or upgraded.",
      evidence: ["new switchboard", "switchboard install", "board upgrade", "new db", "db install", "upgrade the board"],
    },
    {
      value: "BOARD_MODIFY",
      label: "Switchboard removal, modification or relocation",
      requires: ["SWMS004A"],
      hazards: ["BOARD_ISOLATION", "BOARD_WORKS"],
      describes: "An existing switchboard is modified, relocated or removed.",
      evidence: ["switchboard removal", "remove the board", "relocate the board", "board modification", "modify the board", "replace the board"],
    },
    {
      value: "EXCAVATION",
      label: "Excavation and pit installation",
      requires: ["SWMS006"],
      hazards: ["EXCAVATION"],
      describes: "The work includes excavation and pit installation.",
      evidence: ["excavat", "trench", "dig", "digging", "bore", "directional drill", "pit installation"],
    },
    {
      value: "PIT",
      label: "Cabling and conduit into an existing pit",
      requires: ["SWMS006A"],
      hazards: ["PIT_CABLING"],
      describes: "Cabling and conduit are installed into an existing pit.",
      evidence: ["haul", "hauling", "draw in", "conduit run", "underground cable"],
    },
    {
      value: "HEIGHTS",
      label: "Work at heights",
      note: "Where the height is the job rather than a part of it",
      requires: ["SWMS007"],
      hazards: ["HEIGHT_EWP"],
      describes: "The work is carried out at height.",
      evidence: ["work at height", "working at heights"],
    },
    {
      value: "TEMPORARY",
      label: "Temporary or builder's supply",
      requires: ["SWMS008"],
      hazards: ["TEMP_POWER"],
      describes: "A temporary supply is installed and maintained for the works.",
      evidence: ["temporary supply", "temp power", "builders supply", "builder's supply", "festoon", "site supply"],
    },
    {
      value: "ASBESTOS",
      label: "Asbestos-related electrical work",
      note: "Where the asbestos is known and the work is planned around it",
      requires: ["SWMS009"],
      hazards: ["ASBESTOS"],
      describes:
        "Material that may contain asbestos is present and the work is managed under the site register.",
      evidence: ["asbestos", "acm", "zelemite", "asbestos register"],
    },
    {
      value: "MAKESAFE",
      label: "Service disconnection and make-safe",
      requires: ["SWMS010"],
      hazards: ["MAKE_SAFE"],
      describes: "The supply is disconnected and the installation made safe.",
      evidence: ["disconnect", "disconnection", "make safe", "make-safe", "demolition", "abolish"],
    },
    {
      value: "DUCT",
      label: "Ventilation duct removal",
      requires: ["SWMS011"],
      hazards: ["DUCT_REMOVAL"],
      describes: "Ventilation ductwork is removed.",
      evidence: ["duct removal", "ductwork", "remove duct", "exhaust duct", "ventilation duct"],
    },
    {
      value: "HOTWORKS",
      label: "Hot works",
      note: "Welding, grinding or cutting as the work itself",
      requires: ["SWMS012"],
      hazards: ["HOT_WORKS"],
      describes: "Hot works are carried out under a permit.",
      evidence: ["hot work", "hot works", "welding", "weld", "brazing", "oxy"],
    },
  ],
};

/** The main jobs each follow-up would only repeat. */
const COVERED: Record<string, string[]> = {
  heights: ["HEIGHTS"],
  board: ["BOARD_NEW", "BOARD_MODIFY", "BOARD_MAINT"],
  testing: ["RCD", "TAGGING"],
  thermal: ["THERMAL"],
  ground: ["EXCAVATION", "PIT"],
  hot: ["HOTWORKS"],
  asbestos: ["ASBESTOS"],
  supply: ["TEMPORARY", "MAKESAFE"],
  duct: ["DUCT"],
  // Testing that needs the supply on does not need to be asked whether it is
  // live. It is; what matters is whether anything is opened up, which is the
  // follow-up below.
  energised: ["RCD", "THERMAL"],
};

/** True when the main job has already answered this follow-up. */
function settled(key: string, answers: Record<string, string>): boolean {
  return (COVERED[key] ?? []).includes(answers.nature);
}

export const QUESTIONS: Question[] = [
  NATURE,
  {
    key: "heights",
    question: "Will any of it be done off the ground?",
    note: "Anything above about two metres, or anywhere a fall could happen.",
    when: (answers) => !settled("heights", answers),
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
    when: (answers) => !settled("board", answers),
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
    when: (answers) => !settled("energised", answers),
    options: [
      { value: "NO", label: "No — everything isolated and proven dead first" },
      {
        value: "YES",
        label: "Yes — testing or inspection that cannot be done dead",
        hazards: ["ENERGISED"],
        describes:
          "Some testing is carried out with the supply on, because isolating it would defeat the test.",
        evidence: ["rcd testing", "trip test", "thermal imaging", "thermographic", "thermal survey", "infrared", "live testing", "energised", "energized"],
      },
    ],
  },
  {
    key: "testing",
    question: "Is anything being tested, tagged or commissioned?",
    when: (answers) => !settled("testing", answers),
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
    when: (answers) => !settled("thermal", answers),
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
    when: (answers) => !settled("ground", answers),
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
    when: (answers) => !settled("hot", answers),
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
    when: (answers) => !settled("asbestos", answers),
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
    when: (answers) => !settled("supply", answers),
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
    when: (answers) => !settled("duct", answers),
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
  /**
   * The question OEC-WHS002 asks, in its own words.
   *
   * Choosing RCD testing is not an authorisation to work on anything
   * energised, and the form does not say it is. What it says is: complete this
   * before an escutcheon, cover or barrier is removed, or before testing or
   * thermal imaging puts a person near an exposed energised part. So that is
   * what is asked, and only that answer brings the form in.
   *
   * It is also the question that settles a contradiction. A job that says
   * nothing is live and then says it is trip testing RCDs has said two things
   * that cannot both be true; neither is quietly overruled, this decides it.
   */
  {
    key: "exposed",
    question: "Is anything opened up while the supply is on?",
    note:
      "Testing with the supply on is one thing; being near an exposed live part is another. OEC-WHS002 is about the second, and this is the answer that decides whether you need it.",
    when: (answers) =>
      answers.nature === "RCD" ||
      answers.nature === "THERMAL" ||
      answers.nature === "BOARD_MAINT" ||
      answers.energised === "YES" ||
      answers.testing === "RCD" ||
      answers.testing === "BOTH" ||
      answers.thermal === "YES",
    options: [
      {
        value: "CLOSED",
        label: "Nothing is opened — every cover, escutcheon and barrier stays on",
        note: "Push-button and instrument testing from the front of a closed board, or imaging through a fitted infrared window",
        describes:
          "Testing is carried out with the supply on, with every cover, escutcheon and barrier in place; no person is near an exposed energised part.",
      },
      {
        value: "OPEN",
        label: "An escutcheon, cover or barrier comes off",
        note: "Which puts a person near exposed energised parts, whatever the work is called",
        requires: ["WHS002"],
        hazards: ["ENERGISED"],
        describes:
          "Testing places a person near exposed energised parts, so the energised work justification and PCBU authorisation is completed and authorised before it starts.",
      },
    ],
  },
  /**
   * A board is being opened on a job that said it had no switchboard work.
   */
  {
    key: "boardOpened",
    question: "Which board is being opened?",
    note:
      "You have said there is no switchboard work, but the testing needs a board open. One of those has to change.",
    when: (answers) => answers.board === "NONE" && answers.exposed === "OPEN",
    options: [
      {
        value: "BOARD",
        label: "A switchboard is opened for the testing after all",
        requires: ["SWMS004B"],
        hazards: ["BOARD_ISOLATION"],
        describes: "A switchboard is opened for inspection and testing.",
      },
      {
        value: "NONE",
        label: "No switchboard — it is a socket, an appliance or a fitted test point",
        describes:
          "The testing is carried out at a socket outlet, an appliance or a fitted test point rather than inside a switchboard.",
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
