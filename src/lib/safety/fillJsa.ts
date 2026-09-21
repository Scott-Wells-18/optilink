import JSZip from "jszip";

/**
 * Filling in a JSA.
 *
 * A JSA arrives as a Word document that is already complete: every task,
 * hazard, consequence, likelihood, mitigation and residual rating was written
 * and approved by a person. The only blanks are the signatory blocks at the
 * end — four rows of Full Name, Date, Signature, Position.
 *
 * So this fills those, and nothing else. It works on the document's own XML
 * rather than rebuilding the file, which means what comes out is their
 * document with names and signatures in it, not a copy of it that happens to
 * look similar. That distinction matters on a document somebody signs.
 */

export type Signatory = {
  name: string;
  position: string;
  date: string;
  /** A transparent PNG of the signature, if there is one. */
  signature?: Buffer;
};

/** A cell holding one signatory's details, in the order they appear in a row. */
const CELL = { name: 1, date: 3, signature: 5, position: 7 } as const;

export async function fillJsa(template: Buffer, signatories: Signatory[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return template;

  const relsPath = "word/_rels/document.xml.rels";
  let rels = (await zip.file(relsPath)?.async("string")) ?? "";

  let xml = documentXml;
  let nextRel = highestRelId(rels) + 1;
  let nextDocPr = highestDocPr(xml) + 1;

  const rows = signatoryRows(xml);
  for (const [index, who] of signatories.entries()) {
    const row = rows[index];
    if (!row) break;

    let filled = row.xml;
    filled = writeCell(filled, CELL.name, who.name);
    filled = writeCell(filled, CELL.date, who.date);
    filled = writeCell(filled, CELL.position, who.position);

    if (who.signature) {
      const media = `word/media/signature${index + 1}.png`;
      // Without this JSZip writes a directory entry for word/media/ as well,
      // and a Word package carrying directory entries is rejected outright by
      // some readers — including LibreOffice, which simply says the file
      // cannot be loaded.
      zip.file(media, who.signature, { createFolders: false });
      const relId = `rIdSig${nextRel}`;
      rels = rels.replace(
        "</Relationships>",
        `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature${index + 1}.png"/></Relationships>`,
      );
      nextRel += 1;
      filled = writeCell(filled, CELL.signature, "", drawing(relId, nextDocPr, size(who.signature)));
      nextDocPr += 1;
    }

    xml = xml.replace(row.xml, filled);
  }

  zip.file("word/document.xml", xml, { createFolders: false });
  if (rels) zip.file(relsPath, rels, { createFolders: false });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/* --- finding the blocks --------------------------------------------------- */

/**
 * The rows that hold a signatory: eight cells, the first of which is the
 * printed label "Full Name:". Matching on the label rather than counting rows
 * from the end means a template with an extra block still works.
 */
function signatoryRows(xml: string): { xml: string }[] {
  const out: { xml: string }[] = [];
  const rows = xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
  for (const row of rows) {
    const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
    if (cells.length !== 8) continue;
    const first = text(cells[0]).replace(/\s+/g, " ").trim().toLowerCase();
    if (first !== "full name:") continue;
    out.push({ xml: row });
  }
  return out;
}

const text = (fragment: string) =>
  [...fragment.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

/* --- writing into one --------------------------------------------------- */

/**
 * Puts a value in the nth cell of a row.
 *
 * Word keeps a cell's formatting on the paragraph inside it, so a run is added
 * to the paragraph that is already there rather than the cell being rebuilt —
 * otherwise the filled cell comes out in a different font to its neighbours.
 */
function writeCell(row: string, index: number, value: string, raw?: string): string {
  const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
  const cell = cells[index];
  if (!cell) return row;

  const run = raw ?? (value ? `<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escape(value)}</w:t></w:r>` : "");
  if (!run) return row;

  // Into the last paragraph of the cell, just before it closes.
  const at = cell.lastIndexOf("</w:p>");
  if (at < 0) return row;
  const filled = cell.slice(0, at) + run + cell.slice(at);
  return row.replace(cell, filled);
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* --- the signature image -------------------------------------------------- */

/** A run holding one inline image, sized in EMU — 914400 to the inch. */
function drawing(relId: string, docPr: number, box: { width: number; height: number }): string {
  const cx = Math.round(box.width * 914400);
  const cy = Math.round(box.height * 914400);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${docPr}" name="Signature ${docPr}"/><wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${docPr}" name="Signature ${docPr}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

/**
 * How big to draw it, in inches.
 *
 * A signature sits in a table cell, so height is what matters — a third of an
 * inch is about the height of a handwritten name on a form. The width follows
 * the image's own proportions so it is never stretched.
 */
function size(png: Buffer): { width: number; height: number } {
  const { width, height } = pngSize(png);
  const tall = 0.32;
  const wide = height > 0 ? (width / height) * tall : 1.4;
  return { width: Math.min(2, wide), height: tall };
}

/** A PNG says how big it is in the IHDR chunk, which always comes first. */
function pngSize(png: Buffer): { width: number; height: number } {
  try {
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  } catch {
    return { width: 0, height: 0 };
  }
}

function highestRelId(rels: string): number {
  const ids = [...rels.matchAll(/Id="rId(?:Sig)?(\d+)"/g)].map((m) => Number(m[1]));
  return ids.length ? Math.max(...ids) : 0;
}

function highestDocPr(xml: string): number {
  const ids = [...xml.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => Number(m[1]));
  return ids.length ? Math.max(...ids) : 0;
}
