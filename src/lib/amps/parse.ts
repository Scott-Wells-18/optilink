import { parseCsv } from "@/lib/csv";
import { readSheet } from "@/lib/power/xlsx";

/**
 * Reading a short current recording off a clamp meter.
 *
 * This is not the power logger's fortnight at five-minute intervals — it is a
 * minute or so of one circuit, sampled every second, taken to see what that
 * circuit actually draws. The files come off the meter's own software and are
 * laid out for a person rather than for a program:
 *
 *   - the meter's own summary of the recording first, on its own row or two,
 *     often with its own header above it;
 *   - then a *second* header, and under that the timestamped samples;
 *   - and a trailing delimiter on every line, which leaves an empty column at
 *     the end of every row.
 *
 * So the header is found by looking for the one with readings under it rather
 * than by taking the first row that mentions time — read the summary row as a
 * sample and the recording gains a reading of its own maximum, which is exactly
 * the kind of error that makes a report wrong without looking wrong.
 *
 * Nothing is smoothed, filled in or dropped quietly. A zero is a reading and is
 * kept; anything that could not be read is left out and *said*, line by line,
 * so the report can carry the same account. Whatever the meter declared about
 * its own recording is checked against what was actually imported and any
 * disagreement is reported rather than reconciled.
 */

export type AmpSample = {
  /** Milliseconds since the epoch, UTC. */
  at: number;
  amps: number;
};

/** What the meter said about the recording, in its own summary row. */
export type Declared = {
  /** Every label and value read out of the rows above the readings. */
  fields: [string, string][];
  max: number | null;
  min: number | null;
  average: number | null;
  count: number | null;
};

/** One of the meter's own figures, against ours. */
export type Check = {
  what: string;
  declared: string;
  imported: string;
  agrees: boolean;
};

export type AmpReading = {
  samples: AmpSample[];
  /** What the file called the current column, quoted back in the report. */
  heading: string | null;
  /** What the file called the time column. */
  timeHeading: string | null;
  declared: Declared;
  checks: Check[];
  /** Anything that could not be read, a line each, in the file's own order. */
  notes: string[];
  /** The usual gap between samples, in seconds. Zero where it varied. */
  intervalSeconds: number;
  /** False where the file timed its samples without dating them. */
  dated: boolean;
};

const EMPTY_DECLARED: Declared = { fields: [], max: null, min: null, average: null, count: null };

/**
 * A nominal day for a file that gives times without dates.
 *
 * Only the clock matters on a recording of a minute, and the report prints the
 * date from the job rather than from the file, so the day this lands on is
 * never shown. It is a real date rather than the epoch so that nothing
 * downstream trips over 1970.
 */
const NO_DATE_DAY = Date.UTC(2000, 0, 1);

export function readAmpRecording(bytes: Buffer, name: string): AmpReading {
  const rows = name.toLowerCase().endsWith(".xlsx")
    ? readSheet(bytes)
    : parseCsv(bytes.toString("utf8"));
  return fromRows(rows);
}

/* --- finding the readings ------------------------------------------------- */

const TIME = /\b(?:time|date|timestamp|date\s*\/?\s*time|clock|when|elapsed)\b/i;

/**
 * A column of current.
 *
 * "Current", "Amps", "A", "I", "RMS", "L1", "A-Phase" — and a bare "[A]" unit,
 * which is how most of these meters label the only column they have.
 */
const AMPS = /\b(?:current|amps?|amperes?|rms|i(?:rms|_?1)?|l[123]|a|ma)\b/i;

