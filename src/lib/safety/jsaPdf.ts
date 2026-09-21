import PDFDocument from "pdfkit";
import { COMPANY } from "@/lib/company";
import { COLOURS, safe } from "@/lib/report/theme";
import type { Cell, Jsa, Row } from "@/lib/safety/readJsa";
import type { Hazard } from "@/lib/safety/hazards";
import { RATINGS } from "@/lib/safety/hazards";

/**
 * A JSA as a PDF.
 *
 * The company's JSAs were written in Word and a Word file is not what anyone
 * wants emailed to them alongside a SWMS — so the document is read out of the
 * .docx and drawn here instead: the same words, the same risk ratings, the
 * same cell colours and the same column proportions, on the landscape page it
 * was laid out for.
 *
 * Nothing is reworded. Every row on the page came out of their document except
 * the ones a job added, and those are drawn from a fixed library and marked so
 * they can be seen at a glance before anyone signs.
 */

const PAGE = { width: 841.89, height: 595.28 };
const MARGIN = 26;
const CONTENT = PAGE.width - MARGIN * 2;

export type JsaFacts = {
  clientName: string;
  siteName: string;
  siteAddress: string;
  projectName: string;
  projectManager: string;
  contactNumber: string;
  date: string;
  /** The job written out, from the quote and the answers together. */
  description: string;
  code: string;
};

export type JsaSignatory = {
  name: string;
  position: string;
  date: string;
  signature?: Buffer;
};

export async function renderJsaPdf(
  jsa: Jsa,
  facts: JsaFacts,
  signatories: JsaSignatory[],
  added: Hazard[],
  logo: Buffer | null,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margin: MARGIN,
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  let y = heading(doc, jsa, facts, logo);
  y = jobBlock(doc, facts, y);
  y = legend(doc, jsa.intro, y);
  y = riskTable(doc, jsa, added, y, facts, logo);
  signatories_(doc, jsa, signatories, y, facts, logo);

  stampPages(doc, facts);
  doc.end();
  return done;
}

/* --- the furniture -------------------------------------------------------- */

