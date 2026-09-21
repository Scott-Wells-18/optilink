/**
 * Working out where the blanks are on a SWMS.
 *
 * The SWMS templates came to us as PDFs whose pages are flat images — no text
 * layer, no form fields, nothing to fill. The blanks are real table cells, but
 * as far as a PDF library is concerned the whole page is a picture.
 *
 * So the pages are read once, here, with OCR: find the printed label, find the
 * table rule to the right of it, and the gap between them is where the value
 * goes. The answer is written out as a manifest of coordinates in PDF points,
 * which the app then uses to stamp text without any of this machinery at
 * runtime — no OCR, no rasteriser, nothing to go wrong on a phone in a depot.
 *
 * Run it again whenever a template is revised:
 *   node scripts/map-templates.mjs <folder-of-pdfs> > src/lib/safety/fields.json
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { PNG } from "pngjs";

const DPI = 200;
/** PDF points per pixel at the DPI the pages are read at. */
const SCALE = 72 / DPI;
const ROOT = process.cwd();

/**
 * What we are looking for, and what it is called in the manifest.
 *
 * `after` is the printed label; the value belongs in the cell to its right.
 * Labels repeat across a page — "Date:" appears three times — so each one
 * also says roughly where on the page it lives.
 */
const PAGE_ONE = [
  // Three cells say "Date:" on page 1, so each is pinned to roughly where it
  // sits on the page: the issue date out to the right of the revision date,
  // and the approval date down in the PCBU block.
  { key: "issueDate", words: ["Date:"], near: { x: [0.72, 0.92], y: [0.14, 0.3] } },
  { key: "approvalDate", words: ["Date:"], near: { x: [0.34, 0.56], y: [0.3, 0.48] } },
];

const PAGE_TWO = [
  { key: "clientName", words: ["Client", "Name:"] },
  { key: "projectName", words: ["Project", "Name:"] },
  { key: "projectAddress", words: ["Project", "Address:"] },
  { key: "submissionDate", words: ["SWMS", "Submission"] },
  { key: "projectManager", words: ["Project", "Manager:"] },
  { key: "contactNumber", words: ["Contact", "Number:"] },
];

/**
 * The consultation table already has both names and both signatures printed
 * in it; only the dates beside them are blank.
 *
 * The rows are found by surname rather than given name: the OCR reads "Scott"
 * as "Sait" often enough that it cannot be relied on, while "Wells" comes back
 * cleanly every time. Two rows, in the order they are printed — Scott, then
 * Kye.
 */
const CONSULT_ROWS = ["Scott", "Kye"];
const CONSULT_SURNAME = "wells";

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error("usage: node scripts/map-templates.mjs <folder-of-pdfs>");
    process.exit(1);
  }

  const worker = await startWorker();
  const out = {};

  for (const file of readdirSync(folder).filter((name) => name.toLowerCase().endsWith(".pdf")).sort()) {
    const full = path.join(folder, file);
    const code = codeOf(file);
    process.stderr.write(`${code} … `);
    try {
      out[code] = await mapOne(worker, full);
      const found = Object.keys(out[code].fields).length;
      process.stderr.write(`${found} fields\n`);
    } catch (error) {
      process.stderr.write(`FAILED — ${error.message}\n`);
    }
  }

  await worker.terminate();
  console.log(JSON.stringify(out, null, 2));
}

/** "OEC-SWMS004B.Main.Switchboard...pdf" → "SWMS004B" */
function codeOf(file) {
  const match = /OEC-((?:SWMS|JSA|WHS)\d+[A-Z]?)/i.exec(file);
  return match ? match[1].toUpperCase() : path.basename(file, ".pdf");
}

async function mapOne(worker, file) {
  const dir = mkdtempSync(path.join(tmpdir(), "swms-"));
  const size = pageSize(file);
  const fields = {};

  // Page 1: the dates, and a date beside each name in the consultation table.
  const one = render(file, 1, dir);
  const wordsOne = await read(worker, one);
  for (const spec of PAGE_ONE) {
    const box = locate(wordsOne, spec, one);
    if (box) fields[spec.key] = place(1, box, one, size, wordsOne);
  }
  // "Date:" appears three times on page 1; the column header in the
  // consultation table is the lowest of them.
  const dateColumn = wordsOne
    .filter((w) => clean(w.text) === "date")
    .sort((a, b) => b.y0 - a.y0)[0];

  if (dateColumn) {
    const rows = wordsOne
      .filter((w) => clean(w.text) === CONSULT_SURNAME && w.y0 > dateColumn.y1)
      .sort((a, b) => a.y0 - b.y0);
    CONSULT_ROWS.forEach((who, index) => {
      const row = rows[index];
      if (!row) return;
      fields[`consultDate${who}`] = {
        page: 1,
        x: round(dateColumn.x0 * SCALE),
        y: round(size.height - row.y1 * SCALE - 1),
        width: round(tableRight(one) * SCALE - dateColumn.x0 * SCALE - 12),
      };
    });
  }

  // Page 2: the client and project block.
  const two = render(file, 2, dir);
  const wordsTwo = await read(worker, two);
  for (const spec of PAGE_TWO) {
    const box = locate(wordsTwo, spec, two);
    if (box) fields[spec.key] = place(2, box, two, size, wordsTwo);
  }

  return { pages: pageCount(file), size, fields };
}

/* --- finding a label ------------------------------------------------------ */

const clean = (text) => text.replace(/[^A-Za-z]/g, "").toLowerCase();