function fromRows(rows: string[][]): AmpReading {
  const chosen = chooseHeader(rows);
  if (!chosen) {
    return {
      samples: [],
      heading: null,
      timeHeading: null,
      declared: EMPTY_DECLARED,
      checks: [],
      notes: [
        "No timestamped current readings could be found in this file. It needs a row of headings with a time column and a current column, and the readings under it.",
      ],
      intervalSeconds: 0,
      dated: false,
    };
  }

  const { at: headerAt, timeColumn, ampsColumn } = chosen;
  const header = rows[headerAt];
  const declared = readDeclared(rows.slice(0, headerAt));

  const samples: AmpSample[] = [];
  const notes: string[] = [];
  let dated = false;
  let previous: number | null = null;
  let day = NO_DATE_DAY;
  let blanks = 0;
  let unreadable = 0;

  for (let index = headerAt + 1; index < rows.length; index += 1) {
    const row = rows[index];
    // The trailing delimiter these files carry leaves an empty last column, so
    // a row of nothing but separators is the end of the file, not a fault.
    if (!row.some((cell) => cell.trim())) continue;
    const line = index + 1;

    const stamp = readStamp(row[timeColumn] ?? "", day, previous);
    if (!stamp) {
      // A second header partway down — some meters repeat it — is not a fault.
      if (looksLikeHeader(row)) continue;
      unreadable += 1;
      notes.push(
        `Line ${line}: "${show(row[timeColumn])}" is not a time this could read, so that row was left out.`,
      );
      continue;
    }
    dated ||= stamp.dated;
    day = stamp.day;
    previous = stamp.at;

    const cell = row[ampsColumn];
    if (cell === undefined || cell.trim() === "") {
      blanks += 1;
      notes.push(
        `Line ${line} (${clock(stamp.at)}): the current column was empty, so there is no reading at that second. It has been left out rather than read as zero.`,
      );
      continue;
    }

    const amps = readAmps(cell);
    if (amps === null) {
      blanks += 1;
      notes.push(
        `Line ${line} (${clock(stamp.at)}): "${show(cell)}" is not a current this could read, so that reading was left out.`,
      );
      continue;
    }
    if (amps < 0) {
      notes.push(
        `Line ${line} (${clock(stamp.at)}): the reading is negative (${amps} A). It has been kept as recorded.`,
      );
    }

    samples.push({ at: stamp.at, amps });
  }

  const ordered = [...samples].sort((a, b) => a.at - b.at);
  if (ordered.some((sample, index) => sample.at !== samples[index]?.at)) {
    notes.push("The readings were not in time order in the file. They have been sorted by time.");
  }

  const duplicates = countDuplicates(ordered);
  if (duplicates > 0) {
    notes.push(
      `${duplicates} ${duplicates === 1 ? "reading carries" : "readings carry"} a timestamp that another reading also carries. All of them have been kept as recorded.`,
    );
  }

  if (blanks > 0 || unreadable > 0) {
    // The counts, said once at the top, so a page of line notes has a summary.
    notes.unshift(
      [
        ordered.length.toLocaleString("en-AU"),
        "readings were imported;",
        blanks > 0 ? `${blanks} had no usable current value;` : null,
        unreadable > 0 ? `${unreadable} had no readable time.` : null,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/;$/, "."),
    );
  }

  return {
    samples: ordered,
    heading: header[ampsColumn]?.trim() || null,
    timeHeading: header[timeColumn]?.trim() || null,
    declared,
    checks: check(declared, ordered),
    notes,
    intervalSeconds: interval(ordered),
    dated,
  };
}

type Header = { at: number; timeColumn: number; ampsColumn: number; readings: number };

/**
 * Which row is the header over the readings.
 *
 * Every row that could be one is tried, and the one with the most readings
 * under it wins. That is what keeps the meter's own summary — which is itself a
 * header over a single row of figures — from being read as the recording: it
 * has one row under it and the real header has forty.
 */
function chooseHeader(rows: string[][]): Header | null {
  const candidates: Header[] = [];

  rows.forEach((row, at) => {
    if (!looksLikeHeader(row)) return;
    const timeColumn = row.findIndex((cell) => TIME.test(cell));
    if (timeColumn < 0) return;
    const ampsColumn = findAmps(rows, at, timeColumn);
    if (ampsColumn < 0) return;
    candidates.push({ at, timeColumn, ampsColumn, readings: countReadings(rows, at, timeColumn) });
  });

  if (candidates.length === 0) return null;
  // The last of equals: a repeated header belongs to the readings under it.
  return candidates.reduce((best, entry) => (entry.readings >= best.readings ? entry : best));
}

/**
 * A row of words rather than a row of figures.
 *
 * Nothing in it may be a bare number: a heading can carry a digit — "L1",
 * "I1_Max [A]" — but a cell that is *only* a number is a reading, and a row
 * with a reading in it is a row of readings however much it mentions time.
 */
function looksLikeHeader(row: string[]): boolean {
  const filled = row.map((cell) => cell.trim()).filter(Boolean);
  if (filled.length < 2) return false;
  if (filled.some((cell) => /^[-+]?[\d.,]+$/.test(cell))) return false;
  return filled.some((cell) => TIME.test(cell));
}

/**
 * How many readings follow a header, without a break.
 *
 * The run stops at the next header rather than running to the end of the file,
 * which is what keeps a summary block from claiming the readings that belong to
 * the header below it: "Start Time, End Time, Max, Avg, Samples" has one row
 * under it, not forty-one. Blank rows are stepped over — these files are padded
 * with them — and neither open nor close a run.
 */
function countReadings(rows: string[][], headerAt: number, timeColumn: number): number {
  let count = 0;
  for (let index = headerAt + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some((cell) => cell.trim())) continue;
    if (looksLikeHeader(row)) break;
    const cell = row[timeColumn];
    if (cell !== undefined && readStamp(cell, NO_DATE_DAY, null)) count += 1;
  }
  return count;
}

