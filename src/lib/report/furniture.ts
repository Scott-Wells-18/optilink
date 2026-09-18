import PDFDocument from "pdfkit";
import { COMPANY, reportBy } from "@/lib/company";
import { COLOURS, CONTENT, MARGIN, PAGE, shortDate } from "@/lib/report/theme";

/**
 * The parts every report is built from — bars, table heads, covers, footers.
 *
 * Written once here rather than copied into each report, so restyling is one
 * edit and a thermal report, a works report and an RCD report cannot drift
 * apart from each other.
 */

export type Doc = PDFKit.PDFDocument;

/** What the furniture needs to know about any report, whatever kind it is. */
export type PageMeta = {
  clientName: string;
  siteName: string;
  siteLocation: string | null;
  logo: Buffer | null;
};

export function newDocument(): { doc: Doc; done: Promise<Buffer> } {
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
  return { doc, done };
}

/* --- bars and tables ------------------------------------------------------ */

/** A full-width heading bar, the thing that opens every section. */
export function sectionBar(doc: Doc, title: string, y: number) {
  doc.rect(MARGIN, y, CONTENT, 22).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(10.5).text(title, MARGIN + 10, y + 7);
  doc.fillColor(COLOURS.ink);
}

/** A narrower bar, for the panels that sit side by side within a section. */
export function bar(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  title: string,
  align: "left" | "center" = "left",
  colour: string = COLOURS.bar,
) {
  doc.rect(x, y, width, 19).fill(colour);
  doc
    .fillColor(COLOURS.onBar)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(title, align === "center" ? x : x + 8, y + 5.5, {
      width: align === "center" ? width : width - 16,
      align,
    });
  doc.fillColor(COLOURS.ink);
}

export function tableHead(doc: Doc, y: number, titles: string[], columns: number[]) {
  doc.rect(MARGIN, y, CONTENT, 20).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(9.5);
  let x = MARGIN;
  titles.forEach((title, index) => {
    const centred = index > 0 && columns[index] < 140;
    doc.text(title, centred ? x : x + 8, y + 6, {
      width: centred ? columns[index] : columns[index] - 12,
      align: centred ? "center" : "left",
    });
    x += columns[index];
  });
  doc.fillColor(COLOURS.ink);
}

/** A coloured pill — a priority, a verdict, anything that has to be seen. */
export function chip(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  fill: string,
  ink: string,
) {
  doc.rect(x, y, width, height).fill(fill);
  doc
    .fillColor(ink)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(text, x, y + height / 2 - 5, { width, align: "center" });
  doc.fillColor(COLOURS.ink);
}

/* --- the cover ------------------------------------------------------------ */

export type CoverRow = [string, string];

export type Cover = {
  /** "Thermographic and Preventive Maintenance Report" */
  title: string;
  /** The line under the client: usually the site address. */
  subtitle: string;
  /** The dated line above the scope block. */
  dateLabel: string;
  date: Date;
  /** What the report covered, sized to fit however long the list runs. */
  scope: string;
  rows: CoverRow[];
  /** Certification marks, drawn along the foot of the cover. */
  marks: (Buffer | null)[];
};

/**
 * Every report opens the same way, so it is drawn the same way: the logo, the
 * title block, what the job covered, who it is for and who we are.
 */
