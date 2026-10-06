import { COLOURS, safe } from "@/lib/report/theme";
import type { Instrument } from "@/lib/report/instrument";
import { fitted, type Box, type Slot } from "@/lib/report/certificate";

/**
 * The equipment page at the back of a landscape report.
 *
 * What took the readings, and the certificate that says it was in calibration
 * when it did — reproduced as its own pages rather than retyped, because a
 * calibration certificate is somebody else's document and a report that
 * summarises one has thrown away the evidence for its own numbers.
 *
 * Written once here and used by every landscape report, so the power analysis
 * and the amp readings bind their instrument in the same way rather than
 * drifting apart from each other.
 */

type Doc = PDFKit.PDFDocument;

/** The landscape page these reports share. */
const MARGIN = 34;
const CONTENT = 841.89 - MARGIN * 2;

/** The body of a page, between the heading rule and the page foot. */
const BODY = { top: 104, height: 436 };

/**
 * The instrument block on the first equipment page.
 *
 * Kept narrow on purpose. A portrait certificate on a landscape page is
 * limited by the height of the page, not its width, so every point this block
 * does not take is a point of width the certificate can have — and at two
 * pages across, each one of those points is worth about one and a half points
 * of certificate height.
 */
const BLOCK = { photo: 96, gap: 14, details: 140, alone: 200, gutter: 22 };

/**
 * How wide the instrument block is, which is what the certificate gets the
 * rest of. Without a photograph the details take the column on their own and
 * are given a little more of it, rather than sitting in a narrow strip beside
 * the space where a photograph would have been.
 */
function blockWidth(instrument: Instrument): number {
  return instrument.photo ? BLOCK.photo + BLOCK.gap + BLOCK.details : BLOCK.alone;
}

/** How many certificate pages go on a page, with and without the block. */
const FIRST_PAGE = 2;
const LATER_PAGE = 3;

/** A certificate page is set in from its border, and the border from its gap. */
const BORDER_GAP = 5;
const BORDER_WIDTH = 1.4;

/**
 * The equipment page, and however many more the certificate needs.
 *
 * Returns the gaps the certificate's own pages are stamped into afterwards.
 * They are drawn here, borders and all, because the border has to sit around
 * the page at whatever size that page ends up, and only this function knows
 * what size that is.
 *
 * `heading` is the report's own page head, called once per page it adds.
 */
export function equipmentPages(
  doc: Doc,
  instrument: Instrument | null,
  heading: (note?: string) => void,
): Slot[] {
  if (!instrument) return [];

  const slots: Slot[] = [];
  const sizes = instrument.certificate?.sizes ?? [];

  doc.addPage();
  heading();
  instrumentBlock(doc, instrument);

  const left = MARGIN + blockWidth(instrument) + BLOCK.gutter;
  layCertificates(
    doc,
    sizes.slice(0, FIRST_PAGE),
    0,
    { x: left, y: BODY.top, width: MARGIN + CONTENT - left, height: BODY.height },
    doc.bufferedPageRange().count - 1,
    sizes.length,
    slots,
  );

  // Anything the first page could not take, three across on a page of its own.
  for (let from = FIRST_PAGE; from < sizes.length; from += LATER_PAGE) {
    doc.addPage();
    heading("Calibration certificate, continued");
    layCertificates(
      doc,
      sizes.slice(from, from + LATER_PAGE),
      from,
      { x: MARGIN, y: BODY.top, width: CONTENT, height: BODY.height },
      doc.bufferedPageRange().count - 1,
      sizes.length,
      slots,
    );
  }

  return slots;
}

/** How many pages the equipment section will run to. */
export function equipmentPageCount(instrument: Instrument | null): number {
  if (!instrument) return 0;
  const sizes = instrument.certificate?.sizes.length ?? 0;
  return 1 + Math.ceil(Math.max(0, sizes - FIRST_PAGE) / LATER_PAGE);
}

