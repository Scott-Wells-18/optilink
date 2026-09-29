"use client";

import { useEffect, useRef } from "react";
import { toHtml, type Block, type RichText, type Run } from "@/lib/safety/richText";

/**
 * A box for writing the scope of works in.
 *
 * Paragraphs, dot points, bold and italics — nothing else, because nothing
 * else survives the trip onto a page of a controlled document. What comes out
 * is the model in `richText.ts` rather than markup: the box reads its own DOM
 * and writes down what it finds, so a paste from Word or an email cannot bring
 * a font, a colour or a table in with it.
 */

export function RichTextBox({
  value,
  onChange,
  placeholder,
}: {
  value: RichText;
  onChange: (next: RichText) => void;
  placeholder?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // What the box last reported. Re-seeding it from a value it just produced
  // would move the caret to the start on every keystroke.
  const mine = useRef<string>("");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wanted = JSON.stringify(value ?? []);
    if (wanted === mine.current) return;
    mine.current = wanted;
    el.innerHTML = toHtml(value);
  }, [value]);

  const report = () => {
    const el = box.current;
    if (!el) return;
    const blocks = read(el);
    mine.current = JSON.stringify(blocks);
    onChange(blocks);
  };

  const command = (name: string) => {
    box.current?.focus();
    document.execCommand(name);
    report();
  };

  return (
    <div className="rich">
      <div className="rich-tools" role="toolbar" aria-label="Formatting">
        <button type="button" className="rich-tool" onMouseDown={hold} onClick={() => command("bold")}>
          <strong>B</strong>
        </button>
        <button type="button" className="rich-tool" onMouseDown={hold} onClick={() => command("italic")}>
          <em>I</em>
        </button>
        <button
          type="button"
          className="rich-tool"
          onMouseDown={hold}
          onClick={() => command("insertUnorderedList")}
        >
          • List
        </button>
      </div>
      <div
        ref={box}
        className="rich-box"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label="Scope of works"
        data-placeholder={placeholder ?? "What is being done on this job?"}
        onInput={report}
        onBlur={report}
        // Plain text only: a paste brings the words, never the styling.
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", undefined, text);
        }}
      />
    </div>
  );
}

/** Keeps the selection where it is while a toolbar button is pressed. */
function hold(event: React.MouseEvent) {
  event.preventDefault();
}

/* --- reading the box ------------------------------------------------------ */

const BLOCKS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);

/**
 * The box's own DOM, written down.
 *
 * Browsers disagree about what a paragraph is inside a contenteditable — a
 * `<div>`, a `<p>`, or a run of text with `<br>` between the lines — and about
 * where a list ends up when one is made: sometimes beside the paragraphs,
 * sometimes wrapped in a div of its own. So the tree is walked rather than
 * skimmed. A list item is a dot point, anything else that is a block is a
 * paragraph, and everything else about the markup is thrown away.
 */
function read(el: HTMLElement): RichText {
  const out: RichText = [];

  const walk = (parent: Node, kind: Block["kind"]) => {
    let inline: Node[] = [];
    const flush = () => {
      if (inline.length === 0) return;
      for (const line of split(inline)) out.push({ kind, runs: merge(line) });
      inline = [];
    };

    for (const child of Array.from(parent.childNodes)) {
      const tag = child.nodeName.toUpperCase();
      if (tag === "UL" || tag === "OL") {
        flush();
        for (const item of Array.from((child as HTMLElement).children)) walk(item, "li");
        continue;
      }
      if (BLOCKS.has(tag)) {
        flush();
        walk(child, tag === "LI" ? "li" : kind);
        continue;
      }
      inline.push(child);
    }
    flush();
    // An empty block is a blank line somebody typed.
    if (parent !== el && !parent.textContent && !(parent as HTMLElement).querySelector?.("ul,ol")) {
      out.push({ kind, runs: [] });
    }
  };

  walk(el, "p");
  while (out.length > 0 && out[out.length - 1].runs.length === 0) out.pop();
  return out;
}

/** The runs of some inline nodes, broken where a <br> breaks them. */
function split(nodes: Node[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const node of nodes) {
    for (const run of runsOf(node)) {
      if (run.text === "\n") lines.push([]);
      else lines[lines.length - 1].push(run);
    }
  }
  return lines.filter((line, index) => line.length > 0 || index === 0);
}

function runsOf(node: Node): Run[] {
  const out: Run[] = [];
  const walk = (current: Node, bold: boolean, italic: boolean) => {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent ?? "";
      if (text) out.push({ text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
      return;
    }
    if (current.nodeName.toUpperCase() === "BR") {
      out.push({ text: "\n" });
      return;
    }
    const element = current as HTMLElement;
    const tag = element.nodeName.toUpperCase();
    const weight = element.style?.fontWeight ?? "";
    const style = element.style?.fontStyle ?? "";
    const nextBold =
      bold || tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600;
    const nextItalic = italic || tag === "I" || tag === "EM" || style === "italic";
    for (const child of Array.from(current.childNodes)) walk(child, nextBold, nextItalic);
  };
  walk(node, false, false);
  return out;
}

/** Neighbouring runs that look the same are one run. */
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && Boolean(last.bold) === Boolean(run.bold) && Boolean(last.italic) === Boolean(run.italic)) {
      last.text += run.text;
      continue;
    }
    out.push({ ...run });
  }
  return out.filter((run) => run.text.length > 0);
}
