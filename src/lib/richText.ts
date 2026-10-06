/**
 * Text that was written with some shape to it, kept so it can be drawn again.
 *
 * Typed once, in a box that does paragraphs, dot points, bold, italic and
 * underline, and it ends up in several places: a page of a PDF, a panel inside
 * somebody else's template, and the screen it was typed on. So it is not kept
 * as HTML. HTML would mean sanitising whatever a browser decided to emit and
 * then parsing it again in a PDF renderer that has no DOM; instead the editor
 * hands back this — a list of paragraphs and dot points, each made of runs of
 * text carrying their own emphasis. It is the smallest thing that survives all
 * of them.
 *
 * It started as the scope of works on a SWMS and is now also what a piece of
 * work is described with, which is why it lives here rather than under safety.
 */

export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};
export type Block = {
  kind: "p" | "li";
  runs: Run[];
  /**
   * Set only while drawing, on the tail of a block that was split over a page
   * break, so the second half of a dot point does not grow a second bullet.
   * Never stored: `clean` rebuilds every block and drops it.
   */
  continued?: boolean;
};
export type RichText = Block[];

const MAX_BLOCKS = 200;
const MAX_RUNS = 80;
const MAX_TEXT = 4000;

/** Whatever arrived, trimmed to something a page can hold. */
export function clean(value: unknown): RichText {
  if (!Array.isArray(value)) return [];
  const out: RichText = [];
  for (const raw of value.slice(0, MAX_BLOCKS)) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Partial<Block>;
    const kind = block.kind === "li" ? "li" : "p";
    const runs: Run[] = [];
    for (const one of Array.isArray(block.runs) ? block.runs.slice(0, MAX_RUNS) : []) {
      if (!one || typeof one !== "object") continue;
      const run = one as Partial<Run>;
      if (typeof run.text !== "string" || run.text.length === 0) continue;
      runs.push({
        text: run.text.slice(0, MAX_TEXT),
        ...(run.bold ? { bold: true } : {}),
        ...(run.italic ? { italic: true } : {}),
        ...(run.underline ? { underline: true } : {}),
      });
    }
    out.push({ kind, runs });
  }
  // Blank lines at the end are the editor's, not the author's.
  while (out.length > 0 && plainOf(out[out.length - 1]) === "") out.pop();
  return out;
}

export function isEmpty(blocks: RichText | null | undefined): boolean {
  return !blocks || blocks.every((block) => plainOf(block) === "");
}

function plainOf(block: Block): string {
  return block.runs.map((run) => run.text).join("").trim();
}

/**
 * The same words with the formatting taken out.
 *
 * For the scope panel the SWMS templates print, which is a box of plain type
 * in a table; a dot point becomes a line starting with a bullet, because that
 * is what somebody writing in that box by hand would do.
 */
export function toPlain(blocks: RichText | null | undefined): string {
  if (!blocks) return "";
  return blocks
    .map((block) => {
      const text = plainOf(block);
      if (!text) return "";
      return block.kind === "li" ? `• ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

/** One line per block, for a summary on screen. */
export function summarise(blocks: RichText | null | undefined, limit = 160): string {
  const plain = toPlain(blocks).replace(/\s+/g, " ").trim();
  return plain.length > limit ? `${plain.slice(0, limit - 1)}…` : plain;
}

/**
 * The editor's own starting content.
 *
 * Only ever built from blocks this module produced, and only ever handed to
 * the editor that produced them, so the tags are ours and there is nothing to
 * sanitise — but the text still gets escaped, because a scope that mentions
 * "<240 V" should say that and not disappear.
 */
export function toHtml(blocks: RichText | null | undefined): string {
  if (!blocks || blocks.length === 0) return "<p><br></p>";
  const out: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.join("")}</ul>`);
    list = null;
  };
  for (const block of blocks) {
    const inner = block.runs.map(runHtml).join("") || "<br>";
    if (block.kind === "li") {
      list ??= [];
      list.push(`<li>${inner}</li>`);
      continue;
    }
    flush();
    out.push(`<p>${inner}</p>`);
  }
  flush();
  return out.join("");
}

function runHtml(run: Run): string {
  let html = escape(run.text);
  if (run.underline) html = `<u>${html}</u>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  return html;
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Plain text, read as rich text.
 *
 * What was typed before there was anywhere to put emphasis, and what arrives
 * from anything that still sends a plain string. Blank lines separate
 * paragraphs and a line opening with a dash or a bullet is a dot point, which
 * is how somebody writes a list in a plain box and expects it to come out as
 * one.
 */
export function fromPlain(text: string | null | undefined): RichText {
  if (!text?.trim()) return [];
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const bullet = /^[-*\u2022]\s+/.exec(trimmed);
      return bullet
        ? { kind: "li" as const, runs: [{ text: trimmed.slice(bullet[0].length) }] }
        : { kind: "p" as const, runs: trimmed ? [{ text: trimmed }] : [] };
    })
    .slice(0, MAX_BLOCKS);
}
