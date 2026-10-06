import { COLOURS, SEVERITY, safe } from "@/lib/report/theme";
import { FIELD_LABELS, type Field, type Item, type Verdict } from "@/lib/tagging/register";
import type { Doc } from "@/lib/report/furniture";

/**
 * A register of tagged equipment, drawn so it can be read.
 *
 * Nineteen columns across a landscape page is 40 points each, which is five
 * characters of eight-point type — a serial number cut after "OZI15". So the
 * register is drawn as two tables rather than one: what identifies the item
 * and how it tested, then everything else about it underneath. Both carry the
 * barcode, which is what ties a row in one to a row in the other, and both
 * repeat their headings on every page.
 *
 * Nothing is abbreviated away. A description too long for its column wraps
 * and makes its row taller; a row too tall for what is left of the page moves
 * to the next one whole.
 */

/* --- geometry ------------------------------------------------------------- */

export const LAND = { width: 841.89, height: 595.28 } as const;
export const LAND_MARGIN = 34;
export const LAND_CONTENT = LAND.width - LAND_MARGIN * 2;

/** Where a page's rows start, under the running head. */
export const TABLE_TOP = 92;
/** Where they stop, above the foot bar. */
export const TABLE_FLOOR = LAND.height - 54;

const ROW_PAD = 5.5;
const LINE = 10.5;
const SIZE = 8;

/**
 * The two tables, and what is in each.
 *
 * The first is what somebody looking for one item needs to find it and know
 * how it went; the second is the rest of the record. Customer and site are in
 * neither, because they are the same for every row of a group and are printed
 * once above it.
 */
type Column = { field: Field; width: number; label?: string };

const IDENTITY: Column[] = [
  { field: "barcode", width: 74 },
  { field: "description", width: 168 },
  { field: "make", width: 74 },
  { field: "model", width: 74 },
  { field: "serialNo", width: 86 },
  { field: "location", width: 86 },
  { field: "status", width: 60 },
  { field: "lastTestDate", width: 68 },
  { field: "testDue", width: 64 },
];

const DETAIL: Column[] = [
  { field: "barcode", width: 74 },
  { field: "category", width: 74 },
  { field: "oldBarcode", width: 74 },
  { field: "assetNo", width: 70 },
  { field: "frequency", width: 64 },
  { field: "lastTestTime", width: 56 },
  { field: "sequence", width: 132 },
  { field: "user", width: 64 },
  { field: "comments", width: 166 },
];

export const TABLES: { title: string; columns: Column[] }[] = [
  { title: "Equipment and test result", columns: IDENTITY },
  { title: "Register detail", columns: DETAIL },
];

/* --- drawing -------------------------------------------------------------- */

/**
 * What a cell holds.
 *
 * An empty cell prints an en dash rather than nothing, so a column that was
 * not in the export reads as "not recorded" rather than as a drawing error.
 * "NA" is what the tagging software writes for a field that does not apply,
 * and it is left exactly as it was written.
 */
function cellText(item: Item, field: Field): string {
  const value = item[field]?.trim() ?? "";
  return value ? safe(value) : "–";
}

export function headingRow(
  doc: Doc,
  y: number,
  columns: Column[],
  fill: string = COLOURS.bar,
): number {
  const height = 19;
  doc.rect(LAND_MARGIN, y, LAND_CONTENT, height).fill(fill);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(7);
  let x = LAND_MARGIN;
  for (const column of columns) {
    doc.text((column.label ?? FIELD_LABELS[column.field]).toUpperCase(), x + 5, y + 6.5, {
      width: column.width - 8,
      characterSpacing: 0.5,
      lineBreak: false,
      ellipsis: true,
    });
    x += column.width;
  }
  doc.fillColor(COLOURS.ink);
  return y + height;
}

/**
 * A line carried under a row, across the whole width.
 *
 * A failure's comment is the most useful thing on its row and the worst thing
 * to lose to a 60-point column, so on the failures table it is written out
 * under the item rather than squeezed beside it. Everywhere else there is
 * nothing to carry and the row is one line.
 */
export type Annotate = (item: Item) => string | null;

function noteHeight(doc: Doc, text: string): number {
  doc.font("Helvetica-Oblique").fontSize(7.5);
  return doc.heightOfString(text, { width: LAND_CONTENT - 30, lineGap: 1 }) + 5;
}

/** How tall a row has to be for everything in it to be legible. */
export function rowHeight(doc: Doc, item: Item, columns: Column[], note?: Annotate): number {
  doc.font("Helvetica").fontSize(SIZE);
  let lines = 1;
  for (const column of columns) {
    const text = cellText(item, column.field);
    const height = doc.heightOfString(text, { width: column.width - 10, lineGap: 1 });
    lines = Math.max(lines, Math.max(1, Math.round(height / LINE)));
  }
  const carried = note?.(item);
  return lines * LINE + ROW_PAD * 2 + (carried ? noteHeight(doc, carried) : 0);
}

/**
 * One row.
 *
 * The status cell is chipped rather than merely coloured: a client printing
 * this in black and white still has to be able to tell a fail from a pass, so
 * the word is there as well as the colour.
 */
export function drawRow(
  doc: Doc,
  y: number,
  item: Item,
  columns: Column[],
  index: number,
  height: number,
  note?: Annotate,
) {
  if (index % 2 === 1) doc.rect(LAND_MARGIN, y, LAND_CONTENT, height).fill(COLOURS.soft);
  doc.rect(LAND_MARGIN, y + height, LAND_CONTENT, 0.5).fill(COLOURS.hair);

  let x = LAND_MARGIN;
  for (const column of columns) {
    const text = cellText(item, column.field);
    if (column.field === "status") {
      statusChip(doc, x + 5, y + ROW_PAD - 1, column.width - 12, item);
    } else {
      doc.font("Helvetica").fontSize(SIZE).fillColor(COLOURS.ink);
      doc.text(text, x + 5, y + ROW_PAD, { width: column.width - 10, lineGap: 1 });
    }
    x += column.width;
  }

  const carried = note?.(item);
  if (carried) {
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(carried, LAND_MARGIN + 20, y + height - noteHeight(doc, carried) + 1, {
      width: LAND_CONTENT - 30,
      lineGap: 1,
    });
  }
  doc.fillColor(COLOURS.ink);
}

