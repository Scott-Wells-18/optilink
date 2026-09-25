import PDFDocument from "pdfkit";
import { COMPANY, THERMOGRAPHER } from "@/lib/company";
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
  /** The director's signature, where the app holds one. */
  signature: Buffer | null;
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
  /** The small letterspaced line above the title — what kind of report it is. */
  eyebrow: string;
  /** The line under the client: usually the site address. */
  subtitle: string;
  /** The dated line, shown as the first of the facts. */
  dateLabel: string;
  date: Date;
  /** What the report covered, sized to fit however long the list runs. */
  scope: string;
  /**
   * The same thing as a list rather than a sentence, where it is one: a run of
   * job titles reads as a list of work and not as a paragraph with commas in
   * it. Set both and this wins; `scope` is then what a reader of the file's
   * text sees, so it is still worth setting.
   */
  scopeList?: string[];
  /** The heading over the scope — "Switchboards surveyed", "Works carried out". */
  scopeLabel: string;
  rows: CoverRow[];
  /** The standing note under the facts — who the report is for, and its limits. */
  note: string;
  /** Certification marks, drawn small above the foot. Thermal only. */
  marks: (Buffer | null)[];
};

/**
 * Every report opens the same way, so it is drawn the same way.
 *
 * It reads top to bottom the way a person picking it up does: whose report it
 * is, what it is, who it was done for, what it covered, then the facts and the
 * licences. The page is built off two rules and one card rather than a stack
 * of banded boxes — a report that looks like a form invites being treated like
 * one, and this one is a record of testing.
 */
