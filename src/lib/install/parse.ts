import { extractText, getDocumentProxy } from "unpdf";
import { isEmptyRow, readExport, type RcdRow } from "@/lib/rcd/parse";

/**
 * Reading an installation tester's PDF export.
 *
 * The same Major Tech instrument the RCD workflow already reads, doing more
 * than RCDs: an insulation resistance test, a run of voltage and polarity
 * readings between pairs of terminals, and the RCD auto sequence.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT IS AND IS NOT CONFIRMED
 *
 * The only tester export in this repository is RCD-only: four rows, every one
 * of them Function "Auto", and not one occurrence of "Insulation",
 * "Voltage/Phase", "Terminal Voltage", "L-PE", "L-N", "N-PE" or any
 * resistance unit. So the Auto grammar below is confirmed against a real
 * file, and the other two are not.
 *
 * Rather than guess a format and then quietly mis-read anything that does not
 * match it, this reader works the other way round: it keeps every row whole —
 * its S number, its function, its parameters, its result, word for word — and
 * then tries to recognise what each one is. A row it cannot place is marked
 * UNKNOWN and carried through to be mapped by hand. Nothing is discarded for
 * failing to match a pattern, because the pattern is the part that has not
 * been checked.
 * ────────────────────────────────────────────────────────────────────────
 */

/** What a row turned out to be. */
export type Measurement = "INSULATION" | "VOLTAGE_PHASE" | "RCD" | "UNKNOWN";

export const MEASUREMENT_LABELS: Record<Measurement, string> = {
  INSULATION: "Insulation resistance",
  VOLTAGE_PHASE: "Voltage / phase",
  RCD: "RCD",
  UNKNOWN: "Not recognised",
};

/** The pairs of terminals a voltage reading is taken between. */
export type Terminals = "L-PE" | "L-N" | "N-PE";

export const TERMINALS: readonly Terminals[] = ["L-PE", "L-N", "N-PE"];

export type InstallRow = {
  /** "S_1", as the instrument numbers it. This is the reference everywhere. */
  name: string;
  /** Where it fell in the file, which is the order the tests were done in. */
  index: number;
  kind: Measurement;

  /** Word for word, so a row can always be read as the instrument wrote it. */
  rawFunction: string;
  rawParameters: string;
  rawResult: string;
  /**
   * When the instrument recorded it.
   *
   * A Date when the file has just been read, and the string that Date became
   * once the rows were stored as JSON on the report. Both, because both are
   * what callers are handed, and a type saying only `Date` is what let a
   * `.getTime()` through on a row read back out of the database.
   */
  takenAt: Date | string | null;

  /* --- insulation ------------------------------------------------------- */
  /** The test voltage the instrument was set to, in volts. */
  terminalVolts: number | null;
  /** Megohms. Null where the reading was a "greater than". */
  megohms: number | null;
  /** Set where the instrument reported "> 200 MΩ" rather than a number. */
  megohmsAtLeast: number | null;

  /* --- voltage and phase ------------------------------------------------ */
  /**
   * The pair the instrument was set to, off the parameters column.
   *
   * It is what the operator selected, not the extent of what was measured —
   * see `readings`.
   */
  terminals: Terminals | null;
  /**
   * Every voltage the record states, by the pair it was taken between.
   *
   * A real export settles what a voltage record is. The instrument writes the
   * selected pair in the parameters and then all three readings in the result:
   *
   *     V/Phase=N-PE    50HZ,L-PE=240V,N-PE=1V,L-N=241V
   *
   * So one record is a whole polarity test, not a third of one. Reading it as
   * a third of one both split each test across three points and took the
   * first number on the line as the answer for whichever pair the record was
   * filed under — which printed a neutral-to-earth reading of 240 V where the
   * instrument had recorded 1 V.
   *
   * A record stating a single bare voltage still lands here, under the pair
   * its parameters name, so an export written the other way still reads.
   */
  readings: Partial<Record<Terminals, number>>;
  /** Supply frequency, where the record states it. */
  hertz: number | null;

  /* --- rcd -------------------------------------------------------------- */
  /** The six trip times and the touch voltage, read by the RCD parser. */
  rcd: RcdRow | null;
};

export type InstallExport = {
  /** The page title — whatever the operator named the job on the instrument. */
  title: string | null;
  siteName: string | null;
  boardNumber: string | null;
  circuitRange: string | null;
  company: string | null;
  createdAt: Date | null;
  rows: InstallRow[];
  /** Rows the instrument recorded but which measured nothing. */
  emptyCount: number;
  /** Anything the reader wants the person who uploaded it to know. */
  notes: string[];
};

