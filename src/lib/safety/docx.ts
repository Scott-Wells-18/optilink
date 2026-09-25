import JSZip from "jszip";

/**
 * Writing into a Word document without redrawing it.
 *
 * Four of the JSAs and the energised-testing authorisation were released as
 * .docx files. The temptation is to read them, draw a PDF that looks like
 * them and hand that back — and the result is never quite the document that
 * was approved: a column moves, a colour shifts, a page breaks somewhere
 * else.
 *
 * So nothing is redrawn. The file is opened as the zip it is, values are
 * written into the empty cells of its own tables, and it is zipped back up.
 * Every measurement, border, font and logo is the original's because it *is*
 * the original — only the blanks have changed.
 *
 * The edits are made on the XML as text rather than through a parser. That is
 * deliberate: a parser would rewrite the whole document on the way out, and
 * Word notices. Only the bytes that have to change do.
 *
 * Everything here works in rows, because that is what these forms are: a row
 * says what it wants and the cells along it are where the answer goes. A row
 * is found by what is printed in it, so a template that is revised and still
 * says the same thing still fills in.
 */

/** Word wants its own escaping, and a stray & will not open. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The text of a run of XML, with the tags taken out. */
export function textOf(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Span = { start: number; end: number; text: string };
type Row = Span & { cells: Span[] };

function spansOf(xml: string, tag: string, from = 0, to = xml.length): Span[] {
  const out: Span[] = [];
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "g");
  open.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = open.exec(xml))) {
    if (match.index >= to) break;
    const close = xml.indexOf(`</${tag}>`, match.index);
    if (close < 0 || close >= to) continue;
    const end = close + `</${tag}>`.length;
    out.push({ start: match.index, end, text: textOf(xml.slice(match.index, close)) });
    // Rows and cells do not nest in these documents, so the next one starts
    // after this one ends.
    open.lastIndex = end;
  }
  return out;
}

/** Every table row in the document, with its cells. */
export function rowsOf(xml: string): Row[] {
  return spansOf(xml, "w:tr").map((row) => ({
    ...row,
    cells: spansOf(xml, "w:tc", row.start, row.end),
  }));
}

/**
 * How a row is picked out.
 *
 * `label` is the usual one: the row's own first cell, which on these forms is
 * what the row is asking for. It is exact, because these documents say the
 * same sentence in three different tables and a loose match lands in the wrong
 * one. `nth` picks between rows that genuinely read the same — the four
 * signatory rows, or the hazard rows that all offer the same three ratings.
 */
export type Where = {
  /** Matched against the row's first cell, exactly. */
  label?: string;
  /** Matched anywhere in the row, loosely — for a row with no label of its own. */
  contains?: string;
  nth?: number;
};