export function coverPage(doc: Doc, meta: PageMeta, cover: Cover) {
  /* --- masthead: who it is from ------------------------------------------ */
  if (meta.logo) doc.image(meta.logo, MARGIN, 46, { fit: [176, 56] });
  tradingLines(doc, MARGIN + CONTENT - 210, 48, 210);

  doc.rect(MARGIN, 124, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, 123, 64, 2.6).fill(COLOURS.accent);

  /* --- the title --------------------------------------------------------- */
  let y = 156;
  doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(8.5);
  doc.text(cover.eyebrow.toUpperCase(), MARGIN, y, {
    width: CONTENT,
    characterSpacing: 2.2,
  });

  y += 18;
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(25);
  const titleHeight = doc.heightOfString(cover.title, { width: CONTENT - 60 });
  doc.text(cover.title, MARGIN, y, { width: CONTENT - 60, lineGap: 2 });
  y += titleHeight + 6;

  /* --- who it is for ----------------------------------------------------- */
  y += 26;
  label(doc, "Prepared for", MARGIN, y);
  y += 15;
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(18);
  doc.text(meta.clientName, MARGIN, y, { width: CONTENT });
  y += doc.heightOfString(meta.clientName, { width: CONTENT }) + 5;
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLOURS.bar);
  doc.text(meta.siteName, MARGIN, y, { width: CONTENT });
  y += 15;
  if (cover.subtitle && cover.subtitle !== meta.siteName) {
    doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.inkSoft);
    doc.text(cover.subtitle, MARGIN, y, { width: CONTENT });
    y += doc.heightOfString(cover.subtitle, { width: CONTENT }) + 2;
  }

  /* --- what it covered --------------------------------------------------- */
  y += 26;
  doc.font("Helvetica").fontSize(10.5);
  const inset = 18;
  const listed = (cover.scopeList ?? []).slice(0, COVER_LIST_MAX);
  const scopeHeight = listed.length
    ? columnRows(listed.length) * LIST_LINE + 38
    : doc.heightOfString(cover.scope, { width: CONTENT - inset - 20, lineGap: 1.5 }) + 46;
  doc.rect(MARGIN, y, CONTENT, scopeHeight).fill(COLOURS.soft);
  doc.rect(MARGIN, y, 3, scopeHeight).fill(COLOURS.accent);
  label(doc, cover.scopeLabel, MARGIN + inset, y + 14);
  doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(10.5);
  if (listed.length) {
    bulletColumns(doc, listed, MARGIN + inset, y + 28, CONTENT - inset - 20);
  } else {
    doc.text(cover.scope, MARGIN + inset, y + 29, {
      width: CONTENT - inset - 20,
      lineGap: 1.5,
    });
  }
  y += scopeHeight;

  /* --- the facts --------------------------------------------------------- */
  // A card holding thirty lines of work leaves less of the page than a
  // sentence does, so the facts close up behind it.
  y += listed.length ? 24 : 30;
  const facts: CoverRow[] = [[cover.dateLabel, shortDate(cover.date)], ...cover.rows];
  for (const [name, value] of facts) {
    doc.rect(MARGIN, y, CONTENT, 0.6).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9.5);
    doc.text(name, MARGIN, y + 8, { width: 150 });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(10);
    doc.text(value, MARGIN + 156, y + 7.5, { width: CONTENT - 156 });
    y += Math.max(26, doc.heightOfString(value, { width: CONTENT - 156 }) + 16);
  }
  doc.rect(MARGIN, y, CONTENT, 0.6).fill(COLOURS.hair);

  /* --- the foot ---------------------------------------------------------- */
  const marks = cover.marks.filter(Boolean) as Buffer[];
  const footY = PAGE.height - MARGIN - 34;
  if (marks.length) {
    // Right-aligned as a group, in the order they were given.
    let markX = MARGIN + CONTENT - marks.length * 54 - (marks.length - 1) * 8;
    for (const mark of marks.slice(0, 2)) {
      doc.image(mark, markX, footY - 70, { fit: [54, 54] });
      markX += 62;
    }
  }

  // The note sits against the foot rather than under the facts, so a report
  // with a short title leaves its space in the middle of the page — which
  // reads as room to breathe — instead of stranding the page's last line
  // halfway up with nothing beneath it.
  const noteWidth = CONTENT - 120;
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  const noteHeight = doc.heightOfString(cover.note, { width: noteWidth, lineGap: 1.5 });
  const noteY = Math.max(
    y + 12,
    (marks.length ? footY - 86 : footY - 26) - noteHeight,
  );
  doc.text(cover.note, MARGIN, noteY, { width: noteWidth, lineGap: 1.5 });
  doc.rect(MARGIN, footY, CONTENT, 34).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(9);
  doc.text(COMPANY.name, MARGIN + 14, footY + 12, { width: 120 });
  doc.font("Helvetica").fontSize(8.5);
  doc.text(
    `ABN ${COMPANY.abn}   ·   Contractor Licence ${COMPANY.licence}   ·   Qualified Supervisor ${COMPANY.supervisor}`,
    MARGIN + 14,
    footY + 12.5,
    { width: CONTENT - 28, align: "right" },
  );
  doc.fillColor(COLOURS.ink).font("Helvetica");
}

/* --- a list in columns ---------------------------------------------------- */

/**
 * How a list of work is set out: down a column of fifteen, then into the one
 * beside it.
 *
 * Fifteen is what a column of this size holds on the cover without pushing the
 * facts off the bottom of it. A job of more than thirty pieces of work is not
 * cut short — the cover carries the first thirty and the rest go on a page of
 * their own, in the same two columns, for as many pages as it takes.
 */
export const COVER_LIST_ROWS = 15;
export const COVER_LIST_COLUMNS = 2;
export const COVER_LIST_MAX = COVER_LIST_ROWS * COVER_LIST_COLUMNS;
const LIST_LINE = 12.5;
const BULLET_INSET = 11;

/**
 * How deep a column runs for a list of this length.
 *
 * The first column fills to fifteen before the second one is started, rather
 * than the two being balanced against each other: a job of four pieces of work
 * reads as a list of four, not as two beside two.
 */
function columnRows(count: number): number {
  return Math.min(COVER_LIST_ROWS, Math.max(1, count));
}

/** How tall a run of `count` entries is, drawn in columns. */
export function listHeight(count: number): number {
  return columnRows(count) * LIST_LINE;
}

/**
 * The list itself: a bullet, then the line, down one column and into the next.
 *
 * A title longer than its column is cut with an ellipsis rather than wrapped,
 * because a wrapped line would put the two columns out of step with each other
 * and the summary inside the report carries the whole title anyway.
 */
