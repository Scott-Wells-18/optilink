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
  // The due word is required, never optional: made optional this matches a
  // bare "Date of Calibration" and reports the day it was calibrated as the
  // day it expires, which is the one misread that matters here.
  /(?:calibration|recalibration|re-?cal(?:ibration)?)\s*(?:due|expiry|expires?)(?:\s*date)?/i,
  /\bre-?calibration\s*date\b/i,
  /\b(?:next|re-?)\s*(?:calibration|test|check|cert(?:ification)?)(?:\s*date)?/i,
  /\bdue\b(?:\s*date)?/i,
  /\bdate\s*due\b/i,
  /\bexpir(?:y|es?|ation)\b(?:\s*date)?/i,
  /\bvalid\s*(?:un)?til\b/i,
  /\bretest\b(?:\s*date)?/i,
];

const CALIBRATED = [
  /\bdate\s*(?:of\s*)?calibrat(?:ion|ed)\b/i,
  /\bcalibrat(?:ion|ed)\s*(?:on\s*)?date\b/i,
  /\bdate\s*calibrated\b/i,
  /\bcal\.?\s*date\b/i,
  /\bdate\s*of\s*(?:test|issue)\b/i,
  /\bissued?\b(?:\s*on)?/i,
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
 * Every place a label appears, not just the first.
 *
 * The word behind a label turns up elsewhere in ordinary prose — "due to",
 * "issued by" — and a certificate is prose as well as a table. Taking only the
 * first match means one stray sentence higher up the page loses the fact
 * entirely, which is exactly how a certificate labelled "Due Date" came back
 * with no expiry on it. So every occurrence is tried in turn and the first one
 * that actually yields a value wins.
 */
function* matches(text: string, label: RegExp, window: string): Generator<string> {
  const pattern = new RegExp(`${label.source}\\s*[:\\-\\u2013]?[ \\t]*${window}`, "gi");
  for (const found of text.matchAll(pattern)) {
    if (found[1]) yield found[1];
  }
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
    for (const raw of matches(text, label, `([^\\n\\r]{1,${limit}})`)) {
      const value = raw.split(/\s{2,}/)[0]?.trim();
      if (value && !isLabel(value)) return value;
    }
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

/**
 * The date a label introduces.
 *
 * The window runs past the end of the line, because a table sets the label in
 * one cell and the date in the next and the text layer can put a line break
 * between them. It stops at the line after, so a label with nothing against it
 * cannot reach down the page and claim some other row's date.
 */
function date(text: string, labels: RegExp[]): Date | null {
  const window = "([^\\n\\r]{0,40}(?:\\r?\\n[^\\n\\r]{0,40})?)";
  for (const label of labels) {
    for (const raw of matches(text, label, window)) {
      const parsed = readDate(raw);
      if (parsed) return parsed;
    }
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

/**
 * When the calibration lapses.
 *
 * The certificate's own due date wherever it gives one, because that is the
 * laboratory's statement and no assumption of ours can be better than it.
 * Where it gives none, a year from the day it was calibrated, which is the
 * usual interval and is better than a blank row — but it is said to be a
 * derived date on the report rather than quoted as though the laboratory
 * wrote it, because on the day it matters the difference is the whole point.
 */
export function expiry(
  calibration: Calibration,
): { at: Date; derived: boolean } | null {
  if (calibration.expiresOn) return { at: calibration.expiresOn, derived: false };
  const from = calibration.calibratedOn;
  if (!from) return null;

  // Through the same day next year. The 29th of February has no such day, so
  // it lands on the 1st of March, which is the first day the calibration is
  // no longer a year old.
  const at = new Date(
    Date.UTC(from.getUTCFullYear() + 1, from.getUTCMonth(), from.getUTCDate()),
  );
  return { at, derived: true };
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
