import { isEmptyRow } from "@/lib/rcd/parse";
import { TERMINALS, type InstallRow, type Measurement, type Terminals } from "@/lib/install/parse";

/**
 * An installation test, put together from several tester files.
 *
 * The tester's connection drops, and when it comes back it starts counting at
 * S_1 again in a new file. So an installation is read from separately
 * labelled uploads — insulation, RCD, and polarity / voltage — each holding as
 * many files as it took, in the order the operator confirms.
 *
 * The rules, in the order they are applied:
 *
 *   1. Every record keeps where it came from: the file, the S number the
 *      instrument gave it, and its position in that file. An S number is only
 *      unique inside its own file, so a record's identity is file + S number,
 *      and two files that both hold an S_2 hold two different records.
 *   2. The accepted records are settled first — deliberate dummies, accidental
 *      tests and repeats are set aside, by the operator or by a per-file
 *      setting they can see and undo. Nothing is set aside on a reading's
 *      value alone; a suspicious value is flagged, never removed.
 *   3. Only then are the groups formed, so a record set aside never takes a
 *      place in a phase pair or an outlet group.
 *   4. Groups are filled against an explicit arrangement — which readings, at
 *      which terminals, on which phase — and checked against the terminal
 *      labels the instrument wrote. A missing, repeated or unexpected pair is
 *      raised, not papered over by counting.
 *
 * Nothing here touches a stored reading.
 */

/* --- the three upload sections --------------------------------------------- */

export type Section = "INSULATION" | "VOLTAGE" | "RCD";

export const SECTIONS: Section[] = ["INSULATION", "RCD", "VOLTAGE"];

export const SECTION_LABELS: Record<Section, string> = {
  INSULATION: "Insulation Resistance",
  RCD: "RCD Testing",
  VOLTAGE: "Polarity / Voltage Measurements",
};

/** What a record in each section should be, by the instrument's function. */
export const SECTION_KIND: Record<Section, Measurement> = {
  INSULATION: "INSULATION",
  RCD: "RCD",
  VOLTAGE: "VOLTAGE_PHASE",
};

/**
 * The function names the instrument writes, as far as they are confirmed.
 *
 * "Auto" is confirmed against a real RCD export (Major Tech, six trip times a
 * record). "VOLTAGE/PHASE" with "V/Phase=<pair>" in its parameters is
 * confirmed from a real voltage export. "INSULATION" is the label the operator
 * reports; no insulation export has been seen, so its parameters are read
 * loosely and anything unrecognised is held for review rather than guessed.
 */
export const KNOWN_FUNCTIONS: Record<Section, string> = {
  INSULATION: "INSULATION (parameters not yet confirmed against a real export)",
  RCD: "Auto — one ×½ / ×1 / ×5 sequence at 0° and 180° per record",
  VOLTAGE: "VOLTAGE/PHASE — V/Phase=L-PE, L-N or N-PE",
};

/** A legacy report's single mixed export, before uploads were separated. */
export type FileSection = Section | "MIXED";

export function sectionOfKind(kind: Measurement): Section | null {
  if (kind === "INSULATION") return "INSULATION";
  if (kind === "RCD") return "RCD";
  if (kind === "VOLTAGE_PHASE") return "VOLTAGE";
  return null;
}

/* --- the files ---------------------------------------------------------------- */

export type TestFile = {
  /** The uploaded file's id, which is also how its records are identified. */
  fileId: string;
  originalName: string;
  section: FileSection;
  rows: InstallRow[];
  /** What the export said about itself. */
  header?: {
    title?: string | null;
    siteName?: string | null;
    boardNumber?: string | null;
    circuitRange?: string | null;
    createdAt?: string | null;
  } | null;
  notes?: string[];
  /** Set the file's first record aside as a deliberate dummy test. */
  excludeFirst: boolean;
  /**
   * Whether the operator has looked at that setting for this file.
   *
   * The first file in a section follows the normal workflow. A continuation
   * file — the one started after the connection dropped — may or may not
   * open with a dummy, so its setting is asked about until it is confirmed.
   */
  dummyConfirmed: boolean;
};

/** The normal workflow: a dummy first record for insulation and voltage, none for RCD. */
export function dummyDefault(section: FileSection): boolean {
  return section === "INSULATION" || section === "VOLTAGE";
}

/* --- the operator's decisions -------------------------------------------------- */

export type Mark = "GENUINE" | "ACCIDENTAL" | "REPEAT" | "REVIEW";

