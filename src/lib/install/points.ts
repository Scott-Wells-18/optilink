import { TERMINALS, type InstallRow, type Terminals } from "@/lib/install/parse";

/**
 * Turning a run of voltage readings into tested points.
 *
 * A point — a powerpoint, a GPO, an appliance — is tested three times: line to
 * earth, line to neutral, neutral to earth. Three complete sets is three
 * points. S_1 to S_9 is three points, not nine results.
 *
 * What this does NOT do is take every three consecutive rows as a set. The
 * operator tests in whatever order the work happens, repeats one that looked
 * wrong, and occasionally fires off a reading by accident. So a set is closed
 * when a terminal pair comes round again, not when three rows have gone by —
 * which means an incomplete set stays incomplete and is shown as such rather
 * than being quietly finished off with the first reading of the next point.
 *
 * Nothing here invents a reading. A point missing its N-PE is a point missing
 * its N-PE, and it says so on the report.
 */

export type Point = {
  /** "P1" — the reference the operator sees and the report prints. */
  ref: string;
  /** What the operator called it: "Powerpoint 1", "GPO 1/2", "Dishwasher". */
  name: string;
  /** The reading taken at each pair, where one was. */
  readings: Partial<Record<Terminals, InstallRow>>;
  /** Which pairs are missing. Empty on a complete point. */
  missing: Terminals[];
};

export type Grouping = {
  points: Point[];
  /** Readings that could not be placed at all — no terminal pair on them. */
  stray: InstallRow[];
  /**
   * Readings the instrument took twice, left out of the points.
   *
   * Kept here rather than dropped: they are listed on the report with what
   * they read and what they repeat, and they are still in the file.
   */
  repeats: Repeat[];
};

/** A reading that repeated one already taken at the point being built. */
export type Repeat = {
  row: InstallRow;
  /** The reading it repeats, which is the one the point keeps. */
  of: InstallRow;
  /** True where the two disagree, which is a re-take rather than a stutter. */
  differs: boolean;
};

/**
 * The voltage readings, grouped.
 *
 * `names` carries whatever the operator has already named, keyed by the first
 * reading's S number so a name sticks to its point when the grouping is
 * recomputed — adding an exclusion renumbers nothing.
 */
export function groupPoints(
  rows: InstallRow[],
  names: Record<string, string> = {},
): Grouping {
  const voltage = rows.filter((row) => row.kind === "VOLTAGE_PHASE");
  const stray = voltage.filter((row) => row.terminals === null);
  const placed = voltage.filter((row) => row.terminals !== null);

  type Set = { readings: Partial<Record<Terminals, InstallRow>> };
  const sets: Set[] = [];
  const repeats: Repeat[] = [];
  let current: Set | null = null;

  /*
   * Three records make a point, and the record says which of the three it is.
   *
   * The instrument's result column lists all three voltages on every line, but
   * that is the set of values it currently sees — not three measurements taken
   * at once. What a record IS is in its parameters: "V/Phase=L-N" is the L-N
   * reading of the point being worked. So the operator takes L-N, then L-PE,
   * then N-PE, and those three records are one tested point.
   *
   * Which means the result column is read for the record's own pair and no
   * other. Taking the first number on the line instead is what reported a
   * neutral-to-earth reading of 240 V where the instrument recorded 1 V.
   */
  for (const row of placed) {
    const pair = row.terminals as Terminals;

    if (!current) {
      current = { readings: { [pair]: row } };
      continue;
    }

    const held = current.readings[pair];
    if (held) {
      /*
       * The pair has come round again, and whether that is a new point or a
       * repeat is answered by whether this one is finished.
       *
       * Finished: all three taken, so this is the operator moving on, and the
       * reading opens the next point.
       *
       * Not finished: the operator cannot have moved on, because the point
       * they were on is still a reading short. Taking the same pair twice
       * before the set is full is test pressed twice — so the second one is
       * left out and the set carries on filling.
       *
       * This is the difference between reading S_12 L-PE, S_13 N-PE, S_14 N-PE
       * again, S_15 L-N as two half points — which is what it used to do, and
       * what it looks like on the page: a point missing its L-N beside a point
       * missing its L-PE — and reading it as the one point it is, S_12, S_13
       * and S_15, with S_14 set aside as the repeat.
       */
      if (!TERMINALS.every((terminal) => current!.readings[terminal])) {
        /*
         * Which of the two the point keeps.
         *
         * The same reading twice is test pressed twice: the probes have not
         * moved, so either will do and the first is kept, which keeps the
         * references stable.
         *
         * Two different readings at the same pair is a re-take: the operator
         * looked at the first, did not believe it, and took it again. The
         * second is the one they settled on, so it takes the place of the
         * first — which is what turns a stray 12 V from a probe that had not
         * seated into the 239 V that was there. Either way the one that is not
         * kept is listed and said.
         */
        const differs = row.readings[pair] !== held.readings[pair];
        if (differs) current.readings[pair] = row;
        repeats.push({ row: differs ? held : row, of: differs ? row : held, differs });
        continue;
      }
      sets.push(current);
      current = { readings: { [pair]: row } };
      continue;
    }

    current.readings[pair] = row;

    // Three pairs is a point. The next reading starts the next one.
    if (TERMINALS.every((terminal) => current!.readings[terminal])) {
      sets.push(current);
      current = null;
    }
  }
  if (current) sets.push(current);

  const points = sets.map((set, at) => {
    const first = TERMINALS.map((terminal) => set.readings[terminal]).find(Boolean);
    const key = first?.name ?? `point:${at}`;
    return {
      ref: `P${at + 1}`,
      name: names[key] ?? "",
      readings: set.readings,
      missing: TERMINALS.filter((terminal) => !set.readings[terminal]),
    };
  });

  return { points, stray, repeats };
}

