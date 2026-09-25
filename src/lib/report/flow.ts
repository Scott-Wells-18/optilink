import { footer, sectionBar, type Doc, type PageMeta } from "@/lib/report/furniture";
import { MARGIN, PAGE } from "@/lib/report/theme";

/**
 * Laying a report out before drawing any of it.
 *
 * Two problems keep coming back and they have the same answer. A contents page
 * has to cite the page a section actually lands on, which cannot be known until
 * everything before it has been measured. And a block of text whose height
 * nobody measured runs off the bottom of its box, or off the page.
 *
 * So a report is declared as sections of measured pieces. This packs them onto
 * pages, remembers where everything landed, and only then plays the drawing
 * back. A piece is drawn at the y it was measured into, so it cannot overflow
 * what was reserved for it, and `pageOf` is the truth the contents page cites.
 */

/** One thing to draw, and how tall it is. */
export type Piece = {
  height: number;
  /** Drawn at the y this piece was packed into, on the page it landed on. */
  draw: (y: number) => void;
  /**
   * Remembered in `pageOf` under this name, so the contents can cite the page
   * this piece landed on.
   */
  mark?: string;
  /**
   * Keep this piece with what follows: a heading is no use alone at the foot
   * of a page. The value is how much of what follows has to fit with it.
   */
  keepWith?: number;
  /**
   * Start a page here whatever room is left on this one.
   *
   * For what has to begin at the top of a page because of what it is rather
   * than because of how tall it is — a numbered item of work, which reads as
   * its own thing and should not start halfway down under somebody else's
   * photographs. Nothing happens where the page is empty already.
   */
  breakBefore?: boolean;
  /** Named so a section can recognise its own pieces — see `repeat`. */
  tag?: string;
};

export type Section = {
  /** Cited by the contents page. */
  id: string;
  /** The bar across the top of the section's first page. */
  title: string;
  pieces: Piece[];
  /**
   * Asked, at the top of every page the section carries on to, whether
   * anything has to be drawn again before `next` — a table's column headings,
   * so a table split across a page break keeps them. Returning null, as it
   * should when the page does not open mid-table, costs nothing.
   */
  repeat?: (next: Piece) => Piece | null;
};

/** The lowest a piece may reach: the footer lives below this. */
export const BOTTOM = PAGE.height - 82;
/** How far below the section bar the first piece starts. */
export const AFTER_BAR = 34;

/**
 * How much room a page has for pieces.
 *
 * A section's first page gives up the top of itself to the bar naming the
 * section; every page after it starts at the margin. Anything sizing itself
 * to the page — a grid of photographs, which is as tall as it is allowed to
 * be — has to ask rather than assume.
 */
export function pageRoom(underBar: boolean): number {
  return BOTTOM - MARGIN - (underBar ? AFTER_BAR : 0);
}

type Placed = { piece: Piece; y: number };
type Page = { title: string | null; items: Placed[] };

export type Layout = {
  pages: Page[];
  /** Section id, and each piece's mark, to the page it landed on. */
  pageOf: Record<string, number>;
  /** How many pages the sections take, all told. */
  count: number;
};

/**
 * Packs the sections onto pages.
 *
 * `firstPage` is the page number the first section starts on — reports open
 * with a cover and a contents page that are drawn separately, so the sections
 * do not start at one.
 */
export function layout(sections: Section[], firstPage: number): Layout {
  const pages: Page[] = [];
  const pageOf: Record<string, number> = {};

  for (const section of sections) {
    // Every section opens a page of its own, so the reader never has to hunt
    // for where one stops and the next starts.
    let page: Page = { title: section.title, items: [] };
    let y = MARGIN + AFTER_BAR;
    pageOf[section.id] = firstPage + pages.length;

    const turn = (next: Piece) => {
      pages.push(page);
      page = { title: null, items: [] };
      y = MARGIN;
      const carried = section.repeat?.(next);
      if (carried) {
        page.items.push({ piece: carried, y });
        y += carried.height;
      }
    };

    for (const [index, piece] of section.pieces.entries()) {
      // A heading has to bring some of its section with it or it is stranded.
      const needs =
        piece.height +
        section.pieces
          .slice(index + 1, index + 1 + (piece.keepWith ?? 0))
          .reduce((total, next) => total + next.height, 0);

      if (page.items.length > 0 && (piece.breakBefore || y + needs > BOTTOM)) turn(piece);

      page.items.push({ piece, y });
      if (piece.mark) pageOf[piece.mark] = firstPage + pages.length;
      y += piece.height;
    }

    pages.push(page);
  }

  return { pages, pageOf, count: pages.length };
}

/** Plays a layout back onto the document. */
export function render(doc: Doc, meta: PageMeta, laid: Layout) {
  for (const page of laid.pages) {
    doc.addPage();
    if (page.title) sectionBar(doc, page.title, MARGIN);
    for (const { piece, y } of page.items) piece.draw(y);
    footer(doc, meta);
  }
}

/* --- measuring ------------------------------------------------------------ */

/**
 * A run of body text, measured at the font it will be drawn in.
 *
 * pdfkit measures against whatever font is currently set, so the font is set
 * here rather than trusted to be whatever the last caller left behind — that
 * mismatch is exactly how text ends up taller than the box drawn for it.
 */
export function measureText(
  doc: Doc,
  text: string,
  options: { width: number; size?: number; font?: string; lineGap?: number },
): number {
  doc.font(options.font ?? "Helvetica").fontSize(options.size ?? 10);
  return doc.heightOfString(text, {
    width: options.width,
    lineGap: options.lineGap ?? 2,
  });
}
