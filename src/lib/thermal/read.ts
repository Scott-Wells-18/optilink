import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Reading the temperatures a thermal camera burns into its own image.
 *
 * Every camera writes the same shape of overlay — a label, an equals sign and
 * a reading, like "S1:T=54.1°C" and "R1 max=105.1°C" — alongside a colour
 * scale down one edge. The equals sign is the thing to hang off: scale-bar
 * numbers never have one, so it separates the readings that mean something
 * from the ruler beside them.
 *
 * The overlay is thin coloured text over a busy palette, and no single way of
 * flattening it to greyscale catches every colour: magenta on dark purple
 * disappears in a plain conversion but stands out in the blue channel, and
 * vice versa. So the image is read a few different ways and the answers are
 * voted on.
 */

export type Reading = {
  refTemp: number | null;
  hotTemp: number | null;
  /** What each pass made of it, for when the answer looks wrong. */
  text: string[];
};

const LANG_PATH = path.join(process.cwd(), "tessdata");

/**
 * Pointed at explicitly: the worker is started by absolute path, and the path
 * the library works out for itself is relative to the bundle rather than to
 * where the package actually lives.
 */
function workerPath(): string | undefined {
  const candidates = [
    path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
    path.join(
      process.cwd(),
      "node_modules/.pnpm/node_modules/tesseract.js/src/worker-script/node/index.js",
    ),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}
/** Big enough for small overlay text, small enough to stay quick. */
const TARGET_WIDTH = 2200;

let workerPromise: Promise<Worker> | null = null;

/** One worker for the life of the process — starting one costs seconds. */
function worker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const instance = await createWorker("eng", 1, {
      langPath: LANG_PATH,
      workerPath: workerPath(),
      gzip: true,
      cachePath: path.join(process.cwd(), ".tesseract"),
      logger: () => {},
    });
    // Sparse-but-uniform: the overlay is a handful of short lines, not prose.
    await instance.setParameters({ tessedit_pageseg_mode: "6" as never });
    return instance;
  })();
  return workerPromise;
}

async function passes(image: Buffer): Promise<Buffer[]> {
  const meta = await sharp(image).metadata();
  const width = Math.min(TARGET_WIDTH, Math.max(meta.width ?? TARGET_WIDTH, 700) * 3);
  const base = () => sharp(image).removeAlpha().resize({ width, kernel: "lanczos3" });
  return Promise.all([
    base().greyscale().normalise().negate().sharpen().png().toBuffer(),
    base().extractChannel("blue").normalise().sharpen().png().toBuffer(),
    base().greyscale().normalise().sharpen().png().toBuffer(),
  ]);
}

export async function readTemperatures(image: Buffer): Promise<Reading> {
  const instance = await worker();
  const refVotes = new Map<number, number>();
  const hotVotes = new Map<number, number>();
  const text: string[] = [];

  for (const buffer of await passes(image)) {
    let line = "";
    try {
      const { data } = await instance.recognize(buffer);
      line = (data.text ?? "").replace(/\s+/g, " ").trim();
    } catch {
      continue;
    }
    text.push(line);

    const found = parseReadings(line);
    if (found.hot !== null) hotVotes.set(found.hot, (hotVotes.get(found.hot) ?? 0) + 1);
    if (found.ref !== null) refVotes.set(found.ref, (refVotes.get(found.ref) ?? 0) + 1);
  }

  const hot = winner(hotVotes);
  let ref = winner(refVotes);
  // A reference at or above the hot spot is a misread, not a finding.
  if (hot !== null && ref !== null && ref >= hot) ref = null;

  return { refTemp: ref, hotTemp: hot, text };
}

/* --- reading one pass ----------------------------------------------------- */

type Candidate = {
  value: number;
  marker: "max" | "min" | "plain";
  /** Whether something that reads like a camera's label sits in front of it. */
  labelled: boolean;
};

