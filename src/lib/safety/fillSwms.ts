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

/** `height` is present only on a block — a box a paragraph goes into. */
type Box = { page: number; x: number; y: number; width: number; height?: number };
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
  /** The job written out, for the blank scope box on the templates that have one. */
  scopeOfWorks?: string;
};

/**
 * Whether a field has a second line to run onto.
 *
 * Only the project name ever needs one — it carries the job number and the
 * job's own name, which on a real job is longer than the line the form leaves
 * for it. Whether there is room depends on the document: on the templates
 * where the client block sits beside a tall scope panel the cell is hundreds
 * of points deep, and on the ones where it is a plain row the next label is
 * thirty points below. The map knows where that next label is, so the distance
 * to it is what decides — a second line that would land on the row beneath, or
 * across the panel beside it, is worse than a name that visibly runs out.
 */
/**
 * How wide the box really is.
 *
 * The maps were read off the pages with OCR, and on eight of the eighteen
 * templates the project-name cell was measured as running all the way into the
 * scope-of-works panel beside it — four hundred points wide instead of a
 * hundred and seventy-five. A short value never noticed. A job number followed
 * by a real job name prints straight across the scope text. So where the map
 * knows where the scope panel starts, nothing is written past it.
 */
function widthOf(key: string, map: Map[string], box: Box): number {
  const scope = map.fields.scopeOfWorks;
  if (key !== "projectName" || !scope) return box.width;
  return Math.min(box.width, Math.max(60, scope.x - 6 - box.x));
}

function roomBelow(key: string, map: Map[string]): boolean {
  if (key !== "projectName") return false;
  const below = map.fields.projectAddress;
  if (!below) return false;
  return map.fields.projectName.y - below.y > 60;
}

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

    if (box.height) {
      drawBlock(page, value, box, font);
      continue;
    }

    // Come down a point at a time rather than let a long client name run
    // across the cell beside it.
    const width = widthOf(key, map, box);
    let size = 9;
    // A field that can wrap stops shrinking sooner; the second line is a
    // better answer than six-point type.
    const floor = roomBelow(key, map) ? 7 : 5.5;
    while (size > floor && font.widthOfTextAtSize(value, size) > width) size -= 0.25;

    const ink = rgb(0.04, 0.11, 0.18);
    let lines = [clip(value, font, size, width)];
    if (roomBelow(key, map) && font.widthOfTextAtSize(value, size) > width) {
      const all = wrap(value, font, size, width);
      lines = all.slice(0, 2);
      // Two lines is what the cell has room for. Where even that is not
      // enough, the last one ends visibly rather than stopping mid-sentence as
      // though the name were that long.
      if (all.length > lines.length) {
        lines[1] = clip(`${lines[1]} …`, font, size, width);
      }
    }

    lines.forEach((line, index) => {
      page.drawText(line, {
        x: box.x,
        y: box.y - index * (size * 1.25),
        size,
        font,
        color: ink,
      });
    });
  }

  return Buffer.from(await doc.save());
}

/**
 * A paragraph in a box — the scope of works, which is a blank cell under a
 * heading rather than a line beside a label.
 *
 * It is set at the largest size that fits the box, and where even the smallest
 * will not hold it the tail is dropped with an ellipsis rather than printed
 * over the table below. The box's own measurements come from the template, so
 * what fits is what actually fits on that document.
 */
function drawBlock(
  page: { drawText: (text: string, options: Record<string, unknown>) => void },
  value: string,
  box: { x: number; y: number; width: number; height?: number },
  font: Font,
): void {
  const height = box.height ?? 40;
  for (const size of [9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5]) {
    const leading = size * 1.28;
    // The box's y is its top edge, and pdf-lib draws from a baseline, so the
    // first line starts a full line down — otherwise its ascenders climb into
    // the heading printed above the box.
    const first = box.y - size;
    const fits = Math.max(1, Math.floor((height - size) / leading) + 1);
    const lines = wrap(value, font, size, box.width);
    const last = size === 5.5;
    if (!last && lines.length > fits) continue;

    const shown = lines.slice(0, fits);
    if (shown.length < lines.length) {
      shown[shown.length - 1] = clip(
        `${shown[shown.length - 1]} …`,
        font,
        size,
        box.width,
      );
    }
    shown.forEach((line, index) => {
      page.drawText(line, {
        x: box.x,
        y: first - index * leading,
        size,
        font,
        color: rgb(0.04, 0.11, 0.18),
      });
    });
    return;
  }
}

/** Greedy word wrap at the width the box actually has. */
function wrap(value: string, font: Font, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type Font = { widthOfTextAtSize: (text: string, size: number) => number };

/**
 * The last resort for something that will not shrink far enough — better a
 * name that visibly runs out than one that silently overprints the next cell.
 */
function clip(value: string, font: Font, size: number, width: number): string {
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let text = value;
  while (text.length > 4 && font.widthOfTextAtSize(`${text}…`, size) > width) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}
