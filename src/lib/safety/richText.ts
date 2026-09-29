/**
 * The scope of works, as something that can be written and then drawn.
 *
 * The scope is typed once, in a box that does paragraphs, dot points, bold and
 * italics, and it ends up in three places: a new first page on every document,
 * the scope panel the SWMS templates leave blank, and the screen it was typed
 * on. So it is not kept as HTML. HTML would mean sanitising whatever a browser
 * decided to emit and then parsing it again in a PDF renderer that has no DOM;
 * instead the editor hands back this — a list of paragraphs and dot points,
 * each made of runs of text that are bold, italic, both or neither. It is the
 * smallest thing that survives all three.
 */

export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Block = { kind: "p" | "li"; runs: Run[] };
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