export async function parseInstallExport(pdf: Buffer): Promise<InstallExport> {
  const document = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(document, { mergePages: true });
  return readInstallExport(Array.isArray(text) ? text.join("\n") : text);
}

/** Split out from the file handling so it can be exercised on a string. */
export function readInstallExport(raw: string): InstallExport {
  const text = raw.replace(/\r/g, "");
  const flat = text.replace(/\s+/g, " ");

  // The RCD reader already knows this file's header and its Auto rows, so it
  // is run first and its work is reused rather than written twice.
  const rcdSide = readExport(raw);
  const byName = new Map(rcdSide.rows.map((row) => [row.name, row]));

  const starts = [...flat.matchAll(/S[_\s]?(\d{1,3})\b/g)];
  const rows: InstallRow[] = [];
  const notes: string[] = [];

  starts.forEach((match, at) => {
    const from = match.index ?? 0;
    const to = at + 1 < starts.length ? (starts[at + 1].index ?? flat.length) : flat.length;
    const chunk = flat.slice(from, to);
    const name = `S_${match[1]}`;

    // The header mentions no measurements; only a real row carries one.
    if (!looksLikeRow(chunk)) return;

    rows.push(readRow(name, rows.length, chunk, byName.get(name) ?? null));
  });

  const unknown = rows.filter((row) => row.kind === "UNKNOWN");
  if (unknown.length > 0) {
    notes.push(
      `${unknown.length} ${unknown.length === 1 ? "record was" : "records were"} not recognised ` +
        `(${unknown.map((row) => row.name).join(", ")}). They are kept exactly as the instrument ` +
        "wrote them and can be assigned by hand; nothing has been discarded.",
    );
  }

  return {
    title: rcdSide.boardName,
    siteName: rcdSide.siteName,
    boardNumber: rcdSide.boardNumber,
    circuitRange: rcdSide.circuitRange,
    company: rcdSide.company,
    createdAt: rcdSide.createdAt,
    rows,
    emptyCount: rows.filter((row) => row.rcd !== null && isEmptyRow(row.rcd)).length,
    notes,
  };
}

/* --- reading one row -------------------------------------------------------- */

/**
 * Whether a chunk is a test rather than a piece of the page around one.
 *
 * Deliberately loose: anything carrying a measurement, a parameter or a
 * timestamp counts. A row this misses is a row nobody gets to look at, and
 * that is a worse failure than a stray line in the list.
 */
function looksLikeRow(chunk: string): boolean {
  return (
    /x\s*1\s*\/\s*2/i.test(chunk) ||
    /=/.test(chunk) ||
    /\d\s*(?:V|M\s*[ΩO]|G\s*[ΩO]|k\s*[ΩO]|ms)\b/i.test(chunk) ||
    /\d{4}-\d{2}-\d{2}/.test(chunk)
  );
}

function readRow(
  name: string,
  index: number,
  chunk: string,
  rcd: RcdRow | null,
): InstallRow {
  const kind = classify(chunk, rcd);
  const { rawFunction, rawParameters, rawResult } = split(chunk);

  return {
    name,
    index,
    kind,
    rawFunction,
    rawParameters,
    rawResult,
    takenAt:
      rcd?.takenAt ??
      readDate(
        /(\d{4}-\d{2}-\d{2})[ ,]+(\d{2})[ :](\d{2})[ :](\d{2})/.exec(chunk)?.slice(1) ?? null,
      ),
    terminalVolts: kind === "INSULATION" ? terminalVoltage(chunk) : null,
    ...(kind === "INSULATION" ? resistance(chunk) : { megohms: null, megohmsAtLeast: null }),
    terminals: kind === "VOLTAGE_PHASE" ? terminalsOf(chunk) : null,
    readings: kind === "VOLTAGE_PHASE" ? readingsOf(chunk) : {},
    hertz: kind === "VOLTAGE_PHASE" ? hertzOf(chunk) : null,
    rcd: kind === "RCD" ? rcd : null,
  };
}

/**
 * What kind of test a row is.
 *
 * By what the row actually carries rather than by its position in the file:
 * the operator's examples give the function names, but a row is recognised by
 * the shape of its parameters and its result as well, so a tester that writes
 * "INSULATION" where another writes "Insulation Res." is still read.
 */