export function bulletColumns(
  doc: Doc,
  lines: string[],
  x: number,
  y: number,
  width: number,
) {
  const rows = columnRows(lines.length);
  const columnWidth = (width - 16) / COVER_LIST_COLUMNS;

  lines.forEach((line, at) => {
    const column = Math.floor(at / rows);
    const left = x + column * (columnWidth + 16);
    const top = y + (at % rows) * LIST_LINE;
    doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(9);
    doc.text("•", left, top + 1, { width: 8, lineBreak: false });
    doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(10);
    doc.text(line, left + BULLET_INSET, top, {
      width: columnWidth - BULLET_INSET,
      height: 12,
      ellipsis: true,
      lineBreak: false,
    });
  });
  doc.fillColor(COLOURS.ink);
}

/** A small letterspaced heading, the one marker of hierarchy on the cover. */
function label(doc: Doc, text: string, x: number, y: number) {
  doc.fillColor(COLOURS.inkSoft).font("Helvetica-Bold").fontSize(8);
  doc.text(text.toUpperCase(), x, y, { characterSpacing: 1.8, lineBreak: false });
  doc.fillColor(COLOURS.ink);
}

/** The trading details, right-aligned beside the logo on a cover. */
function tradingLines(doc: Doc, x: number, y: number, width: number) {
  const lines = [
    COMPANY.addressLine1,
    COMPANY.addressLine2,
    COMPANY.phone,
    COMPANY.email,
  ];
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * 11.5, { width, align: "right" });
  });
  doc.fillColor(COLOURS.ink);
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

/**
 * "Page 5 of 13", stamped once the document knows how long it turned out.
 *
 * `extraPages` covers anything bound on afterwards — the instrument's own
 * export, say — so the count matches the file the client actually opens.
 */
export function stampPageNumbers(doc: Doc, extraPages = 0) {
  const range = doc.bufferedPageRange();
  const total = range.count + extraPages;
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    // A page that has been turned on its side is wider and shorter than the
    // rest, so the number is placed against that page's own edges rather than
    // against the portrait ones.
    const width = doc.page.width - MARGIN * 2;
    doc
      .fillColor(COLOURS.bar)
      .font("Helvetica")
      .fontSize(9)
      .text(`Page ${index + 1} of ${total}`, MARGIN + width - 150, doc.page.height - 49, {
        width: 150,
        align: "right",
      });
    doc.page.margins.bottom = bottom;
  }
}

/**
 * Who signed the report off, above a ruled line.
 *
 * The thermography certificate belongs on a thermographic survey and nowhere
 * else: an RCD test or a record of works is signed as the electrical
 * contractor, under the licence that actually authorises the work.
 */
export function signOff(
  doc: Doc,
  meta: PageMeta,
  y: number,
  options: { thermography?: boolean } = {},
) {
  if (meta.signature) {
    // Sat on the rule rather than above it, the way a pen lands on a form.
    doc.image(meta.signature, MARGIN + 6, y - 34, { fit: [170, 46] });
    doc.rect(MARGIN, y + 12, 200, 0.8).fill(COLOURS.inkSoft);
  } else {
    doc.font("Helvetica").fontSize(11).fillColor(COLOURS.ink);
    doc.text("……………………………………………", MARGIN, y);
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOURS.ink);
  doc.text(THERMOGRAPHER.name, MARGIN, y + 22);
  doc.font("Helvetica").fontSize(10).fillColor(COLOURS.inkSoft);
  if (options.thermography) {
    doc.text(
      `${THERMOGRAPHER.level} - ${THERMOGRAPHER.certificateNumber}`,
      MARGIN,
      y + 38,
    );
  }
  doc
    .fontSize(9.5)
    .text(
      `${COMPANY.name} · Lic ${COMPANY.licence} · Supervisor ${COMPANY.supervisor}`,
      MARGIN,
      y + (options.thermography ? 53 : 38),
    );
  doc.fillColor(COLOURS.ink);
}