export function parseReadings(line: string): { ref: number | null; hot: number | null } {
  // The colour scale is a run of evenly stepped numbers. Whichever way the
  // readings are found, none of them are on that ruler.
  const scale = new Set(scaleBarValues(line));
  const anchored = anchoredCandidates(line).filter((entry) => !scale.has(entry.value));
  const candidates = anchored.length > 0 ? anchored : looseCandidates(line, scale);
  if (candidates.length === 0) return { ref: null, hot: null };
  // Without an equals sign, at least one reading has to be named — otherwise
  // this is a picture of a colour scale and nothing more.
  if (anchored.length === 0 && !candidates.some((entry) => entry.labelled)) {
    return { ref: null, hot: null };
  }

  const maxes = candidates.filter((entry) => entry.marker === "max");
  const others = candidates.filter((entry) => entry.marker !== "max");

  if (maxes.length > 0) {
    const hot = Math.max(...maxes.map((entry) => entry.value));
    const rest = others.length > 0 ? others : candidates.filter((entry) => entry.value !== hot);
    const ref = rest.length > 0 ? Math.min(...rest.map((entry) => entry.value)) : null;
    return { ref, hot };
  }

  const values = candidates.map((entry) => entry.value);
  const hot = Math.max(...values);
  const cooler = values.filter((value) => value !== hot);
  return { ref: cooler.length > 0 ? Math.min(...cooler) : null, hot };
}

/** Every reading on the line, in the order they were read. */
function allValues(line: string) {
  return [...line.matchAll(/(-?\d{1,3}[.,]\d{1,2})\s*°?\s*[cCfF]?/g)]
    .map((match) => ({ value: toNumber(match[1]), index: match.index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null);
}

/**
 * A reading written the way a camera writes it: a label, an equals sign, a
 * number. Only the equals sign counts — a colon turns up in enough misreads
 * of the scale bar to be worth nothing.
 */
function anchoredCandidates(line: string): Candidate[] {
  const out: Candidate[] = [];
  const pattern = /([^\s]{0,14}?)\s*=\s*(-?\d{1,3}[.,]\d{1,2})/g;
  for (const match of line.matchAll(pattern)) {
    const value = toNumber(match[2]);
    if (value === null) continue;
    const before = (
      line.slice(Math.max(0, match.index - 18), match.index) + match[1]
    ).toLowerCase();
    out.push({ value, marker: markerIn(before), labelled: true });
  }
  return out;
}

/**
 * Nothing had an equals sign, so fall back to every reading on the image with
 * the colour scale taken out of it — that scale is a long, evenly stepped run
 * of numbers, which is exactly what makes it recognisable.
 */
function looseCandidates(line: string, scale: Set<number>): Candidate[] {
  return allValues(line)
    .filter((entry) => !scale.has(entry.value))
    .map((entry) => {
      const before = line.slice(Math.max(0, entry.index - 18), entry.index).toLowerCase();
      return { value: entry.value, marker: markerIn(before), labelled: LABEL.test(before) };
    });
}

/** How the cameras name a spot or a box: Sp1, S1, Bx1, AR1, M1, R1, Ref. */
const LABEL = /(sp|bx|ar|m|r|s)\s*\d{0,2}\s*(max|min)?\s*[:=]?\s*$|(ref|cent(re|er)|max|min)\s*[:=]?\s*$/i;

/**
 * The colour scale is a ladder: a run of readings evenly spaced from top to
 * bottom. Finding the rung spacing and then everything sitting on it survives
 * the readings being recognised out of order, which they often are.
 */
function scaleBarValues(line: string): number[] {
  const values = [...new Set(allValues(line).map((entry) => entry.value))].sort(
    (a, b) => a - b,
  );
  if (values.length < 5) return [];

  const gaps: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const gap = values[index] - values[index - 1];
    if (gap > 0.2) gaps.push(gap);
  }
  if (gaps.length < 4) return [];

  // The spacing most of the gaps agree on, give or take a rounding.
  const sorted = [...gaps].sort((a, b) => a - b);
  const step = sorted[Math.floor(sorted.length / 2)];
  if (step <= 0.2) return [];

  let ladder: number[] = [];
  for (const base of values) {
    const on = values.filter((value) => {
      const rungs = (value - base) / step;
      return Math.abs(rungs - Math.round(rungs)) <= 0.12;
    });
    if (on.length > ladder.length) ladder = on;
  }
  return ladder.length >= 5 ? ladder : [];
}

function markerIn(context: string): Candidate["marker"] {
  if (/ma?x|hi(gh)?/.test(context)) return "max";
  if (/mi?n|lo(w)?/.test(context)) return "min";
  return "plain";
}

function toNumber(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(",", "."));
  // Anything outside this is a misread, not a switchboard.
  if (!Number.isFinite(value) || value < -40 || value > 1200) return null;
  return Math.round(value * 10) / 10;
}

function winner(votes: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of votes) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