function classify(chunk: string, rcd: RcdRow | null): Measurement {
  // The one that is confirmed against a real export.
  if (rcd || /x\s*1\s*\/\s*2/i.test(chunk)) return "RCD";

  if (
    /\binsulation\b/i.test(chunk) ||
    /terminal\s*voltage\s*=/i.test(chunk) ||
    /\d\s*(?:M|G|k)\s*[ΩO]/i.test(chunk) ||
    /\d\s*(?:M|G)\s*(?![A-Za-z])/.test(chunk) ||
    /\b(?:M|G)ohm\b/i.test(chunk)
  ) {
    return "INSULATION";
  }

  if (
    /v\s*\/\s*phase\s*=/i.test(chunk) ||
    /\bvoltage\s*\/\s*phase\b/i.test(chunk) ||
    /\b[LN]\s*-\s*(?:PE|N)\b/i.test(chunk)
  ) {
    return "VOLTAGE_PHASE";
  }

  return "UNKNOWN";
}

/**
 * The three columns, as near as a flattened page allows.
 *
 * The export is a table whose columns run together once the page is read as
 * text, so this is a reading rather than a parse. The function is the first
 * word after the S number; the parameters are the run of key=value pairs; the
 * result is whatever follows them. All three are kept verbatim, because the
 * values that matter are pulled out of the whole row by their own patterns
 * and these are for a person to read.
 */
function split(chunk: string): {
  rawFunction: string;
  rawParameters: string;
  rawResult: string;
} {
  const body = chunk.replace(/^S[_\s]?\d{1,3}\s*/, "").trim();
  const stamp = /\d{4}-\d{2}-\d{2}/.exec(body);
  const upto = (stamp ? body.slice(0, stamp.index) : body).trim();

  // The function is one word: "Auto", "INSULATION", "VOLTAGE/PHASE". A tester
  // that writes two keeps the second in the parameters rather than losing it.
  const firstSpace = upto.search(/\s/);
  const rawFunction = (firstSpace < 0 ? upto : upto.slice(0, firstSpace)).slice(0, 60);
  const rest = firstSpace < 0 ? "" : upto.slice(firstSpace).trim();

  /*
   * The parameters are every key=value pair, from the first to the last.
   *
   * A value is one token, with a trailing single capital allowed so that the
   * instrument's "Type Of RCD=AC G" stays whole. Whatever sits after the last
   * pair is the result.
   */
  const pairs = [...rest.matchAll(/[A-Za-z][\w /.]*=\s*[^\s,]+(?:\s+[A-Z])?/g)];
  if (pairs.length === 0) {
    return { rawFunction, rawParameters: "", rawResult: rest.slice(0, 400) };
  }

  const from = pairs[0].index ?? 0;
  const last = pairs[pairs.length - 1];
  const to = (last.index ?? 0) + last[0].length;

  return {
    rawFunction,
    rawParameters: rest.slice(from, to).trim().slice(0, 300),
    rawResult: `${rest.slice(0, from)} ${rest.slice(to)}`.trim().slice(0, 400),
  };
}

/* --- the values ------------------------------------------------------------- */