export function coverPage(doc: Doc, meta: PageMeta, cover: Cover) {
  if (meta.logo) {
    doc.image(meta.logo, MARGIN + 100, 46, { fit: [CONTENT - 200, 92], align: "center" });
  }

  let y = 178;
  const titleHeight = 128;
  doc.rect(MARGIN, y, CONTENT, titleHeight).fillAndStroke(COLOURS.band, COLOURS.bar);
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(17);
  doc.text(cover.title, MARGIN + 18, y + 16, { width: CONTENT - 36, align: "center" });
  doc.font("Helvetica").fontSize(10);
  doc.text("For", MARGIN, y + 42, { width: CONTENT, align: "center" });
  doc.font("Helvetica-Bold").fontSize(15);
  doc.text(meta.clientName, MARGIN + 18, y + 60, { width: CONTENT - 36, align: "center" });
  doc.fontSize(10.5);
  doc.text(cover.subtitle, MARGIN + 18, y + 88, { width: CONTENT - 36, align: "center" });

  y += titleHeight + 34;
  doc.font("Helvetica-Oblique").fontSize(10).fillColor(COLOURS.ink);
  doc.text(cover.dateLabel, MARGIN, y, { width: CONTENT, align: "center" });
  doc.font("Helvetica-Bold").fontSize(10.5);
  doc.text(shortDate(cover.date), MARGIN, y + 15, { width: CONTENT, align: "center" });

  // The scope grows with the site, so the block sizes itself to the list.
  y += 48;
  doc.font("Helvetica-Bold").fontSize(12.5);
  const scopeHeight = Math.max(
    50,
    doc.heightOfString(cover.scope, { width: CONTENT - 36, align: "center" }) + 26,
  );
  doc.rect(MARGIN, y, CONTENT, scopeHeight).fillAndStroke(COLOURS.band, COLOURS.bar);
  doc.fillColor(COLOURS.ink).text(cover.scope, MARGIN + 18, y + 13, {
    width: CONTENT - 36,
    align: "center",
  });

  y += scopeHeight + 40;
  doc.fontSize(10);
  cover.rows.forEach(([label, value], index) => {
    const rowY = y + index * 30;
    doc.font("Helvetica").fillColor(COLOURS.ink).text(label, MARGIN, rowY, { width: 120 });
    doc.text(value, MARGIN + 130, rowY, { width: 250 });
  });

  companyBlock(doc, MARGIN + CONTENT - 190, y, 190);

  const marks = cover.marks.filter(Boolean) as Buffer[];
  const markY = y + 162;
  if (marks[0]) doc.image(marks[0], MARGIN + 10, markY, { fit: [112, 112] });
  if (marks[1]) doc.image(marks[1], MARGIN + CONTENT - 122, markY, { fit: [112, 112] });
}

/**
 * Who we are, in the top right of every cover: the trading details, and the
 * licence and supervisor numbers a client or an inspector will look for.
 */
export function companyBlock(doc: Doc, x: number, y: number, width: number) {
  const lines: [string, boolean][] = [
    [COMPANY.name, true],
    [`ABN: ${COMPANY.abn}`, false],
    [`Lic: ${COMPANY.licence}`, false],
    [`Supervisor: ${COMPANY.supervisor}`, false],
    ["", false],
    [COMPANY.addressLine1, false],
    [COMPANY.addressLine2, false],
    ["", false],
    [`P: ${COMPANY.phone}`, false],
    [COMPANY.email, false],
  ];
  doc.fontSize(9.5).fillColor(COLOURS.ink);
  lines.forEach(([line, bold], index) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
    doc.text(line, x, y + index * 12.5, { width, align: "center" });
  });
  doc.font("Helvetica").fillColor(COLOURS.ink);
}

/* --- page furniture ------------------------------------------------------- */

/**
 * Drawn at the very foot of the page, below where text is allowed to flow —
 * so the bottom margin is lifted for the duration, otherwise pdfkit reads the
 * last line as an overflow and starts a fresh page for it.
 */
export function footer(doc: Doc, meta: PageMeta) {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const y = PAGE.height - 56;
  if (meta.logo) doc.image(meta.logo, MARGIN, y - 2, { fit: [92, 28] });
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(9.5);
  doc.text(meta.clientName, MARGIN + 110, y, { width: CONTENT - 220, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text(meta.siteLocation || meta.siteName, MARGIN + 110, y + 13, {
    width: CONTENT - 220,
    align: "center",
  });

  doc.page.margins.bottom = bottom;
  doc.fillColor(COLOURS.ink);
}

/** "Page 5 of 13", stamped once the document knows how long it turned out. */
export function stampPageNumbers(doc: Doc) {
  const range = doc.bufferedPageRange();
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(COLOURS.bar)
      .font("Helvetica")
      .fontSize(9)
      .text(`Page ${index + 1} of ${range.count}`, MARGIN + CONTENT - 150, PAGE.height - 49, {
        width: 150,
        align: "right",
      });
    doc.page.margins.bottom = bottom;
  }
}

/** Who signed the report off, above a ruled line. */
export function signOff(doc: Doc, y: number) {
  doc.font("Helvetica").fontSize(11).fillColor(COLOURS.ink);
  doc.text("……………………………………………", MARGIN, y);
  const [name, rest] = reportBy().split(" (");
  doc.font("Helvetica-Bold").fontSize(11).text(name, MARGIN, y + 22);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLOURS.inkSoft)
    .text(rest ? rest.replace(/\)$/, "") : "", MARGIN, y + 38);
  doc
    .fontSize(9.5)
    .text(
      `${COMPANY.name} · Lic ${COMPANY.licence} · Supervisor ${COMPANY.supervisor}`,
      MARGIN,
      y + 53,
    );
  doc.fillColor(COLOURS.ink);
}
