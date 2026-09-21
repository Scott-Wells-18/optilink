import JSZip from "jszip";

/**
 * Reading a JSA out of the Word document it was written in.
 *
 * The company's JSAs are complete: every task, hazard, consequence, likelihood,
 * mitigation and residual rating was written and approved by a person. None of
 * that is rewritten anywhere — it is read out here, word for word, with the
 * cell widths and the colour each cell was shaded, so the PDF that gets issued
 * is their document rather than a summary of it.
 */

export type Cell = {
  text: string;
  /** "FF0000" — the shading Word holds, or null for none. */
  fill: string | null;
  /** Width in twentieths of a point, as the document states it. */
  width: number;
  bold: boolean;
};

export type Row = { cells: Cell[] };

export type Jsa = {
  /** "ELECTRICAL EQUIPMENT & CABLING JSA RISK ASSESSMENT" */
  title: string;
  /** The coding legend, and anything else above the risk table. */
  intro: Row[];
  /** The risk table's column headings. */
  headings: Cell[];
  /** One row per task. */
  tasks: Row[];
  /** The line above the signatory blocks. */
  signatoryNote: string;
  /** How many blocks there are to sign. */
  signatoryCount: number;
};

export async function readJsa(docx: Buffer): Promise<Jsa | null> {
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return null;

  // Read table by table, so a row's widths can come off its own table's grid.
  const rows: Row[] = [];
  for (const table of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []) {
    const grid = [...(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/.exec(table)?.[0] ?? "").matchAll(
      /w:w="(\d+)"/g,
    )].map((match) => Number(match[1]));
    for (const row of table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []) {
      rows.push(readRow(row, grid));
    }
  }

  // The risk table is the wide one; everything before it is the legend.
  const wide = rows.filter((row) => row.cells.length === 10);
  if (wide.length < 2) return null;
  const firstWide = rows.findIndex((row) => row.cells.length === 10);

  const signatoryRows = rows.filter(
    (row) => row.cells.length === 8 && /full name/i.test(row.cells[0]?.text ?? ""),
  );

  const outsideTables = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, "");
  const title =
    (outsideTables.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [])
      .map(textOf)
      .find((line) => line.trim().length > 4) ?? "JSA Risk Assessment";

  const note =
    rows
      .map((row) => row.cells[0]?.text ?? "")
      .find((line) => /signed and dated/i.test(line)) ?? "";

  return {
    title: clean(title),
    intro: rows.slice(0, firstWide).filter((row) => row.cells.length > 0),
    headings: wide[0].cells,
    tasks: wide.slice(1),
    signatoryNote: clean(note),
    signatoryCount: signatoryRows.length,
  };
}

/* --- the parts ------------------------------------------------------------ */

/**
 * A row, with each cell's width worked out.
 *
 * Word states a width on the cell sometimes and leaves it to the table's grid
 * the rest of the time, and a cell that spans two grid columns says so rather
 * than adding the two up. So the grid is walked alongside the cells and the
 * spanned columns summed — which is the difference between a table whose
 * columns are the ones the document was laid out with and ten equal ones.
 */
function readRow(xml: string, grid: number[]): Row {
  const cells = xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
  let column = 0;
  return {
    cells: cells.map((cell) => {
      const span = Number(/<w:gridSpan[^>]*w:val="(\d+)"/.exec(cell)?.[1] ?? 1);
      const fromGrid = grid
        .slice(column, column + span)
        .reduce((total, width) => total + width, 0);
      column += span;
      return readCell(cell, fromGrid);
    }),
  };
}

function readCell(xml: string, fromGrid: number): Cell {
  const properties = /<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(xml)?.[0] ?? "";
  const fill = /<w:shd[^>]*w:fill="([0-9A-Fa-f]{6})"/.exec(properties)?.[1] ?? null;
  const stated = Number(/<w:tcW[^>]*w:w="(\d+)"/.exec(properties)?.[1] ?? 0);
  return {
    text: clean(textOf(xml)),
    // Word writes "no shading" as auto or as white; neither is worth painting.
    fill: fill && fill.toUpperCase() !== "FFFFFF" ? `#${fill}` : null,
    width: fromGrid || stated || 1000,
    bold: /<w:b\s*\/>|<w:b w:val="(?:1|true|on)"/.test(xml),
  };
}

/**
 * A cell's words.
 *
 * Paragraph breaks inside a cell are kept as line breaks — a mitigation cell
 * is often several sentences and reads as a wall without them.
 */
function textOf(xml: string): string {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [xml];
  return paragraphs
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)]
        .map((match) => (match[1] === undefined ? " " : match[1]))
        .join(""),
    )
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function clean(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}