/**
 * The instrument itself: its photograph, and what it is, beside it.
 *
 * The photograph is small on purpose. It is there so a reader can see the box
 * the readings came out of, not to be looked at, and the space it does not
 * take is space the certificate does.
 */
function instrumentBlock(doc: Doc, instrument: Instrument) {
  const column = blockWidth(instrument);
  let x = MARGIN;
  let width = column;

  if (instrument.photo) {
    try {
      doc.image(instrument.photo, MARGIN, BODY.top, { fit: [BLOCK.photo, 88] });
      x = MARGIN + BLOCK.photo + BLOCK.gap;
      width = BLOCK.details;
    } catch {
      // An image the renderer will not take is not worth a failed report.
    }
  }

  let y = BODY.top;
  const rows: [string, string | null][] = [
    ["Equipment name", instrument.name],
    ["Serial no", instrument.serialNo],
    ["Model no", instrument.modelNo],
  ];

  for (const [name, value] of rows) {
    label(doc, name, x, y);
    y += 13;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOURS.ink);
    doc.text(safe(value ?? "—"), x, y, { width });
    y += doc.heightOfString(safe(value ?? "—"), { width }) + 12;
  }

  const note = instrument.certificateUnreadable
    ? "A calibration certificate is on file for this instrument but could not be read, so it has not been reproduced here."
    : instrument.certificate
      ? "The calibration certificate is reproduced on this page exactly as it was issued. Nothing has been retyped or redrawn."
      : "No calibration certificate has been filed against this instrument.";

  const below = Math.max(y, BODY.top + 100) + 8;
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(note), MARGIN, below, { width: column, lineGap: 1.8 });
  doc.fillColor(COLOURS.ink);
}

/**
 * Certificate pages across a region, each as large as it will go.
 *
 * Every page gets the same share of the width whatever shape it is, so a
 * certificate whose second page is landscape does not shove the first one over
 * — and each is fitted inside its share rather than stretched to fill it.
 *
 * The blue rule is set out from the page edge rather than drawn on it, so the
 * certificate's own border, where it has one, stays its own.
 */
function layCertificates(
  doc: Doc,
  sizes: { width: number; height: number }[],
  offset: number,
  region: Box,
  page: number,
  total: number,
  slots: Slot[],
) {
  if (sizes.length === 0) return;

  const gap = 18;
  const inset = BORDER_GAP + BORDER_WIDTH + 2;
  const share = (region.width - gap * (sizes.length - 1)) / sizes.length;

  sizes.forEach((size, index) => {
    const space: Box = {
      x: region.x + index * (share + gap) + inset,
      y: region.y + inset,
      width: share - inset * 2,
      height: region.height - inset * 2,
    };
    const box = fitted(space, size);

    // A hairline on the page edge gives a white certificate a definite edge;
    // the blue rule sits outside it.
    doc.lineWidth(0.5).strokeColor(COLOURS.hair);
    doc.rect(box.x, box.y, box.width, box.height).stroke();
    doc.lineWidth(BORDER_WIDTH).strokeColor(COLOURS.accent);
    doc
      .rect(
        box.x - BORDER_GAP,
        box.y - BORDER_GAP,
        box.width + BORDER_GAP * 2,
        box.height + BORDER_GAP * 2,
      )
      .stroke();
    doc.lineWidth(1).strokeColor("#000000");

    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
    doc.text(
      `PAGE ${offset + index + 1} OF ${total}`,
      box.x - BORDER_GAP,
      box.y + box.height + BORDER_GAP + 5,
      { width: box.width + BORDER_GAP * 2, align: "center", characterSpacing: 1.1 },
    );
    doc.fillColor(COLOURS.ink);

    slots.push({ ...box, page, source: offset + index });
  });
}

/** A small letterspaced heading, as the rest of the page uses. */
function label(doc: Doc, text: string, x: number, y: number) {
  doc.fillColor(COLOURS.inkSoft).font("Helvetica-Bold").fontSize(8);
  doc.text(text.toUpperCase(), x, y, { characterSpacing: 1.8, lineBreak: false });
  doc.fillColor(COLOURS.ink);
}

