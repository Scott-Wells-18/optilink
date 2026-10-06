import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { COMPANY, THERMOGRAPHER } from "@/lib/company";
import type { Signatory } from "@/lib/profiles.server";
import { COLOURS, CONTENT, MARGIN, PAGE, safe, shortDate } from "@/lib/report/theme";

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
  /** Who the report is prepared by, with their marks already read. */
  preparedBy: Signatory[];
};

/**
 * Make every word that reaches a page fit to be drawn on one.
 *
 * `safe` folds the characters Helvetica cannot carry down to ones it can, and
 * it was being called at the call sites — which is to say, at a hundred and
 * sixty of them, correctly at most. The one it was missed at printed an
 * insulation resistance of "> 200 MΩ" as "> 200 M:•", which is the headline
 * value of the report it was on.
 *
 * So it is done here instead, once, where every report's text goes through.
 * A call site may still pass `safe(...)` and nothing changes: folding text
 * that is already folded leaves it as it is.
 */
const RAW = Symbol.for("optilink.report.rawText");

function guard(doc: Doc): Doc {
  const draw = doc.text.bind(doc);
  // Kept so the few places that embed a font able to carry the real character
  // can reach past the fold. See `ohmText`.
  (doc as Doc & { [RAW]?: typeof draw })[RAW] = draw;
  doc.text = ((text: unknown, ...rest: unknown[]) =>
    draw(
      typeof text === "string" ? safe(text) : (text as string),
      ...(rest as []),
    )) as typeof doc.text;
  return doc;
}

export function newDocument(): { doc: Doc; done: Promise<Buffer> } {
  const doc = guard(
    new PDFDocument({
      size: [PAGE.width, PAGE.height],
      margin: MARGIN,
      bufferPages: true,
    }),
  );
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return { doc, done };
}

/**
 * The same guard, for a report that makes its own document.
 *
 * The landscape reports and the gate report set their own page size, so they
 * do not come through `newDocument`. They still draw the same text.
 */
export function guarded(doc: Doc): Doc {
  return guard(doc);
}

/* --- bars and tables ------------------------------------------------------ */

