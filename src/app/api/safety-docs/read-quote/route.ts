import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { extractText, getDocumentProxy } from "unpdf";
import { asLines, parseCsv } from "@/lib/csv";
import { readAnswers } from "@/lib/safety/decide";

export const runtime = "nodejs";

/**
 * Reads a quote and says which paperwork it points at.
 *
 * The job description is what carries the signal — it is where the method is
 * written out — so it is pulled from the quote's text and matched against each
 * template's tags. Nothing is chosen here: the words that matched come back
 * with the suggestion, and the operator decides. A wrong SWMS picked silently
 * is worse than picking from a list.
 *
 * A quote arrives as a PDF or as the CSV the accounting software exports.
 * Both end up as the same lines of text; only the way they are opened differs.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { fileId?: string };
    if (!body.fileId) return badRequest("No quote was supplied.");

    const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
    if (!file) return badRequest("That file could not be found.");

    const isCsv = file.mimeType === "text/csv";
    if (!isCsv && file.mimeType !== "application/pdf") {
      return badRequest("The quote needs to be a PDF or a CSV.");
    }

    const bytes = await readUpload(file.storedName);
    let whole: string;
    let described = "";

    if (isCsv) {
      const rows = parseCsv(bytes.toString("utf8"));
      whole = asLines(rows);
      // A CSV usually carries the description in a column of its own, which a
      // heading pattern would never find.
      described = descriptionColumn(rows);
    } else {
      const document = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(document, { mergePages: true });
      whole = Array.isArray(text) ? text.join("\n") : text;
    }

    const description = described || jobDescription(whole);
    const names = projectNames(whole, description);
    const title = jobTitle(whole) || names[0] || "";

    // What the quote already settles, so it is not asked about again.
    const answered = readAnswers(`${title} ${description} ${whole}`);

    return NextResponse.json({
      jobTitle: title,
      jobDescription: description,
      answered,
      // Offered as answers rather than filled in, so the questions stay
      // tappable and nobody has to type a phone number off a quote.
      candidates: {
        projectNames: names,
        people: people(whole),
        numbers: numbers(whole),
      },
    });
  } catch (error) {
    return serverError(error, "That quote could not be read.");
  }
}

/**
 * The job description out of a quote.
 *
 * SmartBiz puts it under a heading; where no heading turns up the whole
 * document is matched instead, which is noisier but never worse than nothing.
 */
function jobDescription(text: string): string {
  const match =
    /(?:job\s*description|scope\s*of\s*works?|description\s*of\s*works?|works?\s*description)\s*[:\-]?\s*([\s\S]{40,3000})/i.exec(
      text,
    );
  if (!match) return "";
  // Stop at whatever reads like the next heading or a totals block.
  const body = match[1].split(/\n(?=[A-Z][A-Za-z ]{3,40}[:\n])|\n\s*(?:total|subtotal|gst)\b/i)[0];
  return body.replace(/\s+/g, " ").trim().slice(0, 2000);
}

/**
 * The description out of a CSV's own column.
 *
 * An exported quote is a table: a header row, then a line per item, with the
 * work written out under a heading like "Description" or "Details". So the
 * column is found by its heading and its cells are read down, longest first —
 * the line that describes the job is always longer than "Call-out fee".
 *
 * Failing that, a row that puts a label beside its value is tried, then the
 * longest cell in the file, which on a one-line quote is the job.
 */
function descriptionColumn(rows: string[][]): string {
  const heading = /^(?:description|details|scope|work(?:s)?(?: description| required| to be done)?|job(?: description)?|notes?|comments?)$/i;

  for (const [at, row] of rows.entries()) {
    const column = row.findIndex((cell) => heading.test(cell));
    if (column < 0) continue;
    const below = rows
      .slice(at + 1)
      .map((line) => line[column] ?? "")
      .filter((cell) => cell.length >= 12);
    if (below.length === 0) continue;
    return tidyBlock(below.join(". "));
  }

  // "Job description","Attend site to ..." on a row of its own.
  for (const row of rows) {
    const at = row.findIndex((cell) =>
      /job\s*description|scope\s*of\s*works?|description\s*of\s*works?/i.test(cell),
    );
    if (at < 0) continue;
    const value = row.slice(at + 1).find((cell) => cell.length >= 12);
    if (value) return tidyBlock(value);
  }

  const longest = rows.flat().reduce((best, cell) => (cell.length > best.length ? cell : best), "");
  return longest.length >= 40 ? tidyBlock(longest) : "";
}

