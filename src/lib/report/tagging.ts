import PDFDocument from "pdfkit";
import { COMPANY } from "@/lib/company";
import { COLOURS, SEVERITY, longDate, safe, shortDate } from "@/lib/report/theme";
import { guarded, mastheadLines, signOffBlock, stampWideFeet, type Doc, type PageMeta } from "@/lib/report/furniture";
import {
  LAND,
  LAND_CONTENT,
  LAND_MARGIN,
  TABLE_TOP,
  TABLES,
  drawTable,
} from "@/lib/report/registerTable";
import { VERDICT_LABELS, byVerdict, type Item, type Verdict } from "@/lib/tagging/register";
import { datedToReport, dayOf, monthAfter } from "@/lib/tagging/dates";

/**
 * The test-and-tag register, as a report.
 *
 * Two of them, built the same way because they are the same register read for
 * two audiences:
 *
 *  - OUR OWN gear, out of the reference file kept in Settings. One register,
 *    everything on it, because it is a list of what is in the truck and the
 *    point is to see all of it.
 *  - A CLIENT'S gear, out of the file uploaded for that report. Split: what
 *    passed, then what failed on a page of its own under red headings, then
 *    anything whose status nobody can state. A client reads the failures
 *    first, and burying them in a list of ninety passes is not reporting them.
 *
 * Neither invents a row. "No failed equipment recorded" is a sentence this
 * report is willing to print; a failed row it made up is not.
 */

export type RegisterKind = "INTERNAL" | "CLIENT";

export type RegisterReport = PageMeta & {
  kind: RegisterKind;
  /** The day the report is issued, which is not any item's test date. */
  reportDate: Date;
  /** The customer and site as the spreadsheet had them. */
  customer: string | null;
  site: string | null;
  items: Item[];
  /**
   * How many customer and site pairings the whole spreadsheet held.
   *
   * `items` is only the ones this report is about, so it cannot say how many
   * the file held — and saying "the file held four, this is one of them" is
   * the honest version of the note that would otherwise tell the reader of a
   * finished report to go and choose a customer.
   */
  pairingsInFile?: number;
  /** The file it was read out of, named so the report can be traced back. */
  sourceName: string | null;
  /** Anything the reader wants the reader of the report to know. */
  notes: string[];
};

export async function buildRegisterReport(data: RegisterReport): Promise<Buffer> {
  const doc = guarded(
    new PDFDocument({
      size: [LAND.width, LAND.height],
      margin: LAND_MARGIN,
      bufferPages: true,
    }),
  );
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  /*
   * Our own register is dated to the day it is made: the gear is tested and
   * the report is run on the same visit, so the report date is the test date
   * and the next test falls a month later. A client's equipment keeps the
   * dates recorded against it — changing those would be changing somebody
   * else's test record.
   */
  const report: RegisterReport =
    data.kind === "INTERNAL"
      ? { ...data, items: datedToReport(data.items, data.reportDate) }
      : data;

  cover(doc, report);
  if (report.kind === "CLIENT") clientSections(doc, report);
  else internalSections(doc, report);

  // The foot of every page says whose equipment is on it. Where the report
  // covers several customers and none has been chosen, it says so rather than
  // naming the site the report happens to be filed under — a foot reading one
  // contractor's name under another contractor's welder is the thing this
  // report must never do.
  const spread = pairings(report.items).length > 1 && !(report.customer && report.site);
  stampWideFeet(
    doc,
    spread
      ? {
          ...report,
          clientName: "Several customers",
          siteName: "named above each group",
          siteLocation: null,
        }
      : report,
    { width: LAND.width, height: LAND.height, margin: LAND_MARGIN },
  );
  doc.end();
  return done;
}

/* --- the cover ------------------------------------------------------------ */

const TITLES: Record<RegisterKind, string> = {
  INTERNAL: "Test & Tag Register",
  CLIENT: "Test & Tag Report",
};