/**
 * The column holding the current.
 *
 * By the heading where a heading says so, and otherwise by what is actually in
 * the column: a meter that labels its one column "[A]" and a meter that labels
 * it nothing at all both have to be read.
 */
function findAmps(rows: string[][], headerAt: number, timeColumn: number): number {
  const header = rows[headerAt];
  const named = header.findIndex(
    (cell, index) => index !== timeColumn && cell.trim() !== "" && AMPS.test(strip(cell)),
  );
  if (named >= 0) return named;

  for (let index = 0; index < header.length; index += 1) {
    if (index === timeColumn) continue;
    const numbers = rows
      .slice(headerAt + 1, headerAt + 12)
      .filter((row) => readAmps(row[index]) !== null).length;
    if (numbers >= 2) return index;
  }
  return -1;
}

/** The heading without its unit, so "I1_Max [A]" tests as "i1 max". */
function strip(cell: string): string {
  return cell.replace(/[_\-./]+/g, " ").trim();
}

/* --- reading a row -------------------------------------------------------- */

function readAmps(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const text = cell.trim();
  if (text === "" || /^-{2,}$/.test(text)) return null;
  // A unit, a thousands separator or a comma for a decimal point, all of which
  // turn up depending on where the meter's software thinks it is.
  const cleaned = text
    .replace(/\s+/g, "")
    .replace(/(?<=\d),(?=\d{3}\b)/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.+-]/g, "");
  if (cleaned === "" || !/\d/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

type Stamp = { at: number; day: number; dated: boolean };

/**
 * When a reading was taken.
 *
 * A short recording is often timed and not dated — "08:23:32" is all the meter
 * writes — so a bare clock is read against the day handed in, and a clock that
 * has gone backwards past midnight rolls the day over. A recording that runs
 * through midnight is rare and a recording that silently folds its second half
 * back over its first is worse.
 */
function readStamp(cell: string, day: number, previous: number | null): Stamp | null {
  const text = cell.trim();
  if (text === "") return null;

  const full = readDateTime(text);
  if (full !== null) return { at: full, day: Math.floor(full / 86_400_000) * 86_400_000, dated: true };

  const time = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?\s*([AaPp])\.?[Mm]?\.?$/.exec(text)
    ?? /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?$/.exec(text);
  if (!time) return null;

  const [, hour, minute, second = "0", fraction = "0", half] = time;
  const at =
    day +
    hourOf(hour, half) * 3_600_000 +
    Number(minute) * 60_000 +
    Number(second) * 1000 +
    Number(fraction.padEnd(3, "0"));

  // Past midnight: the clock reads earlier than the reading before it by more
  // than half a day, which on a recording of a minute can only be a new day.
  if (previous !== null && at < previous - 43_200_000) {
    return { at: at + 86_400_000, day: day + 86_400_000, dated: false };
  }
  return { at, day, dated: false };
}

/** A dated timestamp, day-first as Australian meters write it, or ISO. */
function readDateTime(text: string): number | null {
  const dmy =
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?\s*([AaPp])?\.?[Mm]?\.?)?$/.exec(
      text,
    );
  if (dmy) {
    const [, day, month, year, hour = "0", minute = "0", second = "0", fraction = "0", half] = dmy;
    const full = year.length === 2 ? 2000 + Number(year) : Number(year);
    return Date.UTC(
      full,
      Number(month) - 1,
      Number(day),
      hourOf(hour, half),
      Number(minute),
      Number(second),
      Number(fraction.padEnd(3, "0")),
    );
  }

  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?\s*([AaPp])?\.?[Mm]?\.?)?/.exec(
      text,
    );
  if (iso) {
    const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = "0", half] = iso;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      hourOf(hour, half),
      Number(minute),
      Number(second),
      Number(fraction.padEnd(3, "0")),
    );
  }

  return null;
}

/** Twelve-hour to twenty-four, where the clock said which half it was in. */
function hourOf(hour: string, half: string | undefined): number {
  const value = Number(hour);
  if (!half) return value;
  if (half.toLowerCase() === "p") return value === 12 ? 12 : value + 12;
  return value === 12 ? 0 : value;
}

/** The gap the meter actually used, as the most common one, in whole seconds. */
function interval(samples: AmpSample[]): number {
  if (samples.length < 3) return 0;
  const counts = new Map<number, number>();
  for (let at = 1; at < samples.length; at += 1) {
    const seconds = Math.round((samples[at].at - samples[at - 1].at) / 1000);
    if (seconds <= 0) continue;
    counts.set(seconds, (counts.get(seconds) ?? 0) + 1);
  }
  let best = 0;
  let most = 0;
  for (const [seconds, count] of counts) {
    if (count > most) {
      most = count;
      best = seconds;
    }
  }
  return best;
}

