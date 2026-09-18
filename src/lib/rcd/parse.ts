import { extractText, getDocumentProxy } from "unpdf";

/**
 * Reading a Major Tech tester's PDF export.
 *
 * The instrument writes one row per test, and each row carries six readings:
 * the trip time at half, one and five times the rated residual current, each
 * measured at 0° and 180°. A reading it never took prints as "---", and a
 * device that correctly refused to trip prints as "> 2000ms".
 *
 * Every row the operator fetched without actually testing anything comes back
 * with all six blank, which is why they are dropped rather than trusted: a
 * test across nothing is not a result.
 */

/** A reading: a time in ms, "no trip", or nothing at all. */
export type Reading = number | "NO_TRIP" | null;

export type RcdRow = {
  /** "S_1", "S_2" … as the instrument numbers them. */
  name: string;
  /** Rated residual current in mA, off the row's own parameters. */
  ratingMa: number | null;
  /** "AC", "A", "B" … as written by the instrument. */
  waveform: string | null;
  /** True when the instrument marked it selective (S) rather than general. */
  selective: boolean;
  halfAt0: Reading;
  halfAt180: Reading;
  ratedAt0: Reading;
  ratedAt180: Reading;
  fiveAt0: Reading;
  fiveAt180: Reading;
  /** Touch voltage in volts, and the limit the instrument was set to. */
  touchVolts: number | null;
  limitVolts: number | null;
  takenAt: Date | null;
};

export type RcdExport = {
  /** The page title — the board, as the operator named it on the instrument. */
  boardName: string | null;
  siteName: string | null;
  boardNumber: string | null;
  /** "1-36" — the range of ways the instrument was set to. */
  circuitRange: string | null;
  /** The instrument's own company line. An operator name, when one is
   * entered, is appended to it and cannot be told apart. */
  company: string | null;
  createdAt: Date | null;
  rows: RcdRow[];
  /** Rows the instrument recorded but which measured nothing. */
  emptyCount: number;
};

/** A row with nothing measured at all — a fetch across nothing. */
export function isEmptyRow(row: RcdRow): boolean {
  return [
    row.halfAt0,
    row.halfAt180,
    row.ratedAt0,
    row.ratedAt180,
    row.fiveAt0,
    row.fiveAt180,
  ].every((reading) => reading === null);
}

export async function parseRcdExport(pdf: Buffer): Promise<RcdExport> {
  const document = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(document, { mergePages: true });
  return readExport(Array.isArray(text) ? text.join("\n") : text);
}

/** Split out from the file handling so it can be exercised on a string. */
export function readExport(raw: string): RcdExport {
  const text = raw.replace(/\r/g, "");
  const flat = text.replace(/\s+/g, " ");

  const rows: RcdRow[] = [];
  // Each test begins with its own name, so the text is cut on those.
  const starts = [...flat.matchAll(/S[_\s]?(\d{1,3})\b/g)];
  starts.forEach((match, index) => {
    const from = match.index ?? 0;
    const to = index + 1 < starts.length ? (starts[index + 1].index ?? flat.length) : flat.length;
    const chunk = flat.slice(from, to);
    // The header mentions no readings; only a real row carries them.
    if (!/x\s*1\s*\/\s*2|x1\/2/i.test(chunk)) return;
    rows.push(readRow(`S_${match[1]}`, chunk));
  });

  return {
    boardName: firstLine(text),
    ...readHeader(text),
    rows,
    emptyCount: rows.filter(isEmptyRow).length,
  };
}

/**
 * The header is not a list of pairs — it is a row of labels with a row of
 * values under it, and a value the operator left blank simply is not there.
 * So the values are picked out by what they look like rather than by counting
 * along: the timestamp, the way range, the board number, and whatever text is
 * left over is the site.
 */
function readHeader(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const out = {
    siteName: null as string | null,
    boardNumber: null as string | null,
    circuitRange: null as string | null,
    company: null as string | null,
    createdAt: null as Date | null,
  };

  const top = lines.findIndex(
    (line) => /\bCompany\b/i.test(line) && /Create\s*Time/i.test(line),
  );
  if (top >= 0) {
    const value = lines[top + 1] ?? "";
    const stamp = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)/.exec(value);
    if (stamp) {
      out.createdAt = readDate(stamp[1]);
      // Whatever sits before the timestamp is the company, with the operator
      // run on after it when one was entered. The two cannot be told apart, so
      // the pair is kept as it was written rather than guessed at.
      out.company = value.slice(0, stamp.index).trim() || null;
    }
  }

  const second = lines.findIndex(
    (line) => /Circuit\s*No/i.test(line) && /Site\s*No/i.test(line),
  );
  if (second >= 0) {
    const value = lines[second + 1] ?? "";
    const match = /^\s*(\d+\s*[-–—]\s*\d+|\d+)\s+(\S+)\s*(.*)$/.exec(value);
    if (match) {
      out.circuitRange = match[1].replace(/\s+/g, "");
      out.boardNumber = match[2];
      out.siteName = match[3].trim() || null;
    }
  }

  return out;
}

function readRow(name: string, chunk: string): RcdRow {
  const rating = /trip\s*current\s*=\s*(\d+(?:\.\d+)?)\s*ma/i.exec(chunk);
  const waveform = /type\s*of\s*rcd\s*=\s*([A-Z]+)/i.exec(chunk);
  const voltages = [...chunk.matchAll(/\bU[FL]\s*:\s*(-{2,}|\d+(?:\.\d+)?)\s*V/gi)];

  return {
    name,
    ratingMa: rating ? Math.round(Number.parseFloat(rating[1])) : null,
    waveform: waveform ? waveform[1].toUpperCase() : null,
    // The instrument writes "AC G" for general and "AC S" for selective.
    selective: /type\s*of\s*rcd\s*=\s*[A-Z]+\s*S\b/i.test(chunk),
    halfAt0: reading(chunk, "1/2", 0),
    halfAt180: reading(chunk, "1/2", 180),
    ratedAt0: reading(chunk, "1", 0),
    ratedAt180: reading(chunk, "1", 180),
    fiveAt0: reading(chunk, "5", 0),
    fiveAt180: reading(chunk, "5", 180),
    // Touch voltage first, then the limit — by position, because the export
    // labels both "UL" on a populated row and "UF"/"UL" on an empty one.
    touchVolts: voltages[0] ? volts(voltages[0][1]) : null,
    limitVolts: voltages[1] ? volts(voltages[1][1]) : null,
    takenAt: readDate(
      /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/.exec(chunk)?.slice(1).join(" ") ?? null,
    ),
  };
}

/**
 * One reading, e.g. "x1 180°:20ms". The multiplier has to be matched exactly:
 * a loose "x1" would also match the "x1/2" beside it.
 */
function reading(chunk: string, multiplier: "1/2" | "1" | "5", phase: 0 | 180): Reading {
  const escaped = multiplier.replace("/", "\\s*/\\s*");
  const pattern = new RegExp(
    `x\\s*${escaped}(?!\\s*/)\\s*${phase}\\s*°?\\s*:?\\s*(>\\s*\\d+|-{2,}|\\d+(?:\\.\\d+)?)\\s*ms`,
    "i",
  );
  const match = pattern.exec(chunk);
  if (!match) return null;
  const value = match[1].trim();
  if (/^-+$/.test(value)) return null;
  if (value.startsWith(">")) return "NO_TRIP";
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function volts(raw: string): number | null {
  if (/^-+$/.test(raw)) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function firstLine(text: string): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function readDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(raw);
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const date = new Date(
    Date.UTC(+year, +month - 1, +day, +hour, +minute, +second),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