function tidyBlock(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\.\s*\./g, ".").trim().slice(0, 2000);
}

/**
 * What the quote calls the job.
 *
 * Tried against every heading a quote puts it under, then against the biggest
 * line of text near the top of the page — a quote that names the job at all
 * names it early, and a line set in the title is the one the reader takes as
 * the job.
 */
function jobTitle(text: string): string {
  const labelled =
    /(?:^|\n|\|)\s*(?:job(?:\s*title|\s*name)?|project(?:\s*name)?|title|subject|re|work\s*order|description\s*of\s*job|quote\s*(?:for|title))\s*[:\-|]\s*([^\n|]{4,90})/i.exec(
      text,
    );
  if (labelled) return shorten(labelled[1].trim());

  // Nothing labelled it, so the first line that reads like a name rather than
  // an address, a number or a heading.
  for (const line of text.split("\n").slice(0, 14)) {
    const value = line.replace(/\s+/g, " ").trim();
    if (value.length < 8 || value.length > 90) continue;
    if (/[:|]/.test(value)) continue;
    if (/^\d|abn|acn|gst|total|invoice|quote\s*(?:no|number|#)|phone|email|www\./i.test(value)) {
      continue;
    }
    if (!/[a-z]/.test(value)) continue;
    return shorten(value);
  }
  return "";
}

/* --- answers to offer ----------------------------------------------------- */

/**
 * What the job might be called.
 *
 * A quote names the job somewhere near the top — after "Project", "Job" or
 * "Re" — and where it does not, the first sentence of the description says it
 * well enough to pick from a list.
 */
function projectNames(text: string, description: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(
    // ":" in a PDF, "|" where a CSV row held more than a label and a value.
    /(?:^|\n|\|)\s*(?:project|job|job name|re|reference|quote for)\s*[:\-|]\s*([^\n|]{4,80})/gi,
  )) {
    out.push(match[1]);
  }
  const first = description.split(/(?<=[.;])\s/)[0];
  if (first && first.length >= 8) out.push(shorten(first));
  return tidyList(out);
}

/** Cut at a word, never mid-word — this ends up printed on the document. */
function shorten(value: string): string {
  if (value.length <= 80) return value;
  const cut = value.slice(0, 80);
  const at = cut.lastIndexOf(" ");
  return (at > 30 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, "");
}

/** Names the quote puts forward as the person to speak to. */
function people(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(
    /(?:^|\n|\|)\s*(?:attention|attn|contact|site contact|project manager|supervisor|prepared for)\s*[:\-|]\s*([A-Za-z][A-Za-z'\-. ]{2,48})/gi,
  )) {
    out.push(match[1]);
  }
  return tidyList(out);
}

/**
 * Australian numbers, landline or mobile, however they were spaced.
 *
 * They come back grouped the way a person writes them rather than as the run
 * of digits the PDF holds, because this ends up printed on the document.
 */
function numbers(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/(?:\+?61[\s-]?|0)[2-478](?:[\s-]?\d){8}\b/g)) {
    const digits = match[0].replace(/\D/g, "").replace(/^61/, "0");
    if (digits.length !== 10) continue;
    out.push(
      digits.startsWith("04")
        ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
        : `(${digits.slice(0, 2)}) ${digits.slice(2, 6)} ${digits.slice(6)}`,
    );
  }
  return tidyList(out);
}

/** Trimmed, de-duplicated, and short enough to sit on a button. */
function tidyList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim().replace(/[.,;:]$/, "");
    if (clean.length < 3 || clean.length > 80) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length === 6) break;
  }
  return out;
}