function cover(doc: Doc, data: RegisterReport) {
  if (data.logo) doc.image(data.logo, LAND_MARGIN, 34, { fit: [150, 48] });
  mastheadLines(doc, LAND_MARGIN + 380, 36, LAND_CONTENT - 380);

  let y = 124;
  doc.rect(LAND_MARGIN, y, 4, 54).fill(COLOURS.accent);
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(10);
  doc.text(TITLES[data.kind].toUpperCase(), LAND_MARGIN + 18, y + 2, {
    characterSpacing: 1.6,
  });
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(26);
  doc.text(
    data.kind === "CLIENT" ? "Test & Tag Report" : "Equipment Test & Tag Register",
    LAND_MARGIN + 18,
    y + 18,
    { width: LAND_CONTENT - 18 },
  );

  /*
   * The report date, large and alone.
   *
   * The box is cut to the date rather than the date squeezed into the box: a
   * long one ("Tuesday 6 October 2026") wrapped to a second line and dropped
   * out the bottom of a fixed panel. It is measured at the size it is drawn,
   * the type steps down if it is still too wide, and the panel is built round
   * what comes out.
   */
  y = 196;
  const pad = 16;
  const when = longDate(data.reportDate);

  let dateSize = 19;
  doc.font("Helvetica-Bold").fontSize(dateSize);
  const dateMax = 300;
  while (dateSize > 13 && doc.widthOfString(when) > dateMax - pad * 2) {
    dateSize -= 0.5;
    doc.fontSize(dateSize);
  }
  const dateWidth = Math.min(dateMax, Math.max(200, doc.widthOfString(when) + pad * 2));
  const dateX = LAND_MARGIN + LAND_CONTENT - dateWidth;
  const dateHeight = 30 + dateSize + 10;

  doc.roundedRect(dateX, y - 6, dateWidth, dateHeight, 6).fill(COLOURS.band);
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(8);
  doc.text("REPORT DATE", dateX + pad, y + 6, { characterSpacing: 1.2, lineBreak: false });
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(dateSize);
  doc.text(when, dateX + pad, y + 22, { width: dateWidth - pad * 2, lineBreak: false });

  /*
   * Whose equipment this is.
   *
   * Where a pairing has been chosen, or the file held only one, it is named.
   * Where it has not, the cover says how many there are rather than naming the
   * first — a heading reading "Harbourside Storage" over a page that includes
   * another contractor's welder is the worst thing this report could print.
   */
  const pairs = pairings(data.items);
  const named = Boolean(data.customer && data.site);
  const facts: [string, string][] = named
    ? [
        ["Customer", data.customer!],
        ["Site", data.site!],
        ["Equipment listed", String(data.items.length)],
      ]
    : [
        [
          "Customer",
          pairs.length === 1
            ? pairs[0].customer
            : `${pairs.length} customers and sites, named on each section`,
        ],
        ["Site", pairs.length === 1 ? pairs[0].site : "—"],
        ["Equipment listed", String(data.items.length)],
      ];
  const split = byVerdict(data.items);
  facts.push([
    "Result",
    [
      `${split.PASS.length} passed`,
      `${split.FAIL.length} failed`,
      split.REVIEW.length > 0 ? `${split.REVIEW.length} needing review` : null,
    ]
      .filter(Boolean)
      .join("  ·  "),
  ]);

  let at = y;
  const labelWidth = 118;
  const width = LAND_CONTENT - dateWidth - 40;
  for (const [name, value] of facts) {
    doc.rect(LAND_MARGIN, at, width, 0.6).fill(COLOURS.hair);
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text(name, LAND_MARGIN, at + 7, { width: labelWidth });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9.5);
    doc.text(safe(value), LAND_MARGIN + labelWidth + 8, at + 6.5, {
      width: width - labelWidth - 8,
      height: 12,
      ellipsis: true,
    });
    at += 24;
  }
  doc.rect(LAND_MARGIN, at, width, 0.6).fill(COLOURS.hair);
  at += 16;

  const notes = notesFor(data, named);
  if (notes.length > 0) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(COLOURS.inkSoft);
    for (const note of notes) {
      doc.text(`•  ${safe(note)}`, LAND_MARGIN, at, { width, lineGap: 1.4 });
      at = doc.y + 3;
    }
    at += 8;
  }

  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      data.kind === "CLIENT"
        ? "This report lists the equipment tested and tagged at the site named above, with the result recorded " +
            "against each item at the time it was tested. The test date and the next test due date shown against " +
            "an item are that item's own; the report date above is the day this list was issued."
        : `This register lists ${COMPANY.name}'s own equipment, tested on ${dayOf(
            data.reportDate,
          )} and next due on ${dayOf(monthAfter(data.reportDate))}. The result shown against each ` +
            "item is the result recorded for it.",
    ),
    LAND_MARGIN,
    at,
    { width, lineGap: 1.8 },
  );

  const signAt = Math.max(doc.y + 26, LAND.height - LAND_MARGIN - 128);
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(8);
  doc.text("PREPARED BY", LAND_MARGIN, signAt, { characterSpacing: 1.2 });
  signOffBlock(doc, data.preparedBy, LAND_MARGIN, signAt + 46, 420);
  doc.fillColor(COLOURS.ink);
}

