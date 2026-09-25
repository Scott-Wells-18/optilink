import sharp from "sharp";
import {
  editZip,
  fillRowCell,
  lineUnderTitle,
  putSignatures,
  readMain,
  writeMain,
  type Placement,
} from "@/lib/safety/docx";
import type { JsaPdfValues } from "@/lib/safety/fillJsaPdf";

/**
 * Filling in a JSA that was released as a Word document.
 *
 * Four of the eighteen are still .docx. They are filled the same way the PDFs
 * are — the job line under the title, the signatory rows at the back — except
 * that here the file itself is edited rather than drawn over. What comes out
 * is the released document with its blanks written in: same tables, same
 * column widths, same colours, same logo, and still a Word file, so it can be
 * amended on site the way the author intended.
 *
 * The four rows the form provides are filled in order and whatever is left
 * over stays blank, which is the point of a form with spare rows.
 */

/** Tall enough to read, short enough that the row barely notices. */
const SIGNATURE_HEIGHT = 26;

export async function fillJsaDocx(template: Buffer, values: JsaPdfValues): Promise<Buffer> {
  const pictures = await Promise.all(
    values.signatories.map((row) =>
      row.signature ? measure(row.signature) : Promise.resolve(null),
    ),
  );

  return editZip(template, async (zip) => {
    let xml = await readMain(zip);

    if (values.jobLine?.trim()) xml = lineUnderTitle(xml, values.jobLine.trim());

    // The row reads: Full Name: | ___ | Date: | ___ | Signature: | ___ |
    // Position: | ___ , so the blanks are the odd cells along it.
    for (const [index, row] of values.signatories.entries()) {
      const at = { label: "Full Name:", nth: index };
      xml = fillRowCell(xml, at, 1, row.name);
      xml = fillRowCell(xml, at, 3, row.date);
      xml = fillRowCell(xml, at, 7, row.position);
    }
    writeMain(zip, xml);

    // The signatures go in last, on the XML the values are already in, so the
    // cells are found in the document as it will actually be saved.
    const placements: Placement[] = [];
    pictures.forEach((picture, index) => {
      if (picture) {
        placements.push({ where: { label: "Full Name:", nth: index }, cell: 5, picture });
      }
    });
    await putSignatures(zip, placements);
  });
}

/** A signature at the size it will be drawn, keeping its own proportions. */
async function measure(png: Buffer) {
  const { width, height } = await sharp(png).metadata();
  if (!width || !height) return null;
  return {
    png,
    heightPt: SIGNATURE_HEIGHT,
    widthPt: Math.round((width / height) * SIGNATURE_HEIGHT),
  };
}