/**
 * The label, as a single box spanning all of its words.
 *
 * A label of several words comes back as several boxes that have to sit on the
 * same line and run left to right — otherwise "Project" from one row and
 * "Name:" from another would pair up into something that is not on the page.
 */
function locate(words, spec, image) {
  const wanted = spec.words.map(clean);
  const first = words.filter((w) => clean(w.text) === wanted[0]);

  for (const start of first) {
    let box = { ...start };
    let ok = true;
    for (const next of wanted.slice(1)) {
      const found = words.find(
        (w) =>
          clean(w.text) === next &&
          Math.abs(w.y0 - box.y0) < 14 &&
          w.x0 >= box.x1 - 4 &&
          w.x0 - box.x1 < 60,
      );
      if (!found) { ok = false; break; }
      box = { x0: box.x0, y0: Math.min(box.y0, found.y0), x1: found.x1, y1: Math.max(box.y1, found.y1) };
    }
    if (!ok) continue;
    if (spec.near && !within(box, spec.near, image)) continue;
    return box;
  }
  return null;
}

function within(box, near, image) {
  const x = (box.x0 + box.x1) / 2 / image.width;
  const y = (box.y0 + box.y1) / 2 / image.height;
  return x >= near.x[0] && x <= near.x[1] && y >= near.y[0] && y <= near.y[1];
}

/* --- where the value goes ------------------------------------------------- */

/**
 * Immediately after the label, and no wider than the space it has.
 *
 * Finding the cell wall by looking for it turned out to be unreliable — the
 * rules are a very pale grey and some are shorter than the row — so the value
 * is set just past the printed label instead, which reads correctly whatever
 * the table is doing underneath.
 *
 * What does have to be exact is the width, because that is what stops a long
 * client name running across the next cell. The right-hand limit is whatever
 * is printed next on the same line, or the far side of the table when the rest
 * of the line is empty.
 */
function place(page, box, image, size, words) {
  const left = box.x1 + 10;
  const right = nextOnRow(box, words) ?? tableRight(image);
  return {
    page,
    x: round(left * SCALE),
    // PDF counts up from the bottom; the raster counts down from the top.
    y: round(size.height - box.y1 * SCALE - 1),
    width: round(Math.max(40, (right - left - 10) * SCALE)),
  };
}

/**
 * The left edge of the next thing printed beside this label, if there is one.
 *
 * Anything to the right whose own band overlaps the label's is a candidate,
 * and the leftmost of them is the bound. Testing one scanline through the
 * label's middle is not enough: where the neighbouring cell holds a paragraph,
 * that middle can fall in the gap between two of its lines, so only a stray
 * descender qualifies — and the bound lands a whole column too far right.
 */
function nextOnRow(box, words) {
  let bound = null;
  for (const word of words) {
    if (word.x0 <= box.x1 + 4) continue;
    if (word.y1 <= box.y0 - 2 || word.y0 >= box.y1 + 2) continue;
    if (bound === null || word.x0 < bound) bound = word.x0;
  }
  return bound;
}

/**
 * The outer edge of the table, as the longest vertical rule on the page. Only
 * the outer frame runs the height of the page, which is exactly what is wanted
 * as a backstop.
 */
function tableRight(image) {
  if (image.tableRight !== undefined) return image.tableRight;
  let found = image.width;
  for (let x = image.width - 2; x > image.width / 2; x -= 1) {
    let run = 0;
    let best = 0;
    for (let y = 0; y < image.height; y += 1) {
      if (grey(image, x, y) < 248) { run += 1; best = Math.max(best, run); } else run = 0;
    }
    if (best > image.height * 0.25) { found = x; break; }
  }
  image.tableRight = found;
  return found;
}

function grey(image, x, y) {
  const at = (image.width * y + x) << 2;
  return (image.data[at] * 299 + image.data[at + 1] * 587 + image.data[at + 2] * 114) / 1000;
}

const round = (n) => Math.round(n * 10) / 10;

/* --- the plumbing --------------------------------------------------------- */

function render(file, page, dir) {
  const stem = path.join(dir, `p${page}`);
  execFileSync("pdftoppm", ["-png", "-r", String(DPI), "-f", String(page), "-l", String(page), file, stem]);
  const made = readdirSync(dir).find((name) => name.startsWith(`p${page}-`));
  const full = path.join(dir, made);
  // The pixels for finding table rules, and the file itself for the OCR —
  // re-encoding the image to hand it over only risks corrupting it.
  const image = PNG.sync.read(readFileSync(full));
  image.file = full;
  return image;
}

function pageSize(file) {
  const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
  const match = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function pageCount(file) {
  const info = execFileSync("pdfinfo", [file], { encoding: "utf8" });
  return Number(/Pages:\s+(\d+)/.exec(info)[1]);
}

async function read(worker, image) {
  const { data } = await worker.recognize(image.file, {}, { blocks: true });
  const words = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          words.push({ text: word.text, ...word.bbox });
        }
      }
    }
  }
  return words;
}

async function startWorker() {
  const workerPath = path.join(ROOT, "node_modules/tesseract.js/src/worker-script/node/index.js");
  return createWorker("eng", 1, {
    langPath: path.join(ROOT, "tessdata"),
    workerPath: existsSync(workerPath) ? workerPath : undefined,
    gzip: true,
    cachePath: path.join(ROOT, ".tesseract"),
    logger: () => {},
  });
}

await main();
