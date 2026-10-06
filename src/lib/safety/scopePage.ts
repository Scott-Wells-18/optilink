import PDFDocument from "pdfkit";
import { guarded } from "@/lib/report/furniture";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { COLOURS } from "@/lib/report/theme";
import type { RichText } from "@/lib/richText";

/**
 * The scope of works, as a page.
 *
 * Every SWMS and JSA in the library was written to be used on any job, so none
 * of them says what *this* job is. That page is added here, in front of the
 * document's own pages and never instead of them: the released pages are
 * untouched behind it, and this one carries the words the electrician wrote
 * about the work, with the paragraphs, dot points, bold and italics they used.
 *
 * It is drawn at the page size of the document it belongs to, so a landscape
 * SWMS gets a landscape scope page and nothing has to be scaled to fit. The
 * furniture is the released documents' own: the identifier in blue at the top
 * left, the title under it, the logo at the top right, a dark section bar, and
 * the same footer line.
 */

export type ScopeFacts = {
  /** "OEC-SWMS014" — the document this page belongs in front of. */
  code: string;
  /** The document's own printed title. */
  title: string;
  clientName: string;
  siteName: string;
  siteAddress: string;
  projectName: string;
  jobNumber: string;
  contactName: string;
  contactNumber: string;
  /** The date on the paperwork. */
  date: string;
  /** When the assessment was actually carried out, where it has been. */
  assessed: string;
};

export type ScopeValues = { facts: ScopeFacts; scope: RichText };

const BODY = 9.5;
const LEADING = 1.35;

export async function scopePage(
  size: { width: number; height: number },
  values: ScopeValues,
): Promise<Buffer> {
  const margin = Math.round(size.width * 0.085);
  // No margins of pdfkit's own: everything here is placed by hand, and a
  // bottom margin would turn the footer into a second, empty page.
  const doc = guarded(
    new PDFDocument({
      size: [size.width, size.height],
      margins: { top: 0, left: 0, right: 0, bottom: 0 },
      autoFirstPage: true,
    }),
  );
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const width = size.width - margin * 2;
  const { facts, scope } = values;

  /* --- the head, as the released pages print it ------------------------- */
  doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(17);
  doc.text(facts.code, margin, margin, { width, lineBreak: false });
  doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(11);
  doc.text(facts.title.toUpperCase(), margin, margin + 22, { width: width - 130 });

  const logo = await brand("logo.jpg");
  if (logo) {
    try {
      doc.image(logo, size.width - margin - 118, margin - 4, { fit: [118, 40], align: "right" });
    } catch {
      // A missing or unreadable logo is not a reason to withhold the page.
    }
  }

  let y = Math.max(doc.y, margin + 44) + 14;

  /* --- what the job is --------------------------------------------------- */
  y = bar(doc, "SCOPE OF WORKS", margin, y, width);

  const facts2 = [
    ["Client", facts.clientName],
    ["Site", [facts.siteName, facts.siteAddress].filter(Boolean).join(" · ")],
    ["Project", facts.projectName],
    ["Job number", facts.jobNumber],
    ["Site contact", [facts.contactName, facts.contactNumber].filter(Boolean).join(" · ")],
    ["Issued", facts.date],
    ["Assessment carried out", facts.assessed],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  y = table(doc, facts2, margin, y + 10, width);

  /* --- the scope itself --------------------------------------------------- */
  y += 16;
  doc.fillColor(COLOURS.inkSoft).font("Helvetica-Bold").fontSize(7.5);
  doc.text("THE WORK THIS DOCUMENT COVERS", margin, y, { width, characterSpacing: 0.6 });
  y = doc.y + 6;
  doc
    .moveTo(margin, y)
    .lineTo(margin + width, y)
    .lineWidth(0.7)
    .strokeColor(COLOURS.accent)
    .stroke();
  y += 10;

  const bottom = size.height - margin - 26;
  y = writeScope(doc, scope, margin, y, width, bottom);

  /* --- the footer the other pages have ------------------------------------ */
  const footer = size.height - margin - 8;
  doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(7);
  doc.text(`${facts.code} ${facts.title.toUpperCase()}`, margin, footer, {
    width: width - 90,
    lineBreak: false,
  });
  doc.text("Scope of works", margin + width - 90, footer, { width: 90, align: "right" });

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/** A section bar in the documents' own style. */
function bar(doc: PDFKit.PDFDocument, label: string, x: number, y: number, width: number): number {
  const height = 19;
  doc.rect(x, y, width, height).fill("#4b5563");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
  doc.text(label, x, y + 5.5, { width, align: "center", characterSpacing: 0.7 });
  return y + height;
}

/** The job's own details, two to a row where the page is wide enough. */
function table(
  doc: PDFKit.PDFDocument,
  rows: [string, string][],
  x: number,
  y: number,
  width: number,
): number {
  const columns = width > 620 ? 2 : 1;
  const columnWidth = (width - (columns - 1) * 14) / columns;
  const labelWidth = Math.min(120, columnWidth * 0.32);
  let top = y;
  let tallest = 0;

  rows.forEach((row, index) => {
    const column = index % columns;
    if (column === 0 && index > 0) {
      top += tallest + 6;
      tallest = 0;
    }
    const left = x + column * (columnWidth + 14);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(8);
    doc.text(row[0], left, top, { width: labelWidth });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9);
    doc.text(row[1], left + labelWidth + 6, top - 0.5, { width: columnWidth - labelWidth - 6 });
    tallest = Math.max(tallest, doc.y - top);
  });

  return top + tallest;
}

/**
 * The words, with the formatting they were written with.
 *
 * pdfkit sets a run at a time, so a paragraph is drawn run by run with the
 * font swapped between them and `continued` keeping them on one line until the
 * text itself decides to wrap. A dot point gets a bullet in the margin and its
 * text indented, so a wrapped line lines up under the first one rather than
 * under the dot.
 */
function writeScope(
  doc: PDFKit.PDFDocument,
  blocks: RichText,
  x: number,
  y: number,
  width: number,
  bottom: number,
): number {
  let top = y;
  // Where a scope runs past the foot of the page it carries on overleaf, and
  // the document's own pages still follow it.
  if (blocks.length === 0) {
    doc.fillColor(COLOURS.inkSoft).font("Helvetica-Oblique").fontSize(BODY);
    doc.text("No scope of works was entered for this job.", x, top, { width });
    return doc.y;
  }

  for (const block of blocks) {
    const indent = block.kind === "li" ? 16 : 0;
    const runs = block.runs.filter((run) => run.text.length > 0);

    if (top > bottom - BODY * LEADING) {
      // A scope longer than the page carries on overleaf; the document's own
      // pages still follow it.
      doc.addPage();
      top = y;
    }

    if (runs.length === 0) {
      top += BODY * LEADING * 0.6;
      continue;
    }

    if (block.kind === "li") {
      doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(BODY);
      doc.text("•", x + 4, top, { width: 10, lineBreak: false });
    }

    doc.fillColor(COLOURS.ink);
    runs.forEach((run, index) => {
      doc.font(fontFor(run)).fontSize(BODY);
      doc.text(run.text, index === 0 ? x + indent : doc.x, index === 0 ? top : doc.y, {
        width: width - indent,
        continued: index < runs.length - 1,
        lineGap: BODY * (LEADING - 1),
      });
    });
    top = doc.y + 3;
  }

  return top;
}

function fontFor(run: Run): string {
  if (run.bold && run.italic) return "Helvetica-BoldOblique";
  if (run.bold) return "Helvetica-Bold";
  if (run.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

type Run = RichText[number]["runs"][number];

async function brand(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}