export const MARK_LABELS: Record<Mark, string> = {
  GENUINE: "Genuine",
  ACCIDENTAL: "Accidental test",
  REPEAT: "Repeated test",
  REVIEW: "Requires review",
};

export type MarkEntry = {
  mark: Mark;
  reason?: string;
  /**
   * Set when a reading that looks like a failure was marked accidental, and
   * the operator confirmed it. Without this a failure-like reading cannot be
   * set aside.
   */
  confirmedFailure?: boolean;
};

export type Arrangement = {
  /** Which preset this came from, so the screen can show it selected. */
  preset: string;
  /** "L1 / red", "L2 / white", "L3 / blue" — one block of readings each. */
  phaseNames: string[];
  /** The readings in one block, in the order they are taken: "A–N", "A–PE". */
  labels: string[];
  /** The operator has looked at this arrangement and confirmed it. */
  confirmed: boolean;
};

export type Arrangements = Record<Section, Arrangement>;

/** Moving a record into a group by hand. */
export type Assignment = { section: Section; group: number };

export type Phases = "SINGLE" | "THREE";

/* --- arrangements ---------------------------------------------------------------- */

export type Preset = {
  id: string;
  label: string;
  note: string;
  phaseNames: (phases: Phases) => string[];
  labels: string[];
};

const PHASE_NAMES = ["L1 / red", "L2 / white", "L3 / blue"];

export const PRESETS: Record<Section, Preset[]> = {
  INSULATION: [
    {
      id: "TWO_PER_PHASE",
      label: "Two readings per phase: A–N and A–PE",
      note:
        "Your usual arrangement. One reading between active and neutral, one between active and " +
        "earth, for each phase.",
      phaseNames: (phases) => (phases === "THREE" ? PHASE_NAMES : ["Phase"]),
      labels: ["A–N", "A–PE"],
    },
    {
      id: "LIVE_TO_EARTH",
      label: "One reading per phase: A–PE",
      note: "Each active to earth on its own.",
      phaseNames: (phases) => (phases === "THREE" ? PHASE_NAMES : ["Phase"]),
      labels: ["A–PE"],
    },
    {
      id: "COMBINED",
      label: "Combined: all live conductors to earth",
      note:
        "Actives and neutral connected together and tested to earth in one reading, where the " +
        "instrument and circuit allow it.",
      phaseNames: () => ["All live conductors"],
      labels: ["Live–PE"],
    },
    {
      id: "CUSTOM",
      label: "Custom",
      note: "Set the phase blocks and the readings in each block yourself.",
      phaseNames: (phases) => (phases === "THREE" ? PHASE_NAMES : ["Phase"]),
      labels: ["A–N", "A–PE"],
    },
  ],
  VOLTAGE: [
    {
      id: "WITH_NEUTRAL",
      label: "L–PE, L–N and N–PE at each phase",
      note:
        "Three readings a phase: one group per outlet or appliance on single-phase, nine per group " +
        "on three-phase with a neutral.",
      phaseNames: (phases) => (phases === "THREE" ? ["L1", "L2", "L3"] : ["L"]),
      labels: ["L-PE", "L-N", "N-PE"],
    },
    {
      id: "NO_NEUTRAL",
      label: "No neutral: L–PE at each phase",
      note: "A three-phase circuit without a neutral. One reading per phase.",
      phaseNames: (phases) => (phases === "THREE" ? ["L1", "L2", "L3"] : ["L"]),
      labels: ["L-PE"],
    },
    {
      id: "CUSTOM",
      label: "Custom",
      note: "Set the terminal pairs in each phase block yourself (L-PE, L-N, N-PE).",
      phaseNames: (phases) => (phases === "THREE" ? ["L1", "L2", "L3"] : ["L"]),
      labels: ["L-PE", "L-N", "N-PE"],
    },
  ],
  RCD: [
    {
      id: "PER_PHASE",
      label: "One AUTO sequence per phase of the device",
      note:
        "Each record is one AUTO sequence (×½, ×1 and ×5 at 0° and 180°) on one phase. A " +
        "single-phase device has one; a three-phase device has three, whatever width it takes " +
        "on the board.",
      phaseNames: (phases) => (phases === "THREE" ? ["L1", "L2", "L3"] : ["Device"]),
      labels: ["AUTO"],
    },
    {
      id: "ONE_PER_DEVICE",
      label: "One AUTO sequence per device",
      note: "One record per device, whatever its phases.",
      phaseNames: () => ["Device"],
      labels: ["AUTO"],
    },
  ],
};