const CHIP: Record<Verdict, { fill: string; ink: string }> = {
  PASS: SEVERITY.pass,
  FAIL: SEVERITY.fail,
  REVIEW: SEVERITY.concern,
};

/**
 * The status cell, chipped.
 *
 * The word the export used, not the verdict this report drew from it: a status
 * of "Tagged Out" prints as "Tagged Out".
 *
 * Which means it has to print whole. Shrinking to fit one line is tried first
 * and handles nearly everything, but a two-word status in a narrow column does
 * not fit on one line at a size anybody can read, and clipping it is how
 * "RETEST PENDING" came out as "RETEST" — a status that then reads as a
 * different status. So where one line will not do, the chip takes two and
 * grows; the row was measured against the same text, so there is room.
 */
function statusChip(doc: Doc, x: number, y: number, width: number, item: Item) {
  const tone = CHIP[item.verdict];
  const text = safe(item.status || "Not stated").toUpperCase();
  const options = { characterSpacing: 0.3 } as const;

  doc.font("Helvetica-Bold");
  let size = 7;
  doc.fontSize(size);
  while (size > 6 && doc.widthOfString(text, options) > width - 4) {
    size -= 0.5;
    doc.fontSize(size);
  }

  // One line if it fits at a legible size; otherwise split at the last space
  // that fits and let the chip be two lines tall.
  const lines: string[] = [];
  if (doc.widthOfString(text, options) <= width - 4) {
    lines.push(text);
  } else {
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && doc.widthOfString(next, options) > width - 4) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    // A single word longer than the column is the one case left: it shrinks
    // the rest of the way rather than losing characters.
    while (size > 4.5 && lines.some((one) => doc.widthOfString(one, options) > width - 4)) {
      size -= 0.5;
      doc.fontSize(size);
    }
  }

  const line = size + 2.4;
  const height = Math.max(13, lines.length * line + 3.4);
  doc.roundedRect(x, y, width, height, 3).fill(tone.fill);
  doc.fillColor(tone.ink).font("Helvetica-Bold").fontSize(size);

  let at = y + (height - lines.length * line) / 2 + 0.4;
  for (const one of lines) {
    doc.text(one, x, at, { width, align: "center", lineBreak: false, ...options });
    at += line;
  }
  doc.fillColor(COLOURS.ink);
}

/**
 * A block of equipment, over as many pages as it takes.
 *
 * `onPage` is called whenever a new page is needed and is what draws the
 * running head; it hands back the y the rows may start at. The headings are
 * redrawn under it every time, because a page of rows with no headings is a
 * page of numbers.
 */
/**
 * A band across the table, naming whose equipment the rows under it are.
 *
 * Only drawn where a file holds more than one customer or site. A register of
 * one customer's gear does not need telling whose it is on every page; a
 * register of three does, because the alternative is one customer's name
 * standing over another customer's equipment, which is the worst thing this
 * report could print.
 */
const BAND_HEIGHT = 18;

export function groupBand(item: Item): string {
  return `${item.customer || "(no customer)"}  \u2014  ${item.site || "(no site)"}`;
}

function drawBand(doc: Doc, y: number, text: string) {
  doc.rect(LAND_MARGIN, y, LAND_CONTENT, BAND_HEIGHT).fill(COLOURS.band);
  doc.rect(LAND_MARGIN, y, 3, BAND_HEIGHT).fill(COLOURS.accent);
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(8.5);
  doc.text(safe(text), LAND_MARGIN + 12, y + 5, {
    width: LAND_CONTENT - 24,
    lineBreak: false,
    ellipsis: true,
  });
  doc.fillColor(COLOURS.ink);
}

export function drawTable(
  doc: Doc,
  items: Item[],
  columns: Column[],
  start: number,
  onPage: () => number,
  headFill: string = COLOURS.bar,
  note?: Annotate,
  /** True where the report covers more than one customer or site. */
  banded = false,
): number {
  let y = headingRow(doc, start, columns, headFill);
  let band: string | null = null;

  items.forEach((item, index) => {
    const wanted = banded ? groupBand(item) : null;
    const opening = wanted !== null && wanted !== band;
    const height = rowHeight(doc, item, columns, note);

    if (y + height + (opening ? BAND_HEIGHT : 0) > TABLE_FLOOR) {
      y = headingRow(doc, onPage(), columns, headFill);
      // A page that carries on inside a group repeats whose it is, so a loose
      // page is never anonymous.
      if (banded && wanted) {
        drawBand(doc, y, wanted);
        y += BAND_HEIGHT;
        band = wanted;
      }
    } else if (opening && wanted) {
      drawBand(doc, y, wanted);
      y += BAND_HEIGHT;
      band = wanted;
    }

    drawRow(doc, y, item, columns, index, height, note);
    y += height;
  });

  return y;
}

/** How many pages a block of equipment will take from a given start. */
export function tablePages(
  doc: Doc,
  items: Item[],
  columns: Column[],
  start: number,
): number {
  let pages = 1;
  let y = start + 19;
  for (const item of items) {
    const height = rowHeight(doc, item, columns);
    if (y + height > TABLE_FLOOR) {
      pages += 1;
      y = TABLE_TOP + 19;
    }
    y += height;
  }
  return pages;
}
