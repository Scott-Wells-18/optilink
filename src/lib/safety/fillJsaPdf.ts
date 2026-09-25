import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import map from "@/lib/safety/jsaFields.json";

/**
 * Filling in a JSA that was released as a PDF.
 *
 * Fourteen of the eighteen JSAs were exported to PDF rather than left as Word
 * files, so there is nothing in them to edit: no form fields, no text layer
 * worth speaking of. They are filled the same way the SWMS are — by writing
 * into the boxes that were left empty, at coordinates measured off the
 * released files themselves.
 *
 * Nothing else is touched. Every task row, every rating and every colour is
 * the company's own, exactly as approved.
 *
 * Two things are written:
 *
 *  - the job number, on a line under the document's title. The JSAs have no
 *    field for one — they were written to be reused on any job — so it is
 *    added where there is clear space beneath the identifier rather than put
 *    in a box that means something else. The identifier itself is never
 *    touched.
 *  - the signatory rows at the back: who read the assessment, on what date,
 *    in what position, and their signature where they have signed it.
 */

type Row = { name: string; date: string; position: string; signature?: Buffer | null };

type Fields = {
  pages: number;
  size: { width: number; height: number };
  jobLine: { page: number; x: number; top: number };
  signatories: {
    page: number;
    rowHeight: number;
    columns: { name: number; date: number; signature: number; position: number };
    signatureBox: { x: number; width: number };
    rows: number[];
  };
};

const FIELDS = map as Record<string, Fields>;

export function canFillJsaPdf(code: string): boolean {
  return Boolean(FIELDS[code]);
}

export type JsaPdfValues = {
  /** "Job 2026-118", written under the title. */
  jobLine?: string;
  /** In the order they appear on the form, up to the four rows it has. */
  signatories: Row[];
};

export async function fillJsaPdf(
  code: string,
  template: Buffer,
  values: JsaPdfValues,
): Promise<Buffer> {
  const fields = FIELDS[code];
  const doc = await PDFDocument.load(template);
  if (!fields) return Buffer.from(await doc.save());

  const pages = doc.getPages();
  // The coordinates were measured off a particular release. If the document
  // has been revised since, they cannot be trusted, so nothing is written
  // rather than something being written in the wrong place.
  const first = pages[0];
  if (
    pages.length !== fields.pages ||
    Math.abs(first.getWidth() - fields.size.width) > 2 ||
    Math.abs(first.getHeight() - fields.size.height) > 2
  ) {
    return Buffer.from(await doc.save());
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.04, 0.11, 0.18);

  if (values.jobLine?.trim()) {
    const page = pages[fields.jobLine.page - 1];
    page.drawText(values.jobLine.trim(), {
      x: fields.jobLine.x,
      y: page.getHeight() - fields.jobLine.top - 7,
      size: 7.5,
      font,
      color: ink,
    });
  }

  const block = fields.signatories;
  const page = pages[block.page - 1];
  const height = page.getHeight();

  for (const [index, row] of values.signatories.slice(0, block.rows.length).entries()) {
    const top = block.rows[index];
    // The row's text sits on the middle of the line the label is on.
    const y = height - top - 4.4;

    const write = (text: string, x: number) => {
      if (!text.trim()) return;
      page.drawText(text.trim(), { x, y, size: 7.5, font, color: ink });
    };
    write(row.name, block.columns.name);
    write(row.date, block.columns.date);
    write(row.position, block.columns.position);

    if (!row.signature) continue;
    /*
     * The signature goes inside the row the form drew for it.
     *
     * A page of a PDF does not grow to fit what is written on it the way a
     * Word table does, so a signature sized to look impressive climbs into the
     * row above and over the line of text there. It is sized to the row
     * instead — a shade taller than the row and centred on it, so it bleeds a
     * couple of points onto the rules above and below and no further — and left
     * where a pen would land rather than centred in the cell.
     */
    const image = await doc.embedPng(row.signature);
    const room = { width: block.signatureBox.width - 6, height: block.rowHeight + 4 };
    const scale = Math.min(room.width / image.width, room.height / image.height);
    const drawn = { width: image.width * scale, height: image.height * scale };
    page.drawImage(image, {
      x: block.signatureBox.x + 2,
      y: height - top - block.rowHeight + (block.rowHeight - drawn.height) / 2,
      ...drawn,
    });
  }

  return Buffer.from(await doc.save());
}
