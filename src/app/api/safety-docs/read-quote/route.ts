import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { extractText, getDocumentProxy } from "unpdf";
import { suggest } from "@/lib/safety/catalogue";

export const runtime = "nodejs";

/**
 * Reads a quote and says which paperwork it points at.
 *
 * The job description is what carries the signal — it is where the method is
 * written out — so it is pulled from the quote's text and matched against each
 * template's tags. Nothing is chosen here: the words that matched come back
 * with the suggestion, and the operator decides. A wrong SWMS picked silently
 * is worse than picking from a list.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { fileId?: string };
    if (!body.fileId) return badRequest("No quote was supplied.");

    const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
    if (!file) return badRequest("That file could not be found.");
    if (file.mimeType !== "application/pdf") {
      return badRequest("The quote needs to be a PDF.");
    }

    const pdf = await readUpload(file.storedName);
    const document = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(document, { mergePages: true });
    const whole = Array.isArray(text) ? text.join("\n") : text;

    const description = jobDescription(whole);
    const found = suggest(description || whole);

    return NextResponse.json({
      jobDescription: description,
      suggestions: found.slice(0, 8).map((entry) => ({
        code: entry.template.code,
        kind: entry.template.kind,
        title: entry.template.title,
        pairs: entry.template.pairs ?? null,
        matched: entry.matched,
      })),
      // Offered as answers rather than filled in, so the questions stay
      // tappable and nobody has to type a phone number off a quote.
      candidates: {
        projectNames: projectNames(whole, description),
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
    /(?:^|\n)\s*(?:project|job|job name|re|reference|quote for)\s*[:\-]\s*([^\n]{4,80})/gi,
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
    /(?:^|\n)\s*(?:attention|attn|contact|site contact|project manager|supervisor|prepared for)\s*[:\-]\s*([A-Za-z][A-Za-z'\-. ]{2,48})/gi,
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