/**
 * The notes, as they should read on this report rather than on the upload.
 *
 * The notes are written when the spreadsheet is read and kept with the report,
 * which is right: a note about what the file held is part of the record. But
 * one of them is written for somebody standing at the upload screen with a
 * file holding several customers, and it names them all and ends "Choose which
 * this report is about."
 *
 * Once the choice has been made that note is both wrong and worse than wrong:
 * it tells the reader of a finished report to go and choose something, and it
 * prints three other clients' names on a report going to the fourth. So where
 * a pairing has been chosen it is replaced by what it should say — that the
 * file held more and only this one is listed here.
 */
function notesFor(data: RegisterReport, named: boolean): string[] {
  const isPicker = (note: string) => /Choose which this report is about/.test(note);
  if (!named) return data.notes;

  const rest = data.notes.filter((note) => !isPicker(note));
  if (rest.length === data.notes.length) return rest;

  const held = data.pairingsInFile ?? 0;
  if (held < 2) return rest;
  const others = held - 1;
  return [
    ...rest,
    `The spreadsheet this was read from held ${held} customer and site pairings. This report lists ` +
      `only ${data.customer} · ${data.site}; the other ${
        others === 1 ? "pairing is" : `${others} pairings are`
      } not included, and nothing belonging to them has been relabelled.`,
  ];
}

/**
 * The customer and site pairings in a set of rows, in the order they appear.
 *
 * Read off the rows rather than taken from the report, because the report's
 * own customer and site are what it has been told it is about and these are
 * what it actually holds. Where the two disagree the rows win.
 */
function pairings(items: Item[]): { customer: string; site: string }[] {
  const seen = new Map<string, { customer: string; site: string }>();
  for (const item of items) {
    const customer = item.customer || "(no customer)";
    const site = item.site || "(no site)";
    const id = `${customer}\u0000${site}`;
    if (!seen.has(id)) seen.set(id, { customer, site });
  }
  return [...seen.values()];
}

/** How a report says whose equipment it is listing, on every running head. */
function whose(data: RegisterReport): string {
  if (data.customer && data.site) return `${data.customer}  ·  ${data.site}`;
  const pairs = pairings(data.items);
  if (pairs.length === 1) return `${pairs[0].customer}  ·  ${pairs[0].site}`;
  return `${pairs.length} customers and sites — named above each group`;
}

/* --- running head --------------------------------------------------------- */

function head(doc: Doc, data: RegisterReport, title: string, note?: string): number {
  if (data.logo) doc.image(data.logo, LAND_MARGIN, 24, { fit: [118, 38] });

  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOURS.ink);
  doc.text(title, LAND_MARGIN + 136, 28, { width: LAND_CONTENT - 300, lineBreak: false });
  if (note) {
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(note), LAND_MARGIN + 136, 46, {
      width: LAND_CONTENT - 300,
      lineBreak: false,
      ellipsis: true,
    });
  }

  // The report date on every page, because a register is printed and carried
  // about and a loose page with no date on it is worth nothing.
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(`Report date ${shortDate(data.reportDate)}`, LAND_MARGIN, 70, {
    width: LAND_CONTENT,
    align: "right",
    lineBreak: false,
  });

  doc.rect(LAND_MARGIN, 80, LAND_CONTENT, 0.8).fill(COLOURS.hair);
  doc.fillColor(COLOURS.ink);
  return TABLE_TOP;
}

/* --- our own register ----------------------------------------------------- */

function internalSections(doc: Doc, data: RegisterReport) {
  const banded = pairings(data.items).length > 1;
  for (const [index, table] of TABLES.entries()) {
    doc.addPage();
    const note = `${whose(data)}  ·  ${data.items.length} items`;
    let y = head(doc, data, table.title, note);
    y = drawTable(
      doc,
      data.items,
      table.columns,
      y,
      () => {
        doc.addPage();
        return head(doc, data, `${table.title} (continued)`, note);
      },
      COLOURS.bar,
      undefined,
      banded,
    );
    if (index === TABLES.length - 1) tail(doc, y, data);
  }
}