function heading(doc: Doc, jsa: Jsa, facts: JsaFacts, logo: Buffer | null): number {
  if (logo) doc.image(logo, MARGIN, 20, { fit: [128, 40] });

  doc.font("Helvetica-Bold").fontSize(15).fillColor(COLOURS.bar);
  doc.text(`OEC-${facts.code}`, MARGIN + 144, 24, { width: CONTENT - 144 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOURS.ink);
  doc.text(safe(jsa.title), MARGIN + 144, 42, { width: CONTENT - 144 });

  doc.rect(MARGIN, 68, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, 67, 54, 2.4).fill(COLOURS.accent);
  return 82;
}

/** Who it is for and what the job is — the part the Word document leaves blank. */
function jobBlock(doc: Doc, facts: JsaFacts, top: number): number {
  const pairs: [string, string][] = [
    ["Client", facts.clientName],
    ["Site", [facts.siteName, facts.siteAddress].filter(Boolean).join(" — ")],
    ["Project", facts.projectName],
    ["Project manager", facts.projectManager || "—"],
    ["Contact", facts.contactNumber || "—"],
    ["Date", facts.date],
  ];

  const columns = 3;
  const width = CONTENT / columns;
  let y = top;
  pairs.forEach(([label, value], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = MARGIN + column * width;
    const at = top + row * 26;
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLOURS.inkSoft);
    doc.text(label.toUpperCase(), x, at, { characterSpacing: 1.4, lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(safe(value) || "—", x, at + 10, { width: width - 14, height: 11, ellipsis: true });
    y = Math.max(y, at + 26);
  });

  if (facts.description.trim()) {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLOURS.inkSoft);
    doc.text("SCOPE OF WORKS", MARGIN, y, { characterSpacing: 1.4, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.ink);
    const text = safe(facts.description);
    const height = doc.heightOfString(text, { width: CONTENT, lineGap: 1 });
    doc.text(text, MARGIN, y + 10, { width: CONTENT, lineGap: 1 });
    y += 12 + height;
  }

  return y + 10;
}

/**
 * The coding legend, as the document has it.
 *
 * Laid across the page rather than down it — the Word version stacks fourteen
 * rows of three cells, which on a landscape page is a column of air.
 */
function legend(doc: Doc, intro: Row[], top: number): number {
  const entries = intro.filter((row) => row.cells.length === 3);
  if (entries.length === 0) return top;

  const groups: { title: string; rows: Row[] }[] = [];
  for (const row of intro) {
    if (row.cells.length === 1) {
      const title = row.cells[0].text.replace(/:$/, "");
      if (/legend/i.test(title)) continue;
      groups.push({ title, rows: [] });
      continue;
    }
    if (row.cells.length === 3 && groups.length > 0) groups[groups.length - 1].rows.push(row);
  }
  if (groups.length === 0) return top;

  const width = CONTENT / groups.length - 8;
  let bottom = top;

  groups.forEach((group, index) => {
    const x = MARGIN + index * (width + 12);
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLOURS.inkSoft);
    doc.text(group.title.toUpperCase(), x, top, { characterSpacing: 1.4, lineBreak: false });

    let y = top + 12;
    for (const row of group.rows) {
      const [name, , meaning] = row.cells;
      const swatch = row.cells[1]?.fill ?? "#e6edf3";
      doc.roundedRect(x, y, 9, 9, 2).fill(swatch);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.ink);
      doc.text(safe(name.text), x + 14, y, { width: 54, lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(COLOURS.inkSoft);
      const text = safe(meaning.text);
      const height = doc.heightOfString(text, { width: width - 72 });
      doc.text(text, x + 70, y, { width: width - 72 });
      y += Math.max(13, height + 4);
    }
    bottom = Math.max(bottom, y);
  });

  return bottom + 10;
}

/* --- the risk table ------------------------------------------------------- */

const ROW_PAD = 4;
const FOOT = 34;

function riskTable(
  doc: Doc,
  jsa: Jsa,
  added: Hazard[],
  top: number,
  facts: JsaFacts,
  logo: Buffer | null,
): number {
  const columns = widths(jsa.headings);
  const rows: { cells: Cell[]; added: boolean }[] = [
    ...jsa.tasks.map((row) => ({ cells: row.cells, added: false })),
    ...added.map((hazard) => ({ cells: hazardCells(hazard, jsa.headings), added: true })),
  ];

  let y = top;
  y = tableHead(doc, jsa.headings, columns, y);

  for (const row of rows) {
    const height = rowHeight(doc, row.cells, columns);
    if (y + height > PAGE.height - FOOT) {
      doc.addPage();
      y = heading(doc, jsa, facts, logo);
      y = tableHead(doc, jsa.headings, columns, y);
    }
    drawRow(doc, row.cells, columns, y, height, row.added);
    y += height;
  }

  if (added.length > 0) {
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(
      `The ${added.length === 1 ? "row" : `${added.length} rows`} marked with a blue edge ${
        added.length === 1 ? "was" : "were"
      } added for this job. Read ${added.length === 1 ? "it" : "them"} before signing.`,
      MARGIN,
      y + 5,
      { width: CONTENT },
    );
    y += 20;
  }

  return y + 8;
}

function tableHead(doc: Doc, headings: Cell[], columns: number[], y: number): number {
  const height = 22;
  doc.rect(MARGIN, y, CONTENT, height).fill(COLOURS.bar);
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.onBar);
  let x = MARGIN;
  headings.forEach((cell, index) => {
    doc.text(safe(cell.text), x + 3, y + 6, {
      width: columns[index] - 6,
      align: "center",
      lineGap: -1,
    });
    x += columns[index];
  });
  doc.fillColor(COLOURS.ink);
  return y + height;
}

function drawRow(
  doc: Doc,
  cells: Cell[],
  columns: number[],
  y: number,
  height: number,
  added: boolean,
) {
  doc.rect(MARGIN, y, CONTENT, height).fillAndStroke("#ffffff", COLOURS.hair);

  let x = MARGIN;
  cells.forEach((cell, index) => {
    const width = columns[index];
    if (cell.fill) {
      doc.rect(x, y, width, height).fillAndStroke(cell.fill, COLOURS.hair);
    }
    const text = safe(cell.text);
    doc.font(cell.fill ? "Helvetica-Bold" : "Helvetica").fontSize(7);
    doc.fillColor(cell.fill ? onFill(cell.fill) : COLOURS.ink);
    doc.text(text, x + 3, y + ROW_PAD, {
      width: width - 6,
      align: cell.fill ? "center" : "left",
      lineGap: 0.5,
    });
    x += width;
  });

  // A row this job brought with it, marked down its leading edge.
  if (added) doc.rect(MARGIN, y, 2.5, height).fill(COLOURS.accent);
  doc.fillColor(COLOURS.ink);
}

function rowHeight(doc: Doc, cells: Cell[], columns: number[]): number {
  let tallest = 16;
  cells.forEach((cell, index) => {
    doc.font(cell.fill ? "Helvetica-Bold" : "Helvetica").fontSize(7);
    const height = doc.heightOfString(safe(cell.text), {
      width: columns[index] - 6,
      lineGap: 0.5,
    });
    tallest = Math.max(tallest, height + ROW_PAD * 2);
  });
  return tallest;
}

/** The document's own column proportions, scaled to the page. */
function widths(headings: Cell[]): number[] {
  const total = headings.reduce((sum, cell) => sum + cell.width, 0) || 1;
  const out = headings.map((cell) => (cell.width / total) * CONTENT);
  // Rounding leaves a hair of the page unused; the widest column absorbs it.
  const drift = CONTENT - out.reduce((sum, width) => sum + width, 0);
  const widest = out.indexOf(Math.max(...out));
  out[widest] += drift;
  return out;
}

/** One added hazard, as cells the table can draw. */
function hazardCells(hazard: Hazard, headings: Cell[]): Cell[] {
  const ratings = RATINGS[hazard.rating];
  const values = [
    hazard.task,
    hazard.hazard,
    hazard.who,
    ratings[0],
    ratings[1],
    ratings[2],
    hazard.controls,
    ratings[3],
    ratings[4],
    ratings[5],
  ];
  // The shading comes off whichever heading column it is, matched by the words
  // themselves — the document's own palette, not one invented here.
  return values.map((text, index) => ({
    text,
    fill: RATING_COLUMNS.has(index) ? colourFor(text) : null,
    width: headings[index]?.width ?? 1000,
    bold: false,
  }));
}

const RATING_COLUMNS = new Set([3, 4, 5, 7, 8, 9]);

const PALETTE: Record<string, string> = {
  minor: "#00B050",
  moderate: "#FFC000",
  major: "#FFC000",
  severe: "#FF0000",
  unlikely: "#00B050",
  possible: "#FFFF00",
  likely: "#FFC000",
  low: "#00B050",
  medium: "#FFFF00",
  high: "#FF0000",
};

function colourFor(word: string): string | null {
  return PALETTE[word.trim().toLowerCase()] ?? null;
}

/** Black on yellow, white on red — whichever the fill can actually carry. */
function onFill(fill: string): string {
  const hex = fill.replace("#", "");
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 150 ? "#111111" : "#ffffff";
}

/* --- who signed it -------------------------------------------------------- */

function signatories_(
  doc: Doc,
  jsa: Jsa,
  people: JsaSignatory[],
  top: number,
  facts: JsaFacts,
  logo: Buffer | null,
) {
  const blocks = Math.max(jsa.signatoryCount, people.length);
  const needed = 44 + blocks * 46;
  let y = top;
  if (y + needed > PAGE.height - FOOT) {
    doc.addPage();
    y = heading(doc, jsa, facts, logo);
  }

  doc.rect(MARGIN, y, CONTENT, 20).fill(COLOURS.bar);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.onBar);
  doc.text("SIGNATORIES OF THE JSA RISK ASSESSMENT", MARGIN + 8, y + 6, {
    characterSpacing: 1,
  });
  y += 24;

  if (jsa.signatoryNote) {
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    const text = safe(jsa.signatoryNote);
    doc.text(text, MARGIN, y, { width: CONTENT });
    y += doc.heightOfString(text, { width: CONTENT }) + 8;
  }

  const width = CONTENT / 2 - 10;
  for (let index = 0; index < blocks; index += 1) {
    const who = people[index];
    const x = MARGIN + (index % 2) * (width + 20);
    const at = y + Math.floor(index / 2) * 56;

    doc.rect(x, at, width, 48).fillAndStroke(COLOURS.soft, COLOURS.hair);
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLOURS.inkSoft);
    doc.text("FULL NAME", x + 8, at + 6, { characterSpacing: 1.2, lineBreak: false });
    doc.text("POSITION", x + 8, at + 27, { characterSpacing: 1.2, lineBreak: false });
    doc.text("DATE", x + width / 2 + 8, at + 27, { characterSpacing: 1.2, lineBreak: false });
    doc.text("SIGNATURE", x + width / 2 + 8, at + 6, { characterSpacing: 1.2, lineBreak: false });

    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
    doc.text(safe(who?.name ?? ""), x + 8, at + 14, {
      width: width / 2 - 14,
      height: 11,
      ellipsis: true,
    });
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(safe(who?.position ?? ""), x + 8, at + 35, {
      width: width / 2 - 14,
      height: 10,
      ellipsis: true,
    });
    doc.text(who?.date ?? "", x + width / 2 + 8, at + 35, { width: width / 2 - 14 });

    if (who?.signature) {
      // Sized to the gap between its own label and the date's, so a tall
      // signature cannot come down on top of the word underneath it.
      doc.image(who.signature, x + width / 2 + 8, at + 11, { fit: [width / 2 - 20, 14] });
    } else {
      doc.rect(x + width / 2 + 8, at + 30, width / 2 - 20, 0.6).fill(COLOURS.hair);
    }
    doc.fillColor(COLOURS.ink);
  }
}

/** The same footer the Word document carries, and a page count. */
function stampPages(doc: Doc, facts: JsaFacts) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE.height - 22;
    doc.font("Helvetica").fontSize(7).fillColor(COLOURS.inkSoft);
    doc.text(
      `OEC-${facts.code}  ·  ${safe(facts.clientName)}  ·  ${safe(facts.siteName)}`,
      MARGIN,
      y,
      { width: CONTENT - 120 },
    );
    doc.text(`Page ${index + 1} of ${range.count}`, MARGIN + CONTENT - 120, y, {
      width: 120,
      align: "right",
    });
    doc.text(
      `${COMPANY.name} · Lic ${COMPANY.licence} · Supervisor ${COMPANY.supervisor}`,
      MARGIN,
      y + 9,
      { width: CONTENT },
    );
    doc.page.margins.bottom = bottom;
  }
}

type Doc = PDFKit.PDFDocument;