function terminalVoltage(chunk: string): number | null {
  const match = /terminal\s*voltage\s*=\s*(\d+(?:\.\d+)?)/i.exec(chunk);
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * The insulation reading, in megohms.
 *
 * "> 200 MΩ" is the answer an installation usually gives and is not a number:
 * it is a floor, and treating it as 200 would understate it while treating it
 * as infinity would overstate it. It is kept as a floor, and the report prints
 * it as the instrument wrote it.
 *
 * Gigohms and kilohms are converted so one column can be compared; the raw
 * text is still on the row either way.
 */
function resistance(chunk: string): { megohms: number | null; megohmsAtLeast: number | null } {
  /*
   * The ohm sign is the first thing a PDF loses.
   *
   * Depending on the font the instrument embedded, Ω comes out of a text
   * extraction as Ω, as a Latin O, or as nothing at all — so "200 MΩ" can
   * arrive as "200 M". A scaled reading is therefore accepted with the symbol
   * optional, and an unscaled one still needs it, since a bare number is not a
   * resistance. The letter after the scale is checked so that a fault current
   * of "0.42kA" is not read as 0.42 kΩ.
   */
  const scaled = /(>\s*)?(\d+(?:\.\d+)?)\s*(G|M|k)\s*[ΩO]?(?![A-Za-z])/i.exec(chunk);
  const plain = /(>\s*)?(\d+(?:\.\d+)?)\s*[ΩO](?![A-Za-z])/i.exec(chunk);
  const match = scaled ?? plain;
  if (!match) return { megohms: null, megohmsAtLeast: null };

  const value = Number.parseFloat(match[2]);
  if (!Number.isFinite(value)) return { megohms: null, megohmsAtLeast: null };

  const scale = (scaled?.[3] ?? "M").toUpperCase();
  const megohms = scale === "G" ? value * 1000 : scale === "K" ? value / 1000 : value;

  return match[1]
    ? { megohms: null, megohmsAtLeast: megohms }
    : { megohms, megohmsAtLeast: null };
}

function terminalsOf(chunk: string): Terminals | null {
  const match = /\b([LN])\s*-\s*(PE|N)\b/i.exec(chunk);
  if (!match) return null;
  const pair = `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
  return TERMINALS.includes(pair as Terminals) ? (pair as Terminals) : null;
}

/**
 * Every voltage on the record, filed under the pair it was taken between.
 *
 * The instrument labels them — "L-PE=240V,N-PE=1V,L-N=241V" — so they are read
 * by their labels rather than by position. Taking the first number on the line
 * is what reported a 1 V neutral-to-earth reading as 240 V.
 *
 * Where nothing is labelled, the record is the other shape: one pair named in
 * the parameters and one bare voltage. That reading is filed under that pair,
 * so both shapes come out of here the same way.
 */
function readingsOf(chunk: string): Partial<Record<Terminals, number>> {
  const out: Partial<Record<Terminals, number>> = {};

  for (const match of chunk.matchAll(
    /\b(L\s*-\s*PE|L\s*-\s*N|N\s*-\s*PE)\s*=\s*(\d+(?:\.\d+)?)\s*V/gi,
  )) {
    const pair = match[1].replace(/\s+/g, "").toUpperCase() as Terminals;
    const value = Number.parseFloat(match[2]);
    // First one wins: a pair written twice on one line is the instrument's
    // doing, and taking the later one would silently prefer the right-hand one.
    if (TERMINALS.includes(pair) && Number.isFinite(value) && out[pair] === undefined) {
      out[pair] = value;
    }
  }
  if (Object.keys(out).length > 0) return out;

  const pair = terminalsOf(chunk);
  const bare = bareVoltage(chunk);
  if (pair && bare !== null) out[pair] = bare;
  return out;
}

/**
 * A single unlabelled voltage.
 *
 * "L-N" has an N in it and "N-PE" has a PE, so the pair is taken out of the
 * chunk before a number is looked for — otherwise a reading of "L-N 239.4V"
 * can be read off the wrong part of the line. The frequency goes too, so
 * "50HZ" is never mistaken for a reading.
 */
function bareVoltage(chunk: string): number | null {
  const without = chunk
    .replace(/\b\d+(?:\.\d+)?\s*HZ\b/gi, " ")
    .replace(/\b[LN]\s*-\s*(?:PE|N)\b/gi, " ");
  const match = /(\d+(?:\.\d+)?)\s*V\b/i.exec(without);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function hertzOf(chunk: string): number | null {
  const match = /\b(\d+(?:\.\d+)?)\s*HZ\b/i.exec(chunk);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function readDate(parts: string[] | null): Date | null {
  if (!parts || parts.length < 4) return null;
  const [day, hour, minute, second] = parts;
  const date = new Date(`${day}T${hour}:${minute}:${second}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* --- how a reading reads ----------------------------------------------------- */

/** "> 200 MΩ", "47.2 MΩ", or nothing. */
export function resistanceReads(row: InstallRow): string {
  if (row.megohmsAtLeast !== null) return `> ${trim(row.megohmsAtLeast)} MΩ`;
  if (row.megohms !== null) return `${trim(row.megohms)} MΩ`;
  return "—";
}

/** "239.4 V" at one pair of terminals, or nothing. */
export function voltsReads(row: InstallRow, pair: Terminals): string {
  const value = row.readings[pair];
  return value === undefined ? "—" : `${trim(value)} V`;
}

/**
 * Everything one record states, on one line.
 *
 * A whole polarity test holds three readings, so a row that shows one of them
 * shows the wrong amount: "N-PE 1 V" alone hides that the same record also
 * recorded 240 V to earth and 241 V across.
 */
export function voltsLine(row: InstallRow): string {
  const parts = TERMINALS.filter((pair) => row.readings[pair] !== undefined).map(
    (pair) => `${pair} ${trim(row.readings[pair] as number)} V`,
  );
  if (parts.length === 0) return "\u2014";
  const line = parts.join("  \u00b7  ");
  return row.hertz === null ? line : `${line}  \u00b7  ${trim(row.hertz)} Hz`;
}

/** The number itself, for a chart. */
export function voltsAt(row: InstallRow, pair: Terminals): number | null {
  return row.readings[pair] ?? null;
}


function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