/* --- a client's register -------------------------------------------------- */

/**
 * Passed, then failed, then anything else — each on its own page.
 *
 * The failures start a fresh page under a red heading whatever is left of the
 * one before, because a client who prints this and hands it to a supervisor
 * should be able to hand over the failures as a sheet.
 */
const SECTION_TONE: Record<Verdict, { fill: string; blurb: string; empty: string }> = {
  PASS: {
    fill: COLOURS.bar,
    blurb: "Equipment tested and recorded as passed.",
    empty: "No passed equipment recorded.",
  },
  FAIL: {
    fill: SEVERITY.fail.fill,
    blurb:
      "Equipment recorded as failed. Each item's status, comments and test sequence are shown as " +
      "they were recorded. Failed equipment should be removed from service until it is repaired " +
      "and retested.",
    empty: "No failed equipment recorded.",
  },
  REVIEW: {
    fill: SEVERITY.concern.fill,
    blurb:
      "Equipment whose recorded status is blank or is not a result this report recognises. It has " +
      "not been counted as passed. The status is printed exactly as the register had it.",
    empty: "",
  },
};

function clientSections(doc: Doc, data: RegisterReport) {
  const split = byVerdict(data.items);
  const where = whose(data);
  const banded = pairings(data.items).length > 1;

  // Passed and failed always appear, even empty — a client needs to be told
  // there were no failures rather than left to infer it from a missing page.
  // "Needs review" appears only when something is in it, because a section
  // saying nothing needed review on a register where nothing did is noise.
  const order: Verdict[] = ["PASS", "FAIL"];
  if (split.REVIEW.length > 0) order.push("REVIEW");

  order.forEach((verdict, place) => {
    const items = split[verdict];
    const tone = SECTION_TONE[verdict];
    const title = VERDICT_LABELS[verdict];
    const last = place === order.length - 1;

    if (items.length === 0) {
      doc.addPage();
      const y = head(doc, data, title, where);
      doc.roundedRect(LAND_MARGIN, y, LAND_CONTENT, 54, 6).fill(COLOURS.soft);
      doc.rect(LAND_MARGIN, y, 4, 54).fill(tone.fill);
      doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(13);
      doc.text(tone.empty, LAND_MARGIN + 20, y + 19, { width: LAND_CONTENT - 40 });
      doc.fillColor(COLOURS.ink);
      if (last) tail(doc, y + 62, data);
      return;
    }

    TABLES.forEach((table, index) => {
      doc.addPage();
      const heading = index === 0 ? title : `${title} — register detail`;
      const note = `${where}  ·  ${items.length} ${items.length === 1 ? "item" : "items"}`;
      let y = head(doc, data, heading, note);

      if (index === 0) {
        doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
        doc.text(safe(tone.blurb), LAND_MARGIN, y, { width: LAND_CONTENT, lineGap: 1.6 });
        y = doc.y + 12;
      }

      y = drawTable(
        doc,
        items,
        table.columns,
        y,
        () => {
          doc.addPage();
          return head(doc, data, `${heading} (continued)`, note);
        },
        tone.fill,
        // On the failures table the comment is written out under the item: it
        // is the most useful thing on the row and the worst thing to lose to a
        // narrow column, and a client reading this needs the defect, not a
        // truncated first five words of it.
        verdict === "FAIL" && index === 0
          ? (item) => (item.comments.trim() ? safe(item.comments.trim()) : null)
          : undefined,
        banded,
      );

      if (last && index === TABLES.length - 1) tail(doc, y, data);
    });
  });
}

/* --- the closing note ----------------------------------------------------- */

function tail(doc: Doc, y: number, data: RegisterReport) {
  const at = y + 18;
  if (at > LAND.height - 120) return;
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      data.kind === "INTERNAL"
        ? `Every item above was tested on ${dayOf(data.reportDate)} and is due for retest on ` +
            `${dayOf(monthAfter(data.reportDate))}. The result shown against an item is the result recorded for it.`
        : "Each result above is the result recorded against that item when it was tested, on the date shown " +
            "against it. This report states what the register held; it does not re-test the equipment, and the " +
            `report date (${shortDate(data.reportDate)}) does not extend or alter any test due date.`,
    ),
    LAND_MARGIN,
    at,
    { width: LAND_CONTENT, lineGap: 1.6 },
  );
  doc.fillColor(COLOURS.ink);
}
