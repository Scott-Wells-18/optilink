import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fields from "@/lib/safety/swmsFields.json";

/**
 * Filling in a SWMS.
 *
 * The templates are PDFs whose pages are flat images — no text layer worth
 * speaking of, no form fields. So the boxes were located once, offline, by
 * reading each document's own table rectangles and matching them to the labels
 * printed beside them; the result lives in swmsFields.json next to this file.
 * Here the values are simply written into those boxes, which needs nothing at
 * run time but pdf-lib.
 *
 * A value goes *in* its box: wrapped to the box's width, shrunk until it fits
 * the box's height, and centred in it. The first version of this wrote each
 * value where its label ended, which put the client's name half in the label's
 * cell and half in the one beside it, and ran a long project name straight
 * across the scope panel. A cell is a rectangle; text belongs inside it.
 *
 * Nothing else about the document is touched. Every word of the method, every
 * control measure and both signatures are the company's own, exactly as they
 * were written and approved — this only writes into the boxes that were left
 * empty for the job.
 */

/** A cell, measured from the top-left of the page as the document draws it. */
type Box = { page: number; x: number; top: number; width: number; height: number };
type Map = Record<
  string,
  { pages: number; size: { width: number; height: number }; fields: Record<string, Box> }
>;

const FIELDS = fields as Map;

const INK = rgb(0.04, 0.11, 0.18);
const PAD = 4;
const SIZES = [9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5];

/** Everything a SWMS asks for that is not already printed on it. */
export type SwmsValues = {
  clientName?: string;
  projectName?: string;
  projectAddress?: string;
  projectManager?: string;
  contactNumber?: string;
  submissionDate?: string;
  issueDate?: string;
  approvalDate?: string;
  consultDateScott?: string;
  consultDateKye?: string;
  /** Beside the signatures already printed on the signatories page. */
  signatoryDateScott?: string;
  signatoryDateKye?: string;
  /** Only on the templates that left those name cells blank. */
  signatoryNameScott?: string;
  signatoryNameKye?: string;
  /** The client's own project manager signs this one by hand, on site. */
  signatureDate?: string;
  /** The job written out, for the blank scope box on the templates that have one. */
  scopeOfWorks?: string;
  /**
   * OEC-SWMS014's energised-work addendum, keyed by the field names in the
   * map. It is three pages the other statements do not have, and it asks for
   * what OEC-WHS002 asks for, so it is filled from the same answers.
   */
  addendum?: Record<string, string>;
  /** The addendum's own tick boxes, by name — "reason2", "check7". */
  ticks?: string[];
};

/** Which templates this can fill — anything the mapper has been run over. */
export function canFill(code: string): boolean {
  return Boolean(FIELDS[code]);
}

export async function fillSwms(
  code: string,
  template: Buffer,
  values: SwmsValues,
): Promise<Buffer> {
  const map = FIELDS[code];
  const doc = await PDFDocument.load(template);
  if (!map) return Buffer.from(await doc.save());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  const ticks = new Set(values.ticks ?? []);

  for (const [key, box] of Object.entries(map.fields)) {
    const page = pages[box.page - 1];
    if (!page) continue;

    if (ticks.has(key)) {
      tick(page, box, font);
      continue;
    }

    const value = (
      values.addendum?.[key] ?? (values[key as keyof SwmsValues] as string | undefined)
    )?.trim();
    if (!value) continue;
    write(page, value, box, font);
  }

  return Buffer.from(await doc.save());
}

/**
 * One value, inside one box.
 *
 * The largest size that fits is used, down to five and a half points; below
 * that the tail is dropped with an ellipsis rather than printed over the cell
 * next door. A value that fits on one line sits on the middle of the box, the
 * way the label beside it does.
 */
export function write(page: PDFPage, value: string, box: Box, font: PDFFont): void {
  const height = page.getHeight();
  const width = Math.max(20, box.width - PAD * 2);
  // The whole cell, not the cell less a margin: several of these rows are
  // barely taller than the line they hold, and half a point of politeness
  // costs the reader a second line of what was written.
  const room = Math.max(8, box.height);

  for (const size of SIZES) {
    const leading = size * (size <= 6 ? 1.12 : 1.22);
    const lines = wrap(value, font, size, width);
    const fits = Math.max(1, Math.floor(room / leading));
    const last = size === SIZES[SIZES.length - 1];
    if (!last && lines.length > fits) continue;

    const shown = lines.slice(0, fits);
    if (shown.length < lines.length) {
      shown[shown.length - 1] = clip(`${shown[shown.length - 1]} …`, font, size, width);
    }
    // Centred in the box, then down by the cap height so the first line sits
    // where a reader expects it rather than hanging off the top edge.
    const block = shown.length * leading;
    const top = box.top + Math.max(0, (box.height - block) / 2);
    shown.forEach((line, index) => {
      page.drawText(line, {
        x: box.x + PAD,
        y: height - (top + index * leading + size * 0.95),
        size,
        font,
        color: INK,
      });
    });
    return;
  }
}

/** A cross in one of the form's own tick boxes. */
export function tick(page: PDFPage, box: Box, font: PDFFont): void {
  const height = page.getHeight();
  const size = Math.min(8, box.height + 1);
  page.drawText("X", {
    x: box.x + Math.max(0, (box.width - font.widthOfTextAtSize("X", size)) / 2),
    y: height - (box.top + box.height - Math.max(0, (box.height - size * 0.72) / 2)),
    size,
    font,
    color: INK,
  });
}

/** Greedy word wrap at the width the box actually has. */
function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * The last resort for something that will not shrink far enough — better a
 * name that visibly runs out than one that silently overprints the next cell.
 */
function clip(value: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let text = value;
  while (text.length > 4 && font.widthOfTextAtSize(`${text}…`, size) > width) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}