export function presetArrangement(section: Section, id: string, phases: Phases): Arrangement {
  const preset = PRESETS[section].find((option) => option.id === id) ?? PRESETS[section][0];
  return {
    preset: preset.id,
    phaseNames: preset.phaseNames(phases),
    labels: [...preset.labels],
    confirmed: false,
  };
}

export function defaultArrangements(phases: Phases): Arrangements {
  return {
    INSULATION: presetArrangement("INSULATION", "TWO_PER_PHASE", phases),
    VOLTAGE: presetArrangement("VOLTAGE", "WITH_NEUTRAL", phases),
    RCD: presetArrangement("RCD", "PER_PHASE", phases),
  };
}

/** "L-PE", "L1–PE", "A-PE" → the pair the instrument can record. */
export function pairOfLabel(label: string): Terminals | null {
  const text = label.replace(/[–—]/g, "-").replace(/\s+/g, "").toUpperCase();
  const match = /^(L[123]?|A[123]?|N)-(PE|E|N)$/.exec(text);
  if (!match) return null;
  const from = match[1].startsWith("N") ? "N" : "L";
  const to = match[2] === "E" ? "PE" : match[2];
  const pair = `${from}-${to}`;
  return TERMINALS.includes(pair as Terminals) ? (pair as Terminals) : null;
}

/** "L1–PE" from phase "L1" and label "L-PE"; "N–PE" stays as it is. */
export function slotLabel(phase: string, label: string): string {
  const pretty = label.replace(/-/g, "–");
  const short = /^L\d$/i.exec(phase.trim().split(/\s/)[0] ?? "")?.[0];
  if (short && /^L–/.test(pretty)) return pretty.replace(/^L/, short.toUpperCase());
  return pretty;
}

/* --- verification ------------------------------------------------------------------ */

export type CategoryKey =
  | "VISUAL"
  | "CONTINUITY"
  | "INSULATION"
  | "POLARITY"
  | "CONNECTIONS"
  | "EFLI"
  | "RCD";

export type Status = "RECORDED" | "PENDING" | "NOT_PERFORMED" | "NOT_APPLICABLE";

export const STATUS_LABELS: Record<Status, string> = {
  RECORDED: "Recorded",
  PENDING: "Pending",
  NOT_PERFORMED: "Not performed",
  NOT_APPLICABLE: "Not applicable",
};

/**
 * Visual inspection and the six tests of AS/NZS 3000 Section 8.
 *
 * The clause numbers are the ones AS/NZS 3000:2018 uses (8.2 for visual
 * inspection, 8.3.5 to 8.3.10 for the tests). They are printed as references
 * only, and the report asks that they be checked against the edition and
 * amendments in force — nothing here quotes a limit from the standard.
 */
export const CATEGORIES: {
  key: CategoryKey;
  label: string;
  clause: string;
  /** The upload section that can carry tester records for it, if any. */
  section: Section | null;
  hint: string;
}[] = [
  {
    key: "VISUAL",
    label: "Visual inspection",
    clause: "8.2",
    section: null,
    hint: "Record what was inspected, or attach the checklist used.",
  },
  {
    key: "CONTINUITY",
    label: "Earthing continuity",
    clause: "8.3.5",
    section: null,
    hint: "Record the continuity readings, e.g. main earth and protective earthing conductors.",
  },
  {
    key: "INSULATION",
    label: "Insulation resistance",
    clause: "8.3.6",
    section: "INSULATION",
    hint: "Tester records from the Insulation Resistance uploads, or a manual record.",
  },
  {
    key: "POLARITY",
    label: "Polarity",
    clause: "8.3.7",
    section: "VOLTAGE",
    hint:
      "Voltage readings between terminals support this but are not on their own a polarity " +
      "verification. Record how polarity was verified.",
  },
  {
    key: "CONNECTIONS",
    label: "Correct circuit connections",
    clause: "8.3.8",
    section: null,
    hint: "Record how the circuit connections were verified.",
  },
  {
    key: "EFLI",
    label: "Earth fault-loop impedance / automatic disconnection",
    clause: "8.3.9",
    section: null,
    hint: "Record the loop impedance readings or the method used to verify disconnection.",
  },
  {
    key: "RCD",
    label: "RCD operation",
    clause: "8.3.10",
    section: "RCD",
    hint: "Tester records from the RCD Testing uploads, or a manual record.",
  },
];

export type CategoryEntry = {
  selected: boolean;
  status: Status;
  /** Why a category was not performed or does not apply. */
  reason?: string;
  /** A manual record or other evidence, where no tester file carries it. */
  evidence?: string;
};

