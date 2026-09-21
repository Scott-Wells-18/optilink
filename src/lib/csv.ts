/**
 * Reading a CSV the way a spreadsheet wrote it.
 *
 * Small enough to keep rather than take a dependency for, and it has to be
 * written properly rather than split on commas: a quote's job description is
 * exactly the field most likely to contain a comma, a line break or a quoted
 * measurement, and splitting on commas turns all three into wrong answers.
 *
 * Follows RFC 4180 — fields may be quoted, a doubled quote inside a quoted
 * field is a literal quote, and a quoted field may run over several lines.
 */

/** Delimiters worth guessing between. Semicolons come out of European Excel. */
const DELIMITERS = [",", ";", "\t", "|"] as const;

export function parseCsv(text: string, delimiter?: string): string[][] {
  const body = strip(text);
  const sep = delimiter ?? sniff(body);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let at = 0; at < body.length; at += 1) {
    const char = body[at];

    if (quoted) {
      if (char !== '"') {
        field += char;
        continue;
      }
      // A doubled quote is one literal quote; a single one ends the field.
      if (body[at + 1] === '"') {
        field += '"';
        at += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      continue;
    }
    if (char === sep) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

/** A BOM and Windows line endings, taken off before anything else looks. */
function strip(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/**
 * Which character separates the fields.
 *
 * The one that appears most consistently across the first few lines wins:
 * counting totals would let a single description full of commas outvote the
 * semicolons actually holding the file together.
 */
function sniff(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim()).slice(0, 10);
  if (lines.length === 0) return ",";

  let best = ",";
  let bestScore = -1;
  for (const candidate of DELIMITERS) {
    const counts = lines.map((line) => outsideQuotes(line, candidate));
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total === 0) continue;
    const mean = total / counts.length;
    const spread = counts.reduce((sum, count) => sum + Math.abs(count - mean), 0) / counts.length;
    const score = mean - spread * 2;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** How many times it appears on a line, ignoring anything inside quotes. */
function outsideQuotes(line: string, char: string): number {
  let count = 0;
  let quoted = false;
  for (let at = 0; at < line.length; at += 1) {
    if (line[at] === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && line[at] === char) count += 1;
  }
  return count;
}

/**
 * A CSV rendered as the lines a person would read.
 *
 * A row holding a label and its value becomes "Label: value", so the same
 * heading patterns that find things in a PDF quote find them here too.
 * Anything wider is a table row, and its cells are joined so they stay on one
 * line rather than reading as separate facts.
 */
export function asLines(rows: string[][]): string {
  return rows
    .map((cells) => {
      const filled = cells.filter((cell) => cell !== "");
      if (filled.length === 0) return "";
      if (filled.length === 2) return `${filled[0]}: ${filled[1]}`;
      return filled.join("  |  ");
    })
    .filter(Boolean)
    .join("\n");
}