/** A full-width heading bar, the thing that opens every section. */
export function sectionBar(
  doc: Doc,
  title: string,
  y: number,
  // A report on its side has a wider page than the portrait default, and a bar
  // that stops two thirds of the way across it looks like a mistake.
  span: { x: number; width: number } = { x: MARGIN, width: CONTENT },
) {
  doc.rect(span.x, y, span.width, 22).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(10.5).text(title, span.x + 10, y + 7);
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

export function tableHead(
  doc: Doc,
  y: number,
  titles: string[],
  columns: number[],
  left = MARGIN,
) {
  // As wide as the columns it heads, rather than as wide as a portrait page:
  // the bar and the table under it are then the same table.
  const width = columns.reduce((total, column) => total + column, 0);
  doc.rect(left, y, width, 20).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(9.5);
  let x = left;
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
  if (meta.logo) doc.image(meta.logo, MARGIN, 44, { fit: [176, 56] });
  const masthead = mastheadLines(doc, MARGIN + CONTENT - 250, 42, 250);

  // Under whichever is taller, the logo or the block beside it.
  const rule = Math.max(masthead + 10, 118);
  doc.rect(MARGIN, rule, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, rule - 1, 64, 2.6).fill(COLOURS.accent);

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
  // Where the foot bar used to be. The company's numbers are in the masthead
  // now; repeating them along the bottom said the same thing twice and left
  // the licence of a company where a reader looks for the licence of a person.
  const footY = PAGE.height - MARGIN - 20;
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
  const noteY = Math.max(y + 12, (marks.length ? footY - 86 : footY) - noteHeight);
  doc.text(cover.note, MARGIN, noteY, { width: noteWidth, lineGap: 1.5 });
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

/**
 * Who the report is from, right-aligned beside the logo on a cover.
 *
 * The entity that trades as Optilink goes above the address, in italics,
 * because that is the name on the contract and the invoice even though nobody
 * says it out loud. The ABN and the contractor licence close the block: they
 * belong to the company rather than to whoever prepared the report, and this
 * is the one place on the report that says them.
 *
 * Returns where it finished, so the rule under it can be drawn against the
 * block rather than at a guessed offset.
 */
export function mastheadLines(doc: Doc, x: number, y: number, width: number): number {
  let at = y;

  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOURS.inkSoft);
  doc.text(COMPANY.legalName, x, at, { width, align: "right", lineGap: 0.5 });
  at = doc.y + 3;

  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  for (const line of [COMPANY.addressLine1, COMPANY.addressLine2, COMPANY.phone, COMPANY.email]) {
    doc.text(line, x, at, { width, align: "right" });
    at += 11.5;
  }

  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(`ABN ${COMPANY.abn}   \u00b7   Contractor Licence ${COMPANY.licence}`, x, at + 1.5, {
    width,
    align: "right",
  });
  at += 13;

  doc.fillColor(COLOURS.ink);
  return at;
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
 * The foot of every page of a landscape report.
 *
 * The same foot the portrait reports carry — the logo, who the report is for
 * and where — with the page number on the right. It is stamped in one pass at
 * the end rather than drawn page by page, because a landscape report only
 * knows how many pages it ran to once it has finished.
 */
export function stampWideFeet(
  doc: Doc,
  meta: PageMeta,
  page: { width: number; height: number; margin: number },
) {
  const range = doc.bufferedPageRange();

  // From page two: a cover carries its own details at the top of it.
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    /*
     * Each page's own size, not the report's.
     *
     * A report can turn a page on its side — the installation report is
     * landscape and binds its instrument, its calibration certificate and the
     * tester's own export in portrait — and a foot stamped at the width of the
     * wrong orientation lands off the paper. The argument is the fallback for
     * a page that has not been switched to yet.
     */
    const sheetWidth = doc.page?.width ?? page.width;
    const sheetHeight = doc.page?.height ?? page.height;
    // Its own margin as well as its own size: an upright page bound into a
    // landscape report is set in further, and a foot measured off the wider
    // page's margin reaches past the narrower page's.
    const margin = doc.page?.margins?.left || page.margin;
    const content = sheetWidth - margin * 2;

    const y = sheetHeight - 44;
    if (meta.logo) doc.image(meta.logo, margin, y - 3, { fit: [84, 26] });

    const middle = margin + 100;
    const width = content - 240;
    doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(9);
    doc.text(safe(meta.clientName), middle, y, { width, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(meta.siteLocation || meta.siteName), middle, y + 12, {
      width,
      align: "center",
      lineBreak: false,
    });
    doc.text(`Page ${index + 1} of ${range.count}`, margin + content - 140, y + 6, {
      width: 140,
      align: "right",
    });

    doc.page.margins.bottom = bottom;
  }
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
  signOffBlock(doc, meta.preparedBy, MARGIN, y, CONTENT, options);
}

/**
 * Who put their name to this, with their mark above it.
 *
 * However many people were named, side by side: a job carried out by an
 * electrician and an apprentice is signed by both of them, and each one is
 * named for what they are. Nobody is given a credential they do not hold —
 * an apprentice signs as an apprentice, with no licence number under their
 * name, because they do not have one and the report must not imply they do.
 *
 * Nobody named at all leaves the ruled line the reports have always printed,
 * which is a document waiting for a pen rather than a broken one.
 */
export function signOffBlock(
  doc: Doc,
  people: Signatory[],
  x: number,
  y: number,
  width: number,
  options: { thermography?: boolean } = {},
): number {
  const listed = people.length > 0 ? people.slice(0, 3) : [null];
  const gap = 24;
  const column = Math.min(260, (width - gap * (listed.length - 1)) / listed.length);

  listed.forEach((person, index) => {
    const left = x + index * (column + gap);

    if (person?.signature) {
      // Sat on the rule rather than above it, the way a pen lands on a form.
      try {
        doc.image(person.signature, left + 6, y - 34, { fit: [column - 40, 46] });
      } catch {
        // A signature the renderer will not take is not worth a failed report.
      }
    }
    doc.rect(left, y + 12, Math.min(200, column), 0.8).fill(COLOURS.inkSoft);

    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOURS.ink);
    doc.text(safe(person?.name ?? THERMOGRAPHER.name), left, y + 22, {
      width: column,
      height: 13,
      ellipsis: true,
    });

    let at = y + 38;
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.inkSoft);
    if (options.thermography && index === 0) {
      doc.text(`${THERMOGRAPHER.level} - ${THERMOGRAPHER.certificateNumber}`, left, at, {
        width: column,
      });
      at += 15;
    }
    const role = person?.role ?? "";
    if (role) {
      doc.fontSize(9.5).text(safe(role), left, at, { width: column, height: 11, ellipsis: true });
      at += 13;
    }
    // The certificate that authorises the work, where they hold one. An
    // apprentice holds neither, and their name stands on its own.
    const supervisor = person ? person.supervisor : COMPANY.supervisor;
    if (supervisor) {
      doc.fontSize(9.5).text(`Qualified Supervisor ${supervisor}`, left, at, { width: column });
      at += 13;
    }
  });

  doc.fillColor(COLOURS.ink);
  return y + (options.thermography ? 80 : 66);
}