export type Verification = Partial<Record<CategoryKey, CategoryEntry>>;

/* --- records ---------------------------------------------------------------------- */

export type Flag = {
  text: string;
  /** A reading that may be a genuine failure: it cannot be set aside unconfirmed. */
  failureLike: boolean;
};

export type Rec = InstallRow & {
  /** fileId:S_n — unique across files where the S number alone is not. */
  id: string;
  fileId: string;
  fileName: string;
  /** Which file of its section, from 1, in the confirmed order. */
  fileNo: number;
  /** The section it was uploaded into ("MIXED" for an older single export). */
  uploadedAs: FileSection;
  /** The section it is used in, or null where it does not belong to one. */
  section: Section | null;
  /** Its place in its own file, from 1. */
  position: number;
  /** Place in the continuous working sequence of accepted records, from 1. */
  seq: number | null;
  /** Insulation pair the instrument wrote, where it wrote one. */
  pairText: string | null;
  flags: Flag[];
  state: "ACCEPTED" | "EXCLUDED" | "HELD";
  /** Why it is not accepted, for an excluded or held record. */
  why: string | null;
  mark: MarkEntry | null;
};

export type Placed = {
  /** Which phase block, and which reading in it. */
  phase: string;
  label: string;
  record: Rec | null;
  /** Set where the label the instrument wrote does not match the slot. */
  mismatch: string | null;
};

export type Group = {
  index: number;
  name: string;
  slots: Placed[];
  /** Records placed in this group that fit no slot — repeats and strays. */
  extras: { record: Rec; why: string }[];
  missing: string[];
  complete: boolean;
};

export type Issue = {
  title: string;
  detail: string;
  /** The record ids it is about. */
  records: string[];
  /** Blocks a complete report until resolved. */
  blocking: boolean;
};

export type SectionResult = {
  section: Section;
  files: { file: TestFile; count: number; accepted: number; unexpected: number }[];
  accepted: Rec[];
  groups: Group[];
  /** Accepted records that could not be placed: no terminal pair. */
  unplaced: Rec[];
};

export type Analysis = {
  records: Rec[];
  sections: Record<Section, SectionResult>;
  excluded: Rec[];
  held: Rec[];
  issues: Issue[];
  verification: Record<CategoryKey, CategoryEntry>;
  /** True only where every category is recorded or justified not applicable. */
  complete: boolean;
};

export type Input = {
  phases: Phases;
  files: TestFile[];
  marks: Record<string, MarkEntry>;
  arrangements: Partial<Arrangements>;
  groupNames: Partial<Record<Section, string[]>>;
  assignments: Record<string, Assignment>;
  verification: Verification;
};

export function recordId(fileId: string, name: string): string {
  return `${fileId}:${name}`;
}

/* --- the analysis ------------------------------------------------------------------ */