function countDuplicates(samples: AmpSample[]): number {
  let count = 0;
  for (let at = 1; at < samples.length; at += 1) {
    if (samples[at].at === samples[at - 1].at) count += 1;
  }
  return count;
}

/* --- what the meter said about itself ------------------------------------- */

const DECLARED: [keyof Omit<Declared, "fields">, RegExp][] = [
  ["max", /\b(?:max(?:imum)?|peak|highest)\b/i],
  ["min", /\b(?:min(?:imum)?|lowest)\b/i],
  ["average", /\b(?:avg|ave|average|mean)\b/i],
  ["count", /\b(?:samples?|readings?|records?|count|points?|n)\b/i],
];

/**
 * The rows above the readings, read for what the meter claimed.
 *
 * Both shapes turn up: a row of labels with a row of figures under it, and a
 * single row of "Max: 58 A" pairs. Whatever is found is only ever used to check
 * what was imported against it — never to correct it.
 */
function readDeclared(rows: string[][]): Declared {
  const out: Declared = { fields: [], max: null, min: null, average: null, count: null };

  const put = (label: string, value: string) => {
    const text = label.trim();
    const figure = value.trim();
    if (!text || !figure) return;
    out.fields.push([text, figure]);
    for (const [key, pattern] of DECLARED) {
      if (out[key] !== null || !pattern.test(text)) continue;
      const number = readAmps(figure);
      if (number !== null) out[key] = number;
    }
  };

  rows.forEach((row, at) => {
    const filled = row.map((cell) => cell.trim());
    if (!filled.some(Boolean)) return;

    // "Max: 58" — a label and its value in the one cell. A clock is not one of
    // these, however many colons it has, so the label has to read as a label
    // and the value has to read as a number.
    for (const cell of filled) {
      const [label, ...rest] = cell.split(":");
      if (rest.length === 0) continue;
      const value = rest.join(":").trim();
      if (!/[a-z]/i.test(label) || !/^[-+]?[\d.,]+\s*[a-z%]*$/i.test(value)) continue;
      put(label, value);
    }

    // A row of labels with a row of figures under it.
    const below = rows[at + 1];
    if (!below) return;
    const numeric = below.filter((cell) => readAmps(cell) !== null).length;
    if (numeric === 0) return;
    filled.forEach((label, column) => {
      if (!label || readAmps(label) !== null) return;
      put(label, below[column] ?? "");
    });
  });

  return out;
}

/**
 * The meter's own figures, against the ones that were imported.
 *
 * A disagreement is shown rather than argued with. A meter that averages only
 * its non-zero samples will not match an average taken over every second of the
 * recording, and that is worth a reader seeing: it says which number is which
 * rather than quietly choosing one.
 */
function check(declared: Declared, samples: AmpSample[]): Check[] {
  if (samples.length === 0) return [];
  const out: Check[] = [];

  const max = Math.max(...samples.map((sample) => sample.amps));
  const average = samples.reduce((sum, sample) => sum + sample.amps, 0) / samples.length;

  if (declared.count !== null) {
    out.push({
      what: "Samples",
      declared: declared.count.toLocaleString("en-AU"),
      imported: samples.length.toLocaleString("en-AU"),
      agrees: declared.count === samples.length,
    });
  }
  if (declared.max !== null) {
    out.push({
      what: "Highest reading",
      declared: `${trim(declared.max)} A`,
      imported: `${trim(max)} A`,
      agrees: Math.abs(declared.max - max) < 0.051,
    });
  }
  if (declared.min !== null) {
    const min = Math.min(...samples.map((sample) => sample.amps));
    out.push({
      what: "Lowest reading",
      declared: `${trim(declared.min)} A`,
      imported: `${trim(min)} A`,
      agrees: Math.abs(declared.min - min) < 0.051,
    });
  }
  if (declared.average !== null) {
    out.push({
      what: "Average",
      declared: `${trim(declared.average)} A`,
      imported: `${average.toFixed(2)} A`,
      agrees: Math.abs(declared.average - average) < 0.011,
    });
  }

  return out;
}

/* --- small things --------------------------------------------------------- */

export function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** "08:23:32" — the clock, which is all a recording of a minute needs. */
export function clock(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/** A cell as it appeared, cut short so a note stays a line. */
function show(cell: string | undefined): string {
  const text = (cell ?? "").trim();
  if (text === "") return "";
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
}
