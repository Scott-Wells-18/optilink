import { extractText, getDocumentProxy } from "unpdf";

/**
 * Reading the facts off a calibration certificate.
 *
 * Every laboratory lays its certificate out differently, so nothing here looks
 * for a position on the page. It looks for the words a certificate uses to
 * introduce each fact — "Date of Calibration", "Calibration Due", "Serial
 * Number" — and takes what follows. A certificate that does not use any of
 * them simply yields nothing, and the report falls back on what was typed in
 * against the instrument.
 *
 * Nothing found here is ever allowed to overwrite something a person entered:
 * the person is the one who knows which meter is in their hand, and a serial
 * number read off a certificate by pattern match is a guess by comparison.
 */

export type Calibration = {
  serialNo: string | null;
  modelNo: string | null;
  /** The day it was calibrated. */
  calibratedOn: Date | null;
  /** The day that calibration lapses. */
  expiresOn: Date | null;
};

const EMPTY: Calibration = {
  serialNo: null,
  modelNo: null,
  calibratedOn: null,
  expiresOn: null,
};

/**
 * What each fact is called, in the order the patterns are tried.
 *
 * Expiry comes before calibration because "Calibration Due Date" contains the
 * word "calibration", and a looser pattern tested first would take the due
 * date and call it the date of calibration — which is the one mistake here
 * that would put a lapsed instrument on a report looking current.
 */
const EXPIRY = [
  /(?:calibration|recalibration|re-?cal(?:ibration)?)\s*(?:due|expiry|expires?)(?:\s*date)?/i,
  /(?:due|expiry|expires?|valid\s*(?:un)?til|next\s*calibration)(?:\s*date)?/i,
];

const CALIBRATED = [
  /date\s*(?:of\s*)?calibrat(?:ion|ed)/i,
  /calibration\s*date/i,
  /date\s*calibrated/i,
  /\bcal\.?\s*date\b/i,
  /\bissued?(?:\s*on)?\b/i,
];

const SERIAL = [/serial\s*(?:number|no\.?|#)?/i, /\bs\s*\/\s*n\b/i, /\bsn\b/i];
const MODEL = [/model\s*(?:number|no\.?|#)?/i, /\btype\b/i, /\bpart\s*(?:no\.?|number)\b/i];

export async function readCalibration(pdf: Buffer): Promise<Calibration> {
  let text: string;
  try {
    const document = await getDocumentProxy(new Uint8Array(pdf));
    ({ text } = await extractText(document, { mergePages: true }));
  } catch {
    return { ...EMPTY };
  }
  if (!text?.trim()) return { ...EMPTY };

  return {
    serialNo: after(text, SERIAL, 32),
    modelNo: after(text, MODEL, 32),
    calibratedOn: date(text, CALIBRATED),
    expiresOn: date(text, EXPIRY),
  };
}

/**
 * What follows a label, up to the end of the value.
 *
 * A certificate writes "Serial Number: 210457891" or sets the label and the
 * value in adjacent table cells, which comes out of the text layer as the two
 * separated by spaces or a line break. Either way the value is what is left on
 * the line after the label and any colon, so that is what is taken — stopping
 * at two or more spaces, because in a table that gap is the next column.
 */
function after(text: string, labels: RegExp[], limit: number): string | null {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label.source}\\s*[:\\-\\u2013]?[ \\t]*([^\\n\\r]{1,${limit}})`,
      label.flags.includes("i") ? "i" : "",
    );
    const found = pattern.exec(text);
    const value = found?.[1]?.split(/\s{2,}/)[0]?.trim();
    if (value && !isLabel(value)) return value;
  }
  return null;
}

/** A value that is really the next label along, which means the cell was empty. */
function isLabel(value: string): boolean {
  return (
    value.length < 2 ||
    /^(?:no\.?|number|name|date|model|type|serial|:|–|-)$/i.test(value)
  );
}

function date(text: string, labels: RegExp[]): Date | null {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label.source}\\s*[:\\-\\u2013]?\\s*([^\\n\\r]{1,40})`,
      "i",
    );
    const found = pattern.exec(text);
    const parsed = found ? readDate(found[1]) : null;
    if (parsed) return parsed;
  }
  return null;
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * A date in the shapes a certificate writes one.
 *
 * Day-first where it is ambiguous, because these are Australian certificates
 * and a laboratory writing 03/12/2026 means the third of December. A month
 * written in letters is unambiguous and is taken as read.
 */
export function readDate(text: string): Date | null {
  const named =
    /(\d{1,2})\s*(?:st|nd|rd|th)?\s*[-\s/]\s*([A-Za-z]{3,})\s*[-,\s/]\s*(\d{2,4})/.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month >= 0) return build(Number(named[3]), month, Number(named[1]));
  }

  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return build(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = /(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})/.exec(text);
  if (dmy) return build(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  return null;
}

function build(year: number, month: number, day: number): Date | null {
  const full = year < 100 ? 2000 + year : year;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  // A certificate from before computers or from beyond a working life is a
  // misread, not a date.
  if (full < 1990 || full > 2100) return null;
  const at = new Date(Date.UTC(full, month, day));
  return at.getUTCMonth() === month && at.getUTCDate() === day ? at : null;
}
