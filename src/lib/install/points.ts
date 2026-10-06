import { TERMINALS, isWholeSet, type InstallRow, type Terminals } from "@/lib/install/parse";

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
  /**
   * True where this set was opened by a pair the one before it already had.
   *
   * Which is to say: the reading that started this point was a repeat of a
   * reading just taken. Two incomplete sets either side of that boundary are
   * very often one point tested twice, and the operator can join them by
   * excluding whichever reading was the accident. It is not assumed — the
   * readings are left where the instrument put them — but it is said.
   */
  openedOnRepeat: boolean;
};

export type Grouping = {
  points: Point[];
  /** Readings that could not be placed at all — no terminal pair on them. */
  stray: InstallRow[];
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
  // A record states no pair at all and carries no labelled reading: there is
  // nowhere to put it, so it is listed rather than guessed at.
  const stray = voltage.filter(
    (row) => row.terminals === null && Object.keys(row.readings).length === 0,
  );
  const placed = voltage.filter((row) => !stray.includes(row));

  type Set = { readings: Partial<Record<Terminals, InstallRow>>; openedOnRepeat: boolean };
  const sets: Set[] = [];
  let current: Set | null = null;

  for (const row of placed) {
    /*
     * A record that carries its own readings is a point on its own.
     *
     * The instrument writes all three voltages on one line and names the pair
     * it was set to in the parameters, so one record is a whole polarity test.
     * Grouping three of those into a point split every test across three
     * points and left each of them short two readings — four tests read as two
     * incomplete points. A record like that closes whatever was being built
     * and stands as its own point.
     */
    if (isWholeSet(row)) {
      if (current) sets.push(current);
      current = null;
      sets.push({
        readings: Object.fromEntries(
          (Object.keys(row.readings) as Terminals[]).map((pair) => [pair, row]),
        ) as Partial<Record<Terminals, InstallRow>>,
        openedOnRepeat: false,
      });
      continue;
    }

    const pair = row.terminals as Terminals;

    if (!current) {
      current = { readings: { [pair]: row }, openedOnRepeat: false };
      continue;
    }

    if (current.readings[pair]) {
      /*
       * The pair has come round again.
       *
       * On a complete set that is simply the next point starting. On an
       * incomplete one it is ambiguous — it could be a repeat of a reading
       * that looked wrong, or the operator moving on having missed one — so
       * the set is closed as it stands and the reading opens the next. Either
       * way both readings survive and the report shows what happened.
       *
       * Closing rather than holding the repeat is the safe way round. Holding
       * it would let two points that really were tested separately be merged
       * into one, and a report that quietly loses a point is worse than one
       * that shows two incomplete sets and says they may be the same point.
       */
      const wasShort = !TERMINALS.every((terminal) => current!.readings[terminal]);
      sets.push(current);
      current = { readings: { [pair]: row }, openedOnRepeat: wasShort };
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
      openedOnRepeat: set.openedOnRepeat,
    };
  });

  return { points, stray };
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

  /*
   * Two short sets either side of a repeated reading.
   *
   * This is the shape a re-take leaves behind: L-PE, L-N, L-N again, N-PE
   * reads as two incomplete points when it is one point whose L-N was taken
   * twice. Saying which record to exclude is the whole of the fix, so it is
   * named here rather than left to be worked out from two separate
   * "incomplete set" notes.
   */
  grouping.points.forEach((point, at) => {
    const before = grouping.points[at - 1];
    if (!point.openedOnRepeat || !before || before.missing.length === 0) return;
    const opener = TERMINALS.map((terminal) => point.readings[terminal]).find(Boolean);
    out.push({
      title: `${before.ref} and ${point.ref} may be one point tested twice`,
      detail:
        `${point.ref} opens with a reading at a pair ${before.ref} already had, which is what a ` +
        "re-taken reading looks like. If one of the two was a repeat, exclude it and the readings " +
        `either side of it join into one complete point. If ${before.ref} and ${point.ref} really ` +
        "were different points, each is short a reading and should be re-tested.",
      rows: [
        ...Object.values(before.readings).map((row) => row.name),
        ...(opener ? [opener.name] : []),
      ],
      surplus: false,
    });
  });

  /*
   * The same test, recorded twice.
   *
   * Where a record is a whole polarity test, a repeat is not a surplus leg —
   * it is a second record saying exactly what the one before it said, which is
   * what the instrument leaves behind when test is pressed twice without the
   * probes moving.
   *
   * Equal readings on their own are not enough to say so. Four powerpoints on
   * one circuit will all read about 240 V, 241 V and a volt to earth, and
   * calling each of them a duplicate of the one before would bury the real
   * ones. What marks a double-press is that it happened moments later: the
   * same readings a few seconds apart, rather than the minutes it takes to
   * move to the next outlet and probe it. So both have to hold, and where the
   * instrument wrote no time there is nothing to go on and nothing is said.
   */
  const whole = rows.filter((row) => row.kind === "VOLTAGE_PHASE" && isWholeSet(row));
  const sameAs = (a: InstallRow, b: InstallRow) =>
    TERMINALS.every((pair) => a.readings[pair] === b.readings[pair]);
  for (let at = 1; at < whole.length; at += 1) {
    const row = whole[at];
    const before = whole[at - 1];
    if (!sameAs(before, row)) continue;
    const when = timeOf(row);
    const earlier = timeOf(before);
    if (when === null || earlier === null) continue;
    const apart = Math.abs(when - earlier) / 1000;
    if (apart > BACK_TO_BACK) continue;
    out.push({
      title: `${row.name} repeats ${before.name}, ${Math.round(apart)} seconds later`,
      detail:
        `${before.name} and ${row.name} state the same voltage at every pair and were taken ` +
        `${Math.round(apart)} seconds apart, which is what test pressed twice looks like rather ` +
        `than two points. If that is what happened, set ${row.name} aside as a duplicate and the ` +
        "points either side of it close up. If they really were two outlets on the same circuit, " +
        "leave both — they would be expected to read alike.",
      rows: [before.name, row.name],
      surplus: true,
    });
  }

  /*
   * One pair recorded more often than the others.
   *
   * Only meaningful where a record is one leg of a test: counting the selected
   * pair of records that each carry all three would say nothing about how many
   * legs were taken.
   */
  const byPair = new Map<Terminals, InstallRow[]>();
  for (const row of rows) {
    if (row.kind !== "VOLTAGE_PHASE" || !row.terminals || isWholeSet(row)) continue;
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