export function analyse(input: Input): Analysis {
  const arrangements = { ...defaultArrangements(input.phases), ...input.arrangements };
  const records: Rec[] = [];
  const fileCounts = new Map<string, { count: number; accepted: number; unexpected: number }>();
  const fileNo = new Map<FileSection, number>();

  for (const file of input.files) {
    const number = (fileNo.get(file.section) ?? 0) + 1;
    fileNo.set(file.section, number);
    const tally = { count: file.rows.length, accepted: 0, unexpected: 0 };
    fileCounts.set(file.fileId, tally);

    file.rows.forEach((row, at) => {
      const id = recordId(file.fileId, row.name);
      const mark = input.marks[id] ?? null;
      const own = sectionOfKind(row.kind);
      const matches = file.section === "MIXED" ? own !== null : own === file.section;
      if (!matches) tally.unexpected += 1;

      let state: Rec["state"] = "ACCEPTED";
      let why: string | null = null;
      let section: Section | null = file.section === "MIXED" ? own : file.section;

      if (mark?.mark === "ACCIDENTAL" || mark?.mark === "REPEAT") {
        state = "EXCLUDED";
        why = `${MARK_LABELS[mark.mark]}${mark.reason && mark.reason !== MARK_LABELS[mark.mark] ? ` — ${mark.reason}` : ""}`;
      } else if (mark?.mark !== "GENUINE" && at === 0 && file.excludeFirst) {
        state = "EXCLUDED";
        why = "Deliberate dummy test (first record of the file)";
      } else if (!matches && mark?.mark !== "GENUINE") {
        state = "HELD";
        why =
          own === null
            ? "Function not recognised — held for review"
            : `Recorded as ${KIND_WORDS[row.kind]} in the ${SECTION_LABELS[file.section as Section]} upload — held for review`;
      } else if (!matches) {
        // Confirmed genuine: used where its own function says it belongs.
        section = own;
        if (section === null) {
          state = "HELD";
          why = "Function not recognised — it cannot be placed in a section";
        }
      }

      if (state === "ACCEPTED") tally.accepted += 1;

      records.push({
        ...row,
        id,
        fileId: file.fileId,
        fileName: file.originalName,
        fileNo: number,
        uploadedAs: file.section,
        section,
        position: at + 1,
        seq: null,
        pairText: insulationPair(row),
        flags: [],
        state,
        why,
        mark,
      });
    });
  }

  flagRecords(records);

  const issues: Issue[] = [];
  const sections = {} as Record<Section, SectionResult>;
  for (const section of SECTIONS) {
    const accepted = records.filter((record) => record.state === "ACCEPTED" && record.section === section);
    accepted.forEach((record, at) => {
      record.seq = at + 1;
    });
    const filesHere = input.files.filter((file) => file.section === section);
    const result = group(
      section,
      accepted,
      arrangements[section],
      input.groupNames[section] ?? [],
      input.assignments,
      issues,
    );
    sections[section] = {
      section,
      files: filesHere.map((file) => ({ file, ...(fileCounts.get(file.fileId) ?? { count: 0, accepted: 0, unexpected: 0 }) })),
      accepted,
      ...result,
    };
  }

  /* --- what still needs a decision ----------------------------------------- */
  for (const section of SECTIONS) {
    const filesHere = input.files.filter((file) => file.section === section);
    filesHere.forEach((file, at) => {
      if (at > 0 && dummyDefault(section) && !file.dummyConfirmed) {
        const first = file.rows[0];
        issues.push({
          title: `Confirm whether ${file.originalName} starts with a dummy test`,
          detail:
            `This is a continuation file in ${SECTION_LABELS[section]}. Its first record ` +
            `(${first?.name ?? "none"}) is ${file.excludeFirst ? "currently set aside as a dummy" : "currently counted"}. ` +
            "After a reconnect the first record may be genuine — confirm the setting for this file.",
          records: first ? [recordId(file.fileId, first.name)] : [],
          blocking: true,
        });
      }
      const tally = fileCounts.get(file.fileId);
      if (tally && tally.unexpected > 0) {
        issues.push({
          title: `${tally.unexpected} unexpected ${tally.unexpected === 1 ? "record" : "records"} in ${file.originalName}`,
          detail:
            `This file was uploaded as ${SECTION_LABELS[section]}, but some records carry another ` +
            "function, or one that is not recognised. They are held out of the results, not " +
            "reclassified. Check the file is in the right section, or mark each record.",
          records: records
            .filter((record) => record.fileId === file.fileId && record.state === "HELD")
            .map((record) => record.id),
          blocking: true,
        });
      }
    });
    if (filesHere.length > 0 && !arrangements[section].confirmed) {
      issues.push({
        title: `Confirm the ${SECTION_LABELS[section]} test arrangement`,
        detail:
          "The grouping follows the arrangement selected for this section. Check the phase blocks " +
          "and terminal labels, then confirm it.",
        records: [],
        blocking: true,
      });
    }
  }

  for (const record of records) {
    if (record.mark?.mark === "REVIEW") {
      issues.push({
        title: `${ref(record)} is marked as requiring review`,
        detail: record.mark.reason || "Decide whether it is genuine, accidental or a repeat.",
        records: [record.id],
        blocking: true,
      });
    }
    if (record.state === "ACCEPTED" && record.flags.length > 0 && record.mark?.mark !== "GENUINE") {
      issues.push({
        title: `${ref(record)}: ${record.flags[0].text}`,
        detail:
          record.flags.map((flag) => flag.text).join(" ") +
          (record.flags.some((flag) => flag.failureLike)
            ? " It stays in the results: a reading that may be a genuine failure is never removed without your confirmation."
            : " Mark it genuine, accidental or a repeat."),
        records: [record.id],
        blocking: false,
      });
    }
    if (
      record.state === "EXCLUDED" &&
      record.mark?.mark === "ACCIDENTAL" &&
      record.flags.some((flag) => flag.failureLike) &&
      !record.mark.confirmedFailure
    ) {
      issues.push({
        title: `${ref(record)} looks like a failure but is marked accidental`,
        detail: "Confirm that this reading was accidental, or mark it genuine so it stays in the report.",
        records: [record.id],
        blocking: true,
      });
    }
  }

  const verification = resolveVerification(input.verification, sections);
  for (const category of CATEGORIES) {
    const entry = verification[category.key];
    if (!entry.selected) continue;
    if ((entry.status === "NOT_APPLICABLE" || entry.status === "NOT_PERFORMED") && !entry.reason?.trim()) {
      issues.push({
        title: `${category.label}: give a reason`,
        detail: `${STATUS_LABELS[entry.status]} needs a reason on the report.`,
        records: [],
        blocking: true,
      });
    }
    if (entry.status === "RECORDED") {
      const fromTester = category.section ? sections[category.section].accepted.length : 0;
      const testerCounts = category.key !== "POLARITY" && fromTester > 0;
      if (!testerCounts && !entry.evidence?.trim()) {
        issues.push({
          title: `${category.label}: recorded, but no record given`,
          detail:
            category.key === "POLARITY"
              ? "Voltage readings alone are not a polarity verification. Note how polarity was verified."
              : "There are no tester records for this category. Enter the manual record or evidence.",
          records: [],
          blocking: true,
        });
      }
    }
  }

  const complete =
    CATEGORIES.every((category) => {
      const entry = verification[category.key];
      if (!entry.selected) return false;
      if (entry.status === "RECORDED") return true;
      return entry.status === "NOT_APPLICABLE" && Boolean(entry.reason?.trim());
    }) && !issues.some((issue) => issue.blocking);

  return {
    records,
    sections,
    excluded: records.filter((record) => record.state === "EXCLUDED"),
    held: records.filter((record) => record.state === "HELD"),
    issues,
    verification,
    complete,
  };
}