/** The S number a point's name is filed under. */
export function pointKey(point: Point): string {
  const first = TERMINALS.map((terminal) => point.readings[terminal]).find(Boolean);
  return first?.name ?? point.ref;
}

/* --- what the operator should look at --------------------------------------- */

export type Phases = "SINGLE" | "THREE";

export const PHASE_LABELS: Record<Phases, string> = {
  SINGLE: "Single-phase",
  THREE: "Three-phase",
};

/**
 * What the scope expects to find.
 *
 * One insulation test and one RCD auto sequence on a single-phase
 * installation; three RCD sequences on a three-phase one, one per phase. The
 * voltage readings are however many points were tested, so there is no
 * expected number for them.
 */
export const EXPECTED: Record<Phases, { insulation: number; rcd: number }> = {
  SINGLE: { insulation: 1, rcd: 1 },
  THREE: { insulation: 1, rcd: 3 },
};

/**
 * How close in time two identical tests have to be to look like one test
 * pressed twice rather than two outlets that read the same.
 */
const BACK_TO_BACK = 90;

/**
 * When a row was recorded, in milliseconds.
 *
 * A freshly read row carries a Date; the same row read back off the report
 * carries the string that Date was stored as. Both are handled here so that
 * neither caller has to know which it is holding.
 */
