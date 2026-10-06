import { COLOURS, safe } from "@/lib/report/theme";
import type { Block, RichText, Run } from "@/lib/richText";
import type { Doc } from "@/lib/report/furniture";

/**
 * Written text, drawn on a page the way it was written.
 *
 * Paragraphs, dot points, bold, italic and underline. pdfkit has no concept of
 * a block, so a paragraph is a run of `continued` draws and a dot point is the
 * same with a bullet in the margin and the text indented behind it.
 *
 * Measuring and drawing are separate because the reports that use this lay
 * their pages out before they draw them: a piece of work has to know how tall
 * its description is before it can decide which page it starts on. Both walk
 * the blocks the same way, so what is measured is what lands.
 */

export const BULLET_INDENT = 14;

type Shape = { size: number; lineGap: number; gap: number };

const DEFAULTS: Shape = { size: 9.5, lineGap: 1, gap: 3 };

function fontFor(run: Run): string {
  if (run.bold && run.italic) return "Helvetica-BoldOblique";
  if (run.bold) return "Helvetica-Bold";
  if (run.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

/** How tall this text will be at this width. */
export function measureRich(
  doc: Doc,
  blocks: RichText,
  width: number,
  shape: Partial<Shape> = {},
): number {
  const { size, lineGap, gap } = { ...DEFAULTS, ...shape };
  let total = 0;

  for (const block of blocks) {
    const indent = block.kind === "li" ? BULLET_INDENT : 0;
    const runs = block.runs.filter((run) => run.text.length > 0);

    // An empty block is a blank line somebody typed, and it is kept: a
    // description written with a gap between two paragraphs should come out
    // with a gap between two paragraphs.
    if (runs.length === 0) {
      total += (size + lineGap) * 0.6;
      continue;
    }

    /*
     * Measured as one string rather than run by run.
     *
     * Runs wrap into each other — "replace the **board**" is one sentence
     * across three runs — so measuring each separately and adding them up
     * counts a line break at every boundary and comes out far too tall. The
     * widths differ a little between bold and regular, so the whole string is
     * measured in the heaviest font any of its runs uses, which errs long.
     */
    const text = runs.map((run) => run.text).join("");
    const heaviest = runs.some((run) => run.bold && run.italic)
      ? "Helvetica-BoldOblique"
      : runs.some((run) => run.bold)
        ? "Helvetica-Bold"
        : runs.some((run) => run.italic)
          ? "Helvetica-Oblique"
          : "Helvetica";
    doc.font(heaviest).fontSize(size);
    total += doc.heightOfString(safe(text), { width: width - indent, lineGap }) + gap;
  }

  return total;
}

/**
 * Draw it, and hand back the y it finished at.
 *
 * A paragraph is one run of `continued` draws, and only the first of them says
 * where it starts. The later ones must not: pdfkit resets `doc.x` to the block
 * edge once a call finishes and keeps the continuation point of its own, so
 * reading the position back and passing it in put every underline under the
 * first few words of the paragraph instead of under the words that were
 * underlined.
 */
export function drawRich(
  doc: Doc,
  blocks: RichText,
  x: number,
  y: number,
  width: number,
  shape: Partial<Shape> = {},
): number {
  const { size, lineGap, gap } = { ...DEFAULTS, ...shape };
  let top = y;

  for (const block of blocks) {
    const indent = block.kind === "li" ? BULLET_INDENT : 0;
    const runs = block.runs.filter((run) => run.text.length > 0);

    if (runs.length === 0) {
      top += (size + lineGap) * 0.6;
      continue;
    }

    // The bullet belongs to the start of a dot point, not to the half of one
    // that carried over onto the next page.
    if (block.kind === "li" && !block.continued) {
      doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(size);
      doc.text("•", x + 2, top, { width: 10, lineBreak: false });
    }

    doc.fillColor(COLOURS.ink);
    runs.forEach((run, index) => {
      doc.font(fontFor(run)).fontSize(size);
      const options = {
        width: width - indent,
        continued: index < runs.length - 1,
        lineGap,
        underline: Boolean(run.underline),
      };
      if (index === 0) doc.text(safe(run.text), x + indent, top, options);
      else doc.text(safe(run.text), options);
    });

    top = doc.y + gap;
  }

  return top;
}

/**
 * One block, cut into pieces none of which is taller than `limit`.
 *
 * A description is laid out a block at a time so it can flow down a page and
 * onto the next, which handles everything anyone actually types. What it does
 * not handle is a single paragraph longer than a whole page — a wall of text
 * pasted in with no line breaks — and a block taller than the page it is on
 * has nowhere to go: it used to be drawn anyway, straight through the footer.
 *
 * So an over-long block is cut at a word boundary, as many times as it takes.
 * The runs are walked rather than the text, so a word that happens to be bold
 * stays bold on whichever side of the break it lands.
 */
export function splitBlock(
  doc: Doc,
  block: Block,
  width: number,
  limit: number,
  shape: Partial<Shape> = {},
): Block[] {
  if (limit <= 0) return [block];
  if (measureRich(doc, [block], width, shape) <= limit) return [block];

  const out: Block[] = [];
  let runs: Run[] = [];
  let carried = false;

  /** The piece built so far, as a block. */
  const sofar = (): Block => ({
    kind: block.kind,
    runs,
    ...(carried ? { continued: true } : {}),
  });

  const flush = () => {
    if (runs.length === 0) return;
    out.push(sofar());
    runs = [];
    carried = true;
  };

  for (const run of block.runs) {
    // Split on the spaces, keeping them, so rebuilt text reads as it was typed.
    for (const word of run.text.split(/(\s+)/)) {
      if (!word) continue;
      const last = runs[runs.length - 1];
      const same =
        last &&
        Boolean(last.bold) === Boolean(run.bold) &&
        Boolean(last.italic) === Boolean(run.italic) &&
        Boolean(last.underline) === Boolean(run.underline);

      const before = last?.text;
      if (same) last.text += word;
      else runs.push({ ...run, text: word });

      if (measureRich(doc, [sofar()], width, shape) > limit) {
        // One word too far: take it back off and start the next piece with it.
        if (same && before !== undefined) last.text = before;
        else runs.pop();
        // A single word wider than the limit would otherwise loop for ever.
        if (runs.length === 0) {
          out.push({ kind: block.kind, runs: [{ ...run, text: word }], ...(carried ? { continued: true } : {}) });
          carried = true;
          continue;
        }
        flush();
        runs.push({ ...run, text: word.replace(/^\s+/, "") });
      }
    }
  }
  flush();
  return out.length > 0 ? out : [block];
}
