import { parseCsv } from "@/lib/csv";
import { readSheet } from "@/lib/power/xlsx";
import { CHANNELS, type Channel, type Peak, type Summary } from "@/lib/power/channels";

export { CHANNELS, CHANNEL_LABELS, SERIES } from "@/lib/power/channels";
export type { Channel, Peak, Summary } from "@/lib/power/channels";

/**
 * Reading a power logger's recording.
 *
 * A logger writes one row per interval with the maximum current seen on each
 * phase and on the neutral during that interval. Every make labels the columns
 * differently — "I1_Max [A]", "L1 Current", "Phase A (A)" — so the columns are
 * found by what they mean rather than by an exact heading, and the file may
 * arrive as the CSV the software exports or as a spreadsheet someone saved it
 * into.
 *
 * Nothing is resampled or smoothed. A power analysis is read for its peaks,
 * and a peak is the first thing averaging destroys.
 */

export type Sample = {
  /** Milliseconds since the epoch, UTC. */
  at: number;
  l1: number | null;
  l2: number | null;
  l3: number | null;
  n: number | null;
};

export type Recording = {
  samples: Sample[];
  /** What the file called each column, for the report to quote back. */
  headings: Partial<Record<Channel, string>>;
  /** The usual gap between samples, in minutes. */
  intervalMinutes: number;
  /** Rows that could not be read, so the report can say so rather than hide it. */
  skipped: number;
};

export function readRecording(bytes: Buffer, name: string): Recording {
  const rows = name.toLowerCase().endsWith(".xlsx")
    ? readSheet(bytes)
    : parseCsv(bytes.toString("utf8"));
  return fromRows(rows);
}

/* --- finding the columns -------------------------------------------------- */

/**
 * What each column is, from its heading.
 *
 * Order matters: neutral is tested first because "In" and "I1" differ by one
 * character and a loose phase pattern will swallow the neutral column.
 */
const PATTERNS: [Channel, RegExp][] = [
  ["n", /\b(?:in|i_?n|neutral|n)\b|neutral/i],
  ["l1", /\b(?:i1|l1|a|r|ph(?:ase)?\s*1|ph(?:ase)?\s*a)\b/i],
  ["l2", /\b(?:i2|l2|b|s|w|ph(?:ase)?\s*2|ph(?:ase)?\s*b)\b/i],
  ["l3", /\b(?:i3|l3|c|t|ph(?:ase)?\s*3|ph(?:ase)?\s*c)\b/i],
];

const TIME = /\b(?:time|date|timestamp|date\s*\/?\s*time|when)\b/i;

function fromRows(rows: string[][]): Recording {
  const headerAt = rows.findIndex((row) => row.some((cell) => TIME.test(cell)));
  if (headerAt < 0) return empty();

  const header = rows[headerAt];
  const timeColumn = header.findIndex((cell) => TIME.test(cell));
  const columns: Partial<Record<Channel, number>> = {};
  const headings: Partial<Record<Channel, string>> = {};

  for (const [channel, pattern] of PATTERNS) {
    const at = header.findIndex(
      (cell, index) =>
        index !== timeColumn &&
        !Object.values(columns).includes(index) &&
        pattern.test(strip(cell)),
    );
    if (at >= 0) {
      columns[channel] = at;
      headings[channel] = header[at].trim();
    }
  }

  const samples: Sample[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerAt + 1)) {
    const at = readTime(row[timeColumn] ?? "");
    if (at === null) {
      if (row.some((cell) => cell.trim())) skipped += 1;
      continue;
    }
    samples.push({
      at,
      l1: readAmps(row[columns.l1 ?? -1]),
      l2: readAmps(row[columns.l2 ?? -1]),
      l3: readAmps(row[columns.l3 ?? -1]),
      n: readAmps(row[columns.n ?? -1]),
    });
  }

  samples.sort((a, b) => a.at - b.at);
  return { samples, headings, intervalMinutes: interval(samples), skipped };
}

/** The heading without its unit, so "I1_Max [A]" tests as "i1 max". */
function strip(cell: string): string {
  return cell.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/[_\-./]+/g, " ").trim();
}

function empty(): Recording {
  return { samples: [], headings: {}, intervalMinutes: 0, skipped: 0 };
}

/* --- reading a row -------------------------------------------------------- */

