import { inflateRawSync } from "node:zlib";

/**
 * Reading the first sheet of a spreadsheet.
 *
 * Enough of the format to get a logger's recording out of it and no more: an
 * .xlsx is a zip of XML, the cells are in one part and the strings in another,
 * and a date is a number of days since 1900 with a famous off-by-one in it.
 * Written here rather than taken as a dependency because the alternative is a
 * large library with a history of advisories, for a job that is three parts of
 * one file.
 *
 * Synchronous, because the caller already has the file in memory and a
 * recording is read once when it is uploaded.
 */

export function readSheet(bytes: Buffer): string[][] {
  const zip = loadSync(bytes);
  if (!zip) return [];

  const strings = sharedStrings(zip.get("xl/sharedStrings.xml") ?? "");
  const sheetPath =
    [...zip.keys()]
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .sort()[0] ?? "";
  const sheet = zip.get(sheetPath);
  if (!sheet) return [];

  return rowsOf(sheet, strings);
}

/* --- the zip -------------------------------------------------------------- */

let cached: { bytes: Buffer; parts: Map<string, string> } | null = null;

function loadSync(bytes: Buffer): Map<string, string> | null {
  if (cached && cached.bytes.equals(bytes)) return cached.parts;
  const parts = unzip(bytes);
  if (!parts) return null;
  cached = { bytes, parts };
  return parts;
}

/**
 * The parts of a zip, by name.
 *
 * Only stored and deflated entries, which is everything a spreadsheet writer
 * produces, read from the central directory so a corrupt local header cannot
 * throw the whole file away.
 */
function unzip(bytes: Buffer): Map<string, string> | null {
  const parts = new Map<string, string>();
  const end = findEndOfCentralDirectory(bytes);
  if (end < 0) return null;

  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);

  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(at + 10);
    const compressed = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const localAt = bytes.readUInt32LE(at + 42);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);

    if (/\.xml$/.test(name)) {
      const localNameLength = bytes.readUInt16LE(localAt + 26);
      const localExtraLength = bytes.readUInt16LE(localAt + 28);
      const from = localAt + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(from, from + compressed);
      try {
        const text =
          method === 0 ? raw.toString("utf8") : inflateRawSync(raw).toString("utf8");
        parts.set(name, text);
      } catch {
        // One unreadable part is not worth losing the rest of the file over.
      }
    }

    at += 46 + nameLength + extraLength + commentLength;
  }

  return parts.size > 0 ? parts : null;
}

/** The end-of-central-directory record, searched from the back. */
function findEndOfCentralDirectory(bytes: Buffer): number {
  for (let at = bytes.length - 22; at >= 0 && at > bytes.length - 66_000; at -= 1) {
    if (bytes.readUInt32LE(at) === 0x06054b50) return at;
  }
  return -1;
}

/* --- the sheet ------------------------------------------------------------ */

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(""),
  );
}

function rowsOf(xml: string, strings: string[]): string[][] {
  const out: string[][] = [];

  for (const row of xml.match(/<row\b[\s\S]*?(?:\/>|<\/row>)/g) ?? []) {
    const cells: string[] = [];
    for (const cell of row.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const reference = /r="([A-Z]+)\d+"/.exec(cell)?.[1];
      const at = reference ? columnOf(reference) : cells.length;
      while (cells.length < at) cells.push("");
      cells.push(valueOf(cell, strings));
    }
    if (cells.some((value) => value !== "")) out.push(cells);
  }

  return out;
}

function valueOf(cell: string, strings: string[]): string {
  const type = /\bt="([^"]+)"/.exec(cell)?.[1] ?? "n";
  if (type === "inlineStr") {
    return [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
  }

  const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
  if (raw === undefined) return "";
  if (type === "s") return strings[Number(raw)] ?? "";
  if (type === "str" || type === "e") return decode(raw);

  // A date is a plain number with a date format on it, and the format lives in
  // another part entirely. A serial in the range a logger writes is a date, so
  // it is handed back as an ISO timestamp the reader already understands.
  const value = Number(raw);
  if (Number.isFinite(value) && isDateSerial(cell, value)) return fromSerial(value);
  return raw;
}

/**
 * Whether a number is one of Excel's dates.
 *
 * A cell carries a style index rather than a format, so without reading the
 * styles part the test is the range: 40000 to 60000 is 2009 to 2064, and a
 * current reading is never in that range while a recording's timestamps always
 * are. A whole-number style index of zero is the General format, which is
 * never a date.
 */
function isDateSerial(cell: string, value: number): boolean {
  if (value < 40_000 || value > 60_000) return false;
  const style = /\bs="(\d+)"/.exec(cell)?.[1];
  return style !== undefined && style !== "0";
}

/** Excel counts days from 1899-12-30, which absorbs its phantom 1900 leap day. */
function fromSerial(serial: number): string {
  const ms = Math.round((serial - 25_569) * 86_400_000);
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

/** "AB" → 27 */
function columnOf(reference: string): number {
  let at = 0;
  for (const character of reference) at = at * 26 + (character.charCodeAt(0) - 64);
  return at - 1;
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