/* --- the same page, stood upright ------------------------------------------ */

/**
 * The equipment page for a landscape report that wants it portrait.
 *
 * The installation report is read landscape, but a calibration certificate is
 * an A4 portrait document and so is the tester's own export, and both are
 * reproduced rather than retyped. Laid across a landscape page they come out
 * small with white down either side; on a page turned to their own shape they
 * come out nearly full size.
 *
 * The block goes across the top rather than down the side, because a portrait
 * page has width to spare at the top and height is what the certificate wants.
 */
export function equipmentPagesPortrait(
  doc: Doc,
  instrument: Instrument | null,
  heading: (note?: string) => void,
  sheet: { width: number; height: number; margin: number; top: number; foot: number },
): Slot[] {
  if (!instrument) return [];

  const slots: Slot[] = [];
  const sizes = instrument.certificate?.sizes ?? [];
  const content = sheet.width - sheet.margin * 2;
  const add = () => doc.addPage({ size: [sheet.width, sheet.height], margin: sheet.margin });

  add();
  heading();
  const used = stackedBlock(doc, instrument, sheet.margin, sheet.top, content);

  const first = sheet.top + used + 18;
  layCertificates(
    doc,
    sizes.slice(0, 1),
    0,
    { x: sheet.margin, y: first, width: content, height: sheet.height - sheet.foot - first },
    doc.bufferedPageRange().count - 1,
    sizes.length,
    slots,
  );

  // Whatever the first page could not take, two across on a page of its own.
  for (let from = 1; from < sizes.length; from += 2) {
    add();
    heading("Calibration certificate, continued");
    layCertificates(
      doc,
      sizes.slice(from, from + 2),
      from,
      {
        x: sheet.margin,
        y: sheet.top,
        width: content,
        height: sheet.height - sheet.foot - sheet.top,
      },
      doc.bufferedPageRange().count - 1,
      sizes.length,
      slots,
    );
  }

  return slots;
}

/** How many pages the portrait equipment section will run to. */
export function equipmentPageCountPortrait(instrument: Instrument | null): number {
  if (!instrument) return 0;
  const sizes = instrument.certificate?.sizes.length ?? 0;
  return 1 + Math.ceil(Math.max(0, sizes - 1) / 2);
}

/**
 * The instrument across the top of a page: photograph, then what it is.
 *
 * Hands back how tall it turned out, because what is under it is a certificate
 * sized to whatever is left.
 */
function stackedBlock(
  doc: Doc,
  instrument: Instrument,
  x: number,
  y: number,
  width: number,
): number {
  let left = x;
  let tall = 0;

  if (instrument.photo) {
    try {
      doc.image(instrument.photo, x, y, { fit: [BLOCK.photo, 96] });
      left = x + BLOCK.photo + BLOCK.gap * 2;
      tall = 96;
    } catch {
      // An image the renderer will not take is not worth a failed report.
    }
  }

  const rows: [string, string | null][] = [
    ["Equipment name", instrument.name],
    ["Model no", instrument.modelNo],
    ["Serial no", instrument.serialNo],
  ];
  const column = (x + width - left) / rows.length;

  rows.forEach(([name, value], index) => {
    const at = left + index * column;
    label(doc, name, at, y);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLOURS.ink);
    doc.text(safe(value ?? "—"), at, y + 14, { width: column - 12 });
    tall = Math.max(tall, 14 + doc.heightOfString(safe(value ?? "—"), { width: column - 12 }));
  });

  const note = instrument.certificateUnreadable
    ? "A calibration certificate is on file for this instrument but could not be read, so it has not been reproduced here."
    : instrument.certificate
      ? "The calibration certificate is reproduced below exactly as it was issued. Nothing has been retyped or redrawn."
      : "No calibration certificate has been filed against this instrument.";

  const below = y + tall + 10;
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(note), x, below, { width, lineGap: 1.8 });
  doc.fillColor(COLOURS.ink);

  return below - y + doc.heightOfString(safe(note), { width, lineGap: 1.8 });
}