const KIND_WORDS: Record<Measurement, string> = {
  INSULATION: "insulation",
  VOLTAGE_PHASE: "voltage / phase",
  RCD: "RCD",
  UNKNOWN: "an unrecognised function",
};

/** "File 2 · S_4" — the reference that is unique. */
export function ref(record: Pick<Rec, "fileNo" | "name">): string {
  return `File ${record.fileNo} · ${record.name}`;
}

/* --- verification statuses --------------------------------------------------------- */

function resolveVerification(
  stored: Verification,
  sections: Record<Section, SectionResult>,
): Record<CategoryKey, CategoryEntry> {
  const out = {} as Record<CategoryKey, CategoryEntry>;
  for (const category of CATEGORIES) {
    const held = stored[category.key];
    if (held) {
      out[category.key] = { ...held };
      continue;
    }
    // Never assumed complete. A tester-backed category with records is
    // suggested as recorded; polarity is not, because voltages are not it.
    const records = category.section ? sections[category.section].accepted.length : 0;
    out[category.key] = {
      selected: records > 0,
      status: records > 0 && category.key !== "POLARITY" ? "RECORDED" : "PENDING",
    };
  }
  return out;
}

/* --- suspicious readings ------------------------------------------------------------ */

const BACK_TO_BACK = 90_000;