export function rowWith(xml: string, where: Where): Row | null {
  const rows = rowsOf(xml);
  const found = rows.filter((row) => {
    if (where.label !== undefined) {
      return norm(row.cells[0]?.text ?? "") === norm(where.label);
    }
    return norm(row.text).includes(norm(where.contains ?? ""));
  });
  return found[where.nth ?? 0] ?? null;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A run carrying one value, in the size the form's own answers are set in. */
function run(value: string, options: { bold?: boolean; boxed?: boolean } = {}): string {
  const properties =
    `<w:rPr>` +
    (options.bold ? `<w:b/>` : "") +
    (options.boxed ? `<w:bdr w:val="single" w:sz="8" w:space="0" w:color="C00000"/>` : "") +
    `<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>`;
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
}

/** Puts some XML inside a cell, at the end of its first paragraph. */
function intoCell(cell: string, xml: string): string {
  const close = cell.indexOf("</w:p>");
  if (close < 0) return cell;
  return cell.slice(0, close) + xml + cell.slice(close);
}

function replaceSpan(xml: string, span: Span, replacement: string): string {
  return xml.slice(0, span.start) + replacement + xml.slice(span.end);
}

/**
 * Writes a value into one cell of the row that says `needle`.
 *
 * `cell` counts from the left of that row, so a row reading
 * "Project / client | ___ | Site address | ___" fills its first blank at 1 and
 * its second at 3.
 */
export function fillRowCell(
  xml: string,
  where: Where,
  cell: number,
  value: string,
  options: { bold?: boolean; separator?: string } = {},
): string {
  if (!value.trim()) return xml;
  const row = rowWith(xml, where);
  const target = row?.cells[cell];
  if (!target) return xml;
  // A cell that already has something printed in it gets the answer added
  // after it rather than instead of it — the form's own words stay.
  const prefix = target.text ? (options.separator ?? " ") : "";
  return replaceSpan(
    xml,
    target,
    intoCell(xml.slice(target.start, target.end), run(`${prefix}${value.trim()}`, options)),
  );
}

/**
 * Ticking one of the form's own boxes.
 *
 * The boxes are the literal text "[ ]", so a tick is the cross written into
 * that box rather than a mark drawn over the page. `which` picks between the
 * boxes where a row offers several — "[ ] Approved [ ] Not approved".
 */
export function tickBox(xml: string, where: Where, which = 0): string {
  const row = rowWith(xml, where);
  if (!row) return xml;
  const want = which;
  let seen = 0;
  for (const cell of row.cells) {
    const text = xml.slice(cell.start, cell.end);
    // Boxes already ticked still count, so ticking the third box of a row does
    // not move when the first one has been ticked already.
    const boxes = [...text.matchAll(/\[[ X]\]/g)];
    if (boxes.length === 0) continue;
    if (seen + boxes.length <= want) {
      seen += boxes.length;
      continue;
    }
    const box = boxes[want - seen];
    if (box[0] === "[X]") return xml;
    const at = box.index;
    return replaceSpan(xml, cell, `${text.slice(0, at)}[X]${text.slice(at + 3)}`);
  }
  return xml;
}

/**
 * Marking one rating in a cell that offers "H / M / L".
 *
 * The form asks the assessor to choose, and a choice has to be visible on the
 * page, so the letter chosen is boxed and made bold. Nothing is deleted — the
 * reader can still see what the options were, which is the point of a form
 * that prints its own scale.
 */
export function markRating(
  xml: string,
  where: Where,
  cell: number,
  rating: "H" | "M" | "L",
): string {
  const row = rowWith(xml, where);
  const target = row?.cells[cell];
  if (!target) return xml;

  const text = xml.slice(target.start, target.end);
  if (!textOf(text).includes("H / M / L")) return xml;

  const marked = text.replace(
    /<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>\s*H \/ M \/ L\s*<\/w:t>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/,
    run("H", { bold: rating === "H", boxed: rating === "H" }) +
      run(" / ") +
      run("M", { bold: rating === "M", boxed: rating === "M" }) +
      run(" / ") +
      run("L", { bold: rating === "L", boxed: rating === "L" }),
  );
  return marked === text ? xml : replaceSpan(xml, target, marked);
}

/**
 * A line under the document's own title.
 *
 * None of these documents has a field for a job number — they were written to
 * be used on any job — so it goes on a line of its own under the title, where
 * the eye looks for it, and nothing that identifies the document is touched.
 */
export function lineUnderTitle(xml: string, line: string): string {
  const body = xml.indexOf("<w:body>");
  if (body < 0) return xml;
  const firstEnd = xml.indexOf("</w:p>", body);
  if (firstEnd < 0) return xml;
  const at = firstEnd + "</w:p>".length;
  // As tight as it will go. The line still costs the page about ten points,
  // and a table that was within ten points of the bottom loses its last row to
  // the next page — so it is kept to one line and no more.
  const paragraph =
    `<w:p><w:pPr><w:spacing w:before="0" w:after="20" w:line="200" w:lineRule="exact"/></w:pPr>` +
    run(line) +
    `</w:p>`;
  return xml.slice(0, at) + paragraph + xml.slice(at);
}

/* --- signatures ----------------------------------------------------------- */

const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

export type Picture = { png: Buffer; widthPt: number; heightPt: number };

export type Placement = { where: Where; cell: number; picture: Picture };

/**
 * A signature, dropped into the cell the form leaves for it.
 *
 * Sized in points and converted to Word's own units, so it sits in the row it
 * belongs to rather than stretching the page out of shape.
 */
export async function putSignatures(zip: JSZip, placements: Placement[]): Promise<void> {
  if (placements.length === 0) return;

  const relsPath = "word/_rels/document.xml.rels";
  let xml = await readMain(zip);
  let rels = await zip.file(relsPath)!.async("string");

  const used = [...rels.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  let next = Math.max(0, ...used) + 1;

  for (const [index, placement] of placements.entries()) {
    const row = rowWith(xml, placement.where);
    const target = row?.cells[placement.cell];
    if (!target) continue;

    const id = `rId${next++}`;
    const name = `optilink-signature-${index + 1}.png`;
    zip.file(`word/media/${name}`, placement.picture.png);
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${id}" Type="${IMAGE_REL}" Target="media/${name}"/></Relationships>`,
    );

    // 12,700 EMU to the point.
    const cx = Math.round(placement.picture.widthPt * 12700);
    const cy = Math.round(placement.picture.heightPt * 12700);
    const drawing =
      `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${900 + index}" name="Signature ${index + 1}"/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
      `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:nvPicPr><pic:cNvPr id="${900 + index}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

    xml = replaceSpan(xml, target, intoCell(xml.slice(target.start, target.end), drawing));
  }

  writeMain(zip, xml);
  zip.file(relsPath, rels);
}

/* --- the file itself ------------------------------------------------------ */

const MAIN = "word/document.xml";

/** Opens a .docx, hands its main part to an editor, and zips it back up. */
export async function editDocx(
  bytes: Buffer,
  edit: (xml: string) => string | Promise<string>,
): Promise<Buffer> {
  return editZip(bytes, async (zip) => {
    writeMain(zip, await edit(await readMain(zip)));
  });
}

/** The same, for an edit that also has to reach the media or the parts list. */
export async function editZip(
  bytes: Buffer,
  edit: (zip: JSZip) => Promise<void>,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  await edit(zip);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function readMain(zip: JSZip): Promise<string> {
  return zip.file(MAIN)!.async("string");
}

export function writeMain(zip: JSZip, xml: string): void {
  zip.file(MAIN, xml);
}