function timeOf(row: InstallRow): number | null {
  if (!row.takenAt) return null;
  const at = row.takenAt instanceof Date ? row.takenAt : new Date(row.takenAt);
  const ms = at.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export type Anomaly = {
  /** What to call it in a list. */
  title: string;
  /** Why it is being raised, in a sentence somebody can act on. */
  detail: string;
  /** The rows it is about, so the original values can be looked at. */
  rows: string[];
  /** True where this is simply more than the scope expected, not a fault. */
  surplus: boolean;
};

/**
 * Anything worth a second look before the report is issued.
 *
 * Every one of these is a question rather than a verdict. An extra reading is
 * a possible repeat, not an invalid one; an extra insulation or RCD record may
 * be a second circuit rather than a mistake. The operator looks at the
 * original values and decides, and nothing is removed without them saying so.
 */
export function anomaliesOf(
  rows: InstallRow[],
  grouping: Grouping,
  phases: Phases,
): Anomaly[] {
  const out: Anomaly[] = [];

  /*
   * The readings that were taken twice, and have been left out.
   *
   * Stated rather than asked, because the grouping has already acted on it: a
   * pair taken again before the point was finished cannot be a new point, so
   * the second one is not in the results. What is left to decide is only the
   * case where the two disagree — then it was a re-take, and which of the two
   * readings is the right one is a question for the person who took them.
   */
  const duplicates = new Set(grouping.repeats.map((repeat) => repeat.row.name));
  for (const { row, of, differs } of grouping.repeats) {
    const pair = row.terminals as Terminals;
    out.push({
      title: differs
        ? `${of.name} re-takes ${row.name}, and the two disagree`
        : `${row.name} repeats ${of.name} and has been left out`,
      detail: differs
        ? `${row.name} read ${row.readings[pair]} V at ${pair} and ${of.name} read ` +
          `${of.readings[pair]} V at the same pair, before the point was finished. Two different ` +
          `readings at one pair is a reading taken again, so the point keeps ${of.name} as the one ` +
          `that was settled on and ${row.name} is set aside. If it was the other way round, set ` +
          `${of.name} aside instead.`
        : `${of.name} and ${row.name} are both the ${pair} reading at the same point, and both read ` +
          `${row.readings[pair]} V. A pair is taken once at a point, so ${row.name} is test pressed ` +
          `twice and is not counted in the results. It is listed with the records set aside and is ` +
          "still in the instrument's own export.",
      rows: [of.name, row.name],
      surplus: true,
    });
  }

  /* --- the points -------------------------------------------------------- */
  for (const point of grouping.points) {
    if (point.missing.length > 0 && point.missing.length < 3) {
      out.push({
        title: `${point.ref} is an incomplete set`,
        detail:
          `No ${point.missing.join(" or ")} reading was taken at this point. Either it was not ` +
          "tested, or a reading belonging to it was recorded somewhere else in the file.",
        rows: Object.values(point.readings).map((row) => row.name),
        surplus: false,
      });
    }
  }

  /* --- one pair recorded more often than the others ---------------------- */
  const byPair = new Map<Terminals, InstallRow[]>();
  for (const row of rows) {
    if (row.kind !== "VOLTAGE_PHASE" || !row.terminals) continue;
    if (duplicates.has(row.name)) continue;
    byPair.set(row.terminals, [...(byPair.get(row.terminals) ?? []), row]);
  }
  const counts = TERMINALS.map((terminal) => byPair.get(terminal)?.length ?? 0);
  const most = Math.max(...counts);
  TERMINALS.forEach((terminal, at) => {
    if (counts[at] > 0 && counts[at] === most && most > Math.min(...counts.filter(Boolean))) {
      out.push({
        title: `${counts[at]} ${terminal} readings against ${counts
          .filter((_, other) => other !== at)
          .join(" and ")} of the others`,
        detail:
          `There is one more ${terminal} reading than there are complete sets. One of them may be a ` +
          "repeat of a reading that looked wrong, or it may belong to a point that is missing one. " +
          "Look at the values and decide which record belongs where.",
        rows: (byPair.get(terminal) ?? []).map((row) => row.name),
        surplus: true,
      });
    }
  });

  if (grouping.stray.length > 0) {
    out.push({
      title: `${grouping.stray.length} voltage ${
        grouping.stray.length === 1 ? "reading has" : "readings have"
      } no terminal pair`,
      detail:
        "These were recorded as voltage tests but do not say which terminals they were taken " +
        "between, so they cannot be placed at a point. Assign them by hand or exclude them.",
      rows: grouping.stray.map((row) => row.name),
      surplus: false,
    });
  }

  /* --- insulation and RCD ------------------------------------------------- */
  const expected = EXPECTED[phases];
  const insulation = rows.filter((row) => row.kind === "INSULATION");
  const rcd = rows.filter((row) => row.kind === "RCD");

  if (insulation.length > expected.insulation) {
    out.push({
      title: `${insulation.length} insulation records, where this scope expects ${expected.insulation}`,
      detail:
        "This may be a repeated test, or it may be a second circuit tested on the same visit. " +
        "Assign each one to its circuit, or exclude the ones that were accidental.",
      rows: insulation.map((row) => row.name),
      surplus: true,
    });
  } else if (insulation.length < expected.insulation) {
    out.push({
      title: "No insulation record was found",
      detail:
        `This scope expects ${expected.insulation} insulation test. None was recognised in the file. ` +
        "Check the unrecognised records, if there are any; nothing has been invented to fill the gap.",
      rows: [],
      surplus: false,
    });
  }

  if (rcd.length > expected.rcd) {
    out.push({
      title: `${rcd.length} RCD records, where this scope expects ${expected.rcd}`,
      detail:
        `A ${PHASE_LABELS[phases].toLowerCase()} installation of this scope expects ${expected.rcd} ` +
        `RCD auto ${expected.rcd === 1 ? "sequence" : "sequences"}. The extras may be repeats, or ` +
        "they may belong to another circuit. Assign or exclude them.",
      rows: rcd.map((row) => row.name),
      surplus: true,
    });
  } else if (rcd.length < expected.rcd) {
    out.push({
      title: `${rcd.length} of ${expected.rcd} expected RCD records`,
      detail:
        `A ${PHASE_LABELS[phases].toLowerCase()} installation of this scope expects ${expected.rcd} ` +
        "RCD auto sequences. Nothing has been invented to make up the difference.",
      rows: rcd.map((row) => row.name),
      surplus: false,
    });
  }

  const unknown = rows.filter((row) => row.kind === "UNKNOWN");
  if (unknown.length > 0) {
    out.push({
      title: `${unknown.length} ${unknown.length === 1 ? "record was" : "records were"} not recognised`,
      detail:
        "The instrument wrote something this reader does not know how to classify. They are kept " +
        "word for word and can be assigned by hand. Nothing has been discarded.",
      rows: unknown.map((row) => row.name),
      surplus: false,
    });
  }

  return out;
}

/* --- exclusions -------------------------------------------------------------- */

/**
 * A record set aside.
 *
 * Not deleted: excluded. It is left out of the points and the figures, listed
 * in its own section of the report with its original reference and the reason,
 * still present in the tester's own export bound into the back, and put back
 * by taking the exclusion off. The source data is never touched.
 */
export type Exclusion = { name: string; reason: string };

export const EXCLUSION_REASONS = [
  "Accidental test",
  "Duplicate of another record",
  "Test aborted",
  "Belongs to another circuit",
] as const;

export function kept(rows: InstallRow[], exclusions: Exclusion[]): InstallRow[] {
  const out = new Set(exclusions.map((exclusion) => exclusion.name));
  return rows.filter((row) => !out.has(row.name));
}

export function excluded(rows: InstallRow[], exclusions: Exclusion[]): InstallRow[] {
  const out = new Set(exclusions.map((exclusion) => exclusion.name));
  return rows.filter((row) => out.has(row.name));
}

export function reasonFor(exclusions: Exclusion[], name: string): string {
  return exclusions.find((exclusion) => exclusion.name === name)?.reason ?? "";
}