/** The ohm sign, in either of the two code points a file can carry it as. */
const OHM = /[ΩΩ]/;

/**
 * A font that can carry the ohm sign, registered on the document on first use.
 *
 * The fourteen built-in PDF fonts only reach as far as WinAnsi, which has no
 * omega, so everything else on a page folds "200 MΩ" down to "200 Mohm" rather
 * than losing the unit. On a resistance — the headline value of an insulation
 * test — the sign is what an electrician reads, so one font that actually holds
 * the glyph is shipped with the app and used for those few cells.
 *
 * Liberation Sans is metrically identical to Helvetica, so a reading drawn in
 * it occupies the same space and matches the rest of the table. pdfkit embeds
 * only the glyphs used, so it costs a report a couple of kilobytes.
 */
const OHM_FONT = "OhmSans";

/** How far below the top of a line the current font puts its baseline, per em. */
function ascenderOf(doc: Doc): number {
  const face = (doc as Doc & { _font?: { ascender?: number } })._font;
  return (face?.ascender ?? 718) / 1000;
}

const OHM_FACE = path.join(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf");
let ohmFace: Buffer | null | undefined;

function withOhmFont(doc: Doc): string | null {
  if (ohmFace === undefined) {
    try {
      ohmFace = readFileSync(OHM_FACE);
    } catch {
      ohmFace = null;
    }
  }
  if (!ohmFace) return null;
  try {
    doc.registerFont(OHM_FONT, ohmFace);
    return OHM_FONT;
  } catch {
    return null;
  }
}

/**
 * Text that may carry an ohm sign, drawn with the sign rather than the word.
 *
 * The whole string goes through the shipped font, so the sign and the number
 * beside it are one piece of type. If that font cannot be read the text still
 * prints, folded to "Mohm" the way the rest of the page is.
 */
export function ohmText(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  options: { width: number; align?: "left" | "center" | "right"; size?: number; font?: string },
) {
  const body = options.font ?? "Helvetica";
  const size = options.size ?? 9;
  const face = OHM.test(text) ? withOhmFont(doc) : null;

  const raw = (doc as Doc & { [RAW]?: Doc["text"] })[RAW] ?? doc.text.bind(doc);

  // pdfkit places a line by its top, which puts the baseline an ascender below
  // the y given — and the shipped font's ascender is taller than Helvetica's.
  // Left alone the cell would sit a couple of points below the rest of its row.
  doc.font(body).fontSize(size);
  const sitsAt = ascenderOf(doc);
  doc.font(face ?? body).fontSize(size);
  const lift = face ? (sitsAt - ascenderOf(doc)) * size : 0;

  raw(face ? String(text) : safe(String(text)), x, y + lift, {
    width: options.width,
    align: options.align ?? "left",
    lineBreak: false,
  });
  doc.font(body).fontSize(size);
}
