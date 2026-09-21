import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fields from "@/lib/safety/fields.json";

/**
 * Filling in a SWMS.
 *
 * The templates are PDFs whose pages are flat images — no text layer, no form
 * fields. So the blanks were located once, offline, by reading the pages with
 * OCR, and their coordinates live in fields.json beside this file. Here the
 * values are simply stamped at those coordinates, which needs nothing at run
 * time but pdf-lib.
 *
 * Nothing else about the document is touched. Every word of the method, every
 * control measure and both signatures are the company's own, exactly as they
 * were written and approved — this only writes into the boxes that were left
 * empty for the job.
 */

type Box = { page: number; x: number; y: number; width: number };
type Map = Record<string, { pages: number; size: { width: number; height: number }; fields: Record<string, Box> }>;

const FIELDS = fields as Map;

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

  for (const [key, box] of Object.entries(map.fields)) {
    const value = values[key as keyof SwmsValues]?.trim();
    if (!value) continue;
    const page = pages[box.page - 1];
    if (!page) continue;

    // Come down a point at a time rather than let a long client name run
    // across the cell beside it.
    let size = 9;
    while (size > 5.5 && font.widthOfTextAtSize(value, size) > box.width) size -= 0.25;

    page.drawText(clip(value, font, size, box.width), {
      x: box.x,
      y: box.y,
      size,
      font,
      color: rgb(0.04, 0.11, 0.18),
    });
  }

  return Buffer.from(await doc.save());
}

/**
 * The last resort for something that will not shrink far enough — better a
 * name that visibly runs out than one that silently overprints the next cell.
 */
function clip(
  value: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
  width: number,
): string {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let text = value;
  while (text.length > 4 && font.widthOfTextAtSize(`${text}…`, size) > width) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}