function timeOf(row: InstallRow): number | null {
  if (!row.takenAt) return null;
  const at = row.takenAt instanceof Date ? row.takenAt : new Date(row.takenAt);
  const ms = at.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * What is worth a look, read from the function, the unit, the terminal pair and
 * the result together. A flag is a question; nothing is set aside by one.
 *
 * Zero is not one answer. N–PE near zero is what a healthy point reads; L–PE
 * near zero is no supply, a fault, or a test fired at nothing; an insulation
 * reading of zero is a fault until somebody says otherwise.
 */
function flagRecords(records: Rec[]) {
  for (const record of records) {
    const flags: Flag[] = [];
    if (record.kind === "INSULATION") {
      if (record.megohms === null && record.megohmsAtLeast === null) {
        flags.push({ text: "No resistance value could be read from this record.", failureLike: false });
      } else if (record.megohms !== null && record.megohms < 1) {
        flags.push({
          text: `Low insulation resistance (${record.megohms} MΩ) — this may be a fault.`,
          failureLike: true,
        });
      }
    }
    if (record.kind === "VOLTAGE_PHASE" && record.terminals) {
      const own = record.readings[record.terminals];
      if (own === undefined) {
        flags.push({ text: `No ${record.terminals} voltage on this record.`, failureLike: false });
      } else if (record.terminals !== "N-PE" && own < 50) {
        flags.push({
          text: `${record.terminals} reads ${own} V — no supply, a fault, or a test taken at nothing.`,
          failureLike: true,
        });
      } else if (record.terminals === "N-PE" && own > 10) {
        flags.push({ text: `N–PE reads ${own} V, higher than expected.`, failureLike: true });
      }
    }
    if (record.kind === "VOLTAGE_PHASE" && !record.terminals) {
      flags.push({ text: "No terminal pair on this voltage record.", failureLike: false });
    }
    if (record.kind === "RCD" && record.rcd) {
      const test = record.rcd;
      if (isEmptyRow(test)) {
        flags.push({
          text: "No trip times were recorded — possibly fetched without a test.",
          failureLike: false,
        });
      } else {
        if ([test.ratedAt0, test.ratedAt180, test.fiveAt0, test.fiveAt180].includes("NO_TRIP")) {
          flags.push({ text: "Did not trip at rated or five times rated current.", failureLike: true });
        }
        if ([test.halfAt0, test.halfAt180].some((reading) => typeof reading === "number")) {
          flags.push({ text: "Tripped at half rated current.", failureLike: true });
        }
      }
    }
    record.flags = flags;
  }

  // A possible repeat: same file, same function and pair, the same values,
  // within moments of the one before. Equal values on their own are not enough
  // — four healthy outlets read the same — and an S number never is.
  for (let at = 1; at < records.length; at += 1) {
    const record = records[at];
    const before = records[at - 1];
    if (record.fileId !== before.fileId || record.kind !== before.kind) continue;
    const a = timeOf(record);
    const b = timeOf(before);
    if (a === null || b === null || Math.abs(a - b) > BACK_TO_BACK) continue;
    if (sameReading(record, before)) {
      record.flags.push({
        text: `Possible repeat of ${before.name}: the same reading moments later.`,
        failureLike: false,
      });
    }
  }
}

function sameReading(a: InstallRow, b: InstallRow): boolean {
  if (a.kind === "VOLTAGE_PHASE") {
    return (
      a.terminals !== null &&
      a.terminals === b.terminals &&
      a.readings[a.terminals] === b.readings[b.terminals as Terminals]
    );
  }
  if (a.kind === "INSULATION") {
    return a.megohms === b.megohms && a.megohmsAtLeast === b.megohmsAtLeast && a.rawParameters === b.rawParameters;
  }
  if (a.kind === "RCD") return JSON.stringify(a.rcd && { ...a.rcd, name: 0, takenAt: 0 }) === JSON.stringify(b.rcd && { ...b.rcd, name: 0, takenAt: 0 });
  return false;
}

/** An insulation record's own terminal pair, where the instrument wrote one. */
function insulationPair(row: InstallRow): string | null {
  if (row.kind !== "INSULATION") return null;
  const match = /\b((?:L|A)[123]?|N)\s*[-–]\s*(PE|E|N)\b/i.exec(`${row.rawParameters} ${row.rawResult}`);
  return match ? `${match[1].toUpperCase()}–${match[2].toUpperCase()}` : null;
}

/* --- grouping ----------------------------------------------------------------------- */

function group(
  section: Section,
  accepted: Rec[],
  arrangement: Arrangement,
  names: string[],
  assignments: Record<string, Assignment>,
  issues: Issue[],
): Pick<SectionResult, "groups" | "unplaced"> {
  const phaseNames = arrangement.phaseNames.length > 0 ? arrangement.phaseNames : ["Phase"];
  const labels = arrangement.labels.length > 0 ? arrangement.labels : ["Reading"];
  const byPair = section === "VOLTAGE";

  const groups: Group[] = [];
  const unplaced: Rec[] = [];

  const open = (index: number): Group => {
    while (groups.length <= index) {
      const at = groups.length;
      groups.push({
        index: at,
        name: names[at]?.trim() ?? "",
        slots: phaseNames.flatMap((phase) =>
          labels.map((label) => ({ phase, label, record: null, mismatch: null })),
        ),
        extras: [],
        missing: [],
        complete: false,
      });
    }
    return groups[index];
  };

  const blockOf = (target: Group, phase: number) =>
    target.slots.slice(phase * labels.length, (phase + 1) * labels.length);
  const full = (slots: Placed[]) => slots.every((slot) => slot.record);

  /* Records moved by hand go where they were put, and are kept out of the run. */
  const manual = accepted.filter((record) => assignments[record.id]?.section === section);
  const auto = accepted.filter((record) => assignments[record.id]?.section !== section);

  // Placed first, so the automatic run flows around them.
  for (const record of manual) {
    const target = open(Math.max(0, assignments[record.id].group));
    const slot = byPair
      ? target.slots.find((held) => !held.record && pairOfLabel(held.label) === record.terminals)
      : target.slots.find((held) => !held.record);
    if (slot) place(slot, record, byPair);
    else target.extras.push({ record, why: "Moved here by hand, but no slot for it is free" });
  }

  let current = 0;
  let phase = 0;

  for (const record of auto) {
    if (byPair && !record.terminals) {
      unplaced.push(record);
      continue;
    }
    // Skip past groups already filled by hand.
    let target = open(current);
    while (full(target.slots)) {
      current += 1;
      phase = 0;
      target = open(current);
    }
    while (full(blockOf(target, phase))) phase += 1;

    const block = blockOf(target, phase);
    const slot = byPair
      ? block.find((held) => !held.record && pairOfLabel(held.label) === record.terminals)
      : block.find((held) => !held.record);

    if (!slot) {
      const repeated = block.some((held) => held.record?.terminals === record.terminals);
      target.extras.push({
        record,
        why: repeated
          ? `${record.terminals} was already taken in ${phaseNames[phase]} before the block was finished — a repeat, or a reading of the next point with one missing`
          : `${record.terminals ?? "This pair"} is not in the arrangement for this group`,
      });
      continue;
    }

    place(slot, record, byPair);
    if (full(block)) {
      phase += 1;
      if (phase >= phaseNames.length) {
        phase = 0;
        current += 1;
      }
    }
  }

  for (const target of groups) {
    target.missing = target.slots
      .filter((slot) => !slot.record)
      .map((slot) => {
        const label = slotLabel(slot.phase, slot.label);
        return label.startsWith(slot.phase.split(" ")[0]) ? label : `${slot.phase} ${label}`;
      });
    target.complete = target.missing.length === 0 && target.extras.length === 0;
    const title = `${SECTION_LABELS[section]} group ${target.index + 1}${target.name ? ` (${target.name})` : ""}`;
    const placed = target.slots.flatMap((slot) => (slot.record ? [slot.record.id] : []));
    if (target.missing.length > 0) {
      issues.push({
        title: `${title} is incomplete`,
        detail: `Missing: ${target.missing.join(", ")}. Nothing has been carried over from another group to fill it.`,
        records: placed,
        blocking: true,
      });
    }
    if (target.extras.length > 0) {
      issues.push({
        title: `${title} has ${target.extras.length} record${target.extras.length === 1 ? "" : "s"} that fit no slot`,
        detail: target.extras.map((extra) => `${ref(extra.record)}: ${extra.why}.`).join(" "),
        records: target.extras.map((extra) => extra.record.id),
        blocking: true,
      });
    }
    for (const slot of target.slots) {
      if (slot.mismatch) {
        issues.push({
          title: `${title}: label does not match`,
          detail: slot.mismatch,
          records: slot.record ? [slot.record.id] : [],
          blocking: true,
        });
      }
    }
    if (section === "RCD") {
      const tests = target.slots.flatMap((slot) => (slot.record?.rcd ? [slot.record.rcd] : []));
      const ratings = new Set(tests.map((test) => `${test.ratingMa}/${test.waveform}/${test.selective}`));
      if (ratings.size > 1) {
        issues.push({
          title: `${title} mixes RCD settings`,
          detail:
            "The records in this group were taken at different ratings or types, so they may belong to " +
            "different devices. Move them into separate groups if so.",
          records: placed,
          blocking: true,
        });
      }
    }
  }

  if (unplaced.length > 0) {
    issues.push({
      title: `${unplaced.length} ${SECTION_LABELS[section]} record${unplaced.length === 1 ? "" : "s"} could not be placed`,
      detail: "No terminal pair was recorded, so they cannot be matched to a slot. Move them by hand or mark them.",
      records: unplaced.map((record) => record.id),
      blocking: true,
    });
  }

  return { groups, unplaced };
}

function place(slot: Placed, record: Rec, byPair: boolean) {
  slot.record = record;
  if (byPair) return;
  // Insulation: check the instrument's own pair against the slot, where both say one.
  if (record.pairText) {
    const wrote = record.pairText.replace(/^A/, "L").replace(/[123]/, "").replace("–E", "–PE");
    const wants = slot.label.replace(/^A/, "L").replace(/[123]/, "").replace(/-/g, "–").replace("–E", "–PE");
    if (/^[LN]–(PE|N)$/.test(wants) && wrote !== wants) {
      slot.mismatch = `${ref(record)} was recorded at ${record.pairText}, but its slot is ${slot.label}.`;
    }
  }
}