function readAmps(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const value = Number(cell.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * A timestamp, in the shapes a logger writes one.
 *
 * Day-first is assumed where it is ambiguous, because these are Australian
 * loggers and "7/09/2026" is the seventh of September. A spreadsheet hands its
 * dates over already converted, so those arrive as ISO and are taken as read.
 *
 * The clock may be twelve-hour with an AM or a PM after it, which has to be
 * honoured rather than ignored: read "1:00:00 PM" as one in the morning and
 * every afternoon reading lands twelve hours early, silently, and the whole
 * time axis is wrong without anything looking wrong.
 */
export function readTime(cell: string): number | null {
  const text = cell.trim();
  if (!text) return null;

  const dmy =
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])?\.?[Mm]?\.?)?/.exec(
      text,
    );
  if (dmy) {
    const [, day, month, rawYear, hour = "0", minute = "0", second = "0", half] = dmy;
    const year = Number(rawYear) < 100 ? 2000 + Number(rawYear) : Number(rawYear);
    return Date.UTC(
      year,
      Number(month) - 1,
      Number(day),
      hours(hour, half),
      Number(minute),
      Number(second),
    );
  }

  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])?\.?[Mm]?\.?)?/.exec(
      text,
    );
  if (iso) {
    const [, year, month, day, hour = "0", minute = "0", second = "0", half] = iso;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      hours(hour, half),
      Number(minute),
      Number(second),
    );
  }

  return null;
}

/** Twelve-hour to twenty-four, where the clock said which half it was in. */
function hours(hour: string, half: string | undefined): number {
  const value = Number(hour);
  if (!half) return value;
  const afternoon = half.toLowerCase() === "p";
  if (afternoon) return value === 12 ? 12 : value + 12;
  return value === 12 ? 0 : value;
}

/** The gap the logger actually used, as the most common one between samples. */
function interval(samples: Sample[]): number {
  if (samples.length < 3) return 0;
  const counts = new Map<number, number>();
  for (let at = 1; at < samples.length; at += 1) {
    const minutes = Math.round((samples[at].at - samples[at - 1].at) / 60000);
    if (minutes <= 0) continue;
    counts.set(minutes, (counts.get(minutes) ?? 0) + 1);
  }
  let best = 0;
  let most = 0;
  for (const [minutes, count] of counts) {
    if (count > most) {
      most = count;
      best = minutes;
    }
  }
  return best;
}

/* --- what the report needs to know about it ------------------------------- */

export function summarise(recording: Recording): Summary | null {
  const { samples } = recording;
  if (samples.length === 0) return null;

  const peaks: Partial<Record<Channel, Peak>> = {};
  for (const sample of samples) {
    for (const channel of CHANNELS) {
      const amps = sample[channel];
      if (amps === null) continue;
      const held = peaks[channel];
      if (!held || amps > held.amps) peaks[channel] = { channel, amps, at: sample.at };
    }
  }

  const highest = Object.values(peaks).reduce<Peak | null>(
    (best, peak) => (!best || peak.amps > best.amps ? peak : best),
    null,
  );

  return {
    from: samples[0].at,
    to: samples[samples.length - 1].at,
    count: samples.length,
    intervalMinutes: recording.intervalMinutes,
    peaks,
    highest,
    skipped: recording.skipped,
  };
}

/** Which channels the file actually carried readings for. */
export function channelsIn(recording: Recording): Channel[] {
  return CHANNELS.filter((channel) =>
    recording.samples.some((sample) => sample[channel] !== null),
  );
}

/* --- cutting it into weeks ------------------------------------------------ */

export type Week = {
  from: number;
  to: number;
  samples: Sample[];
  /** True where the page holds less than a week, so it says how long it is. */
  partial: boolean;
};

const DAY = 86_400_000;

/**
 * One page per week, starting at midnight on the day the recording began.
 *
 * Starting at midnight rather than at the first reading means every page is a
 * whole number of days with its gridlines on the day boundaries, and the date
 * under a tick is the date that tick is.
 *
 * A page that holds less than a week — a recording that was cut short, or the
 * tail of one that does not divide evenly — is narrowed to the days it
 * actually has, rounded up to midnight. A day of readings stretched across
 * seven days of axis is six-sevenths of a blank page, and the comparison
 * between weeks is carried by the shared current scale, not by the width.
 */
export function weeks(samples: Sample[]): Week[] {
  if (samples.length === 0) return [];
  const start = midnight(samples[0].at);
  const end = samples[samples.length - 1].at;
  const out: Week[] = [];

  for (let from = start; from < end; from += 7 * DAY) {
    const full = from + 7 * DAY;
    const held = samples.filter((sample) => sample.at >= from && sample.at < full);
    if (held.length === 0) continue;

    const last = midnight(held[held.length - 1].at) + DAY;
    const to = Math.min(full, Math.max(last, from + DAY));
    out.push({ from, to, samples: held, partial: to < full });
  }
  return out;
}

export function midnight(at: number): number {
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
