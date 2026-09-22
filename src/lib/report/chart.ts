import { COLOURS } from "@/lib/report/theme";
import { CHANNEL_LABELS, SERIES, type Channel } from "@/lib/power/channels";
import type { Sample } from "@/lib/power/parse";

export { SERIES };

/**
 * A week of current readings, drawn as overlapping filled areas.
 *
 * Four traces on one axis: the three phases and the neutral, laid over each
 * other so they can be compared, which is the only reason to put them on the
 * same chart. One scale for every page of a recording, so week two is read
 * against week one rather than against itself.
 *
 * The colours are the first four slots of the validated categorical palette,
 * assigned in that order and never cycled. Two of them sit under 3:1 against
 * white, so every trace is also labelled at its right-hand end and every peak
 * written out beneath the chart — identity is never colour alone.
 */

type Doc = PDFKit.PDFDocument;

const DAY = 86_400_000;
const MINUTE = 60_000;

/**
 * How much of the surface a fill lets through.
 *
 * The look being matched is two areas at half opacity, where the overlap
 * covers about three quarters of the surface. Four areas at a half would cover
 * ninety-four per cent of it — a solid block, which is the opposite of the
 * look. Four at three tenths lands back on that same three quarters, so the
 * overlaps read the way they do on a two-series chart.
 *
 * The fills are drawn largest-first so a smaller one is never buried, and each
 * line is stroked back over the top at full strength: the fills carry the
 * shape, the lines carry the identity.
 */
const FILL_OPACITY = 0.3;

/**
 * The same look with nothing to overlap.
 *
 * On a chart carrying one conductor there is no second layer to compound with,
 * so the half that the overlapping chart could not afford is exactly right.
 */
export const SOLO_FILL_OPACITY = 0.5;

export type ChartBox = { x: number; y: number; width: number; height: number };

export type ChartSpec = {
  from: number;
  to: number;
  /** The top of the scale, shared by every page of the recording. */
  maxAmps: number;
  samples: Sample[];
  channels: Channel[];
  /** Labelled every this many days; every day gets a rule regardless. */
  labelEveryDays: number;
  /**
   * How solid the fills are. Four traces over each other need a third each to
   * land on the look of two at a half; one trace on its own is that look
   * already, so a single-conductor chart passes the half straight through.
   */
  fillOpacity?: number;
};

export function drawChart(doc: Doc, box: ChartBox, spec: ChartSpec) {
  const { x, y, width, height } = box;
  const window = windowFor(spec);

  grid(doc, box, spec);

  // Largest area at the back, so a smaller one is never buried under it.
  const curves = spec.channels
    .map((channel) => ({ channel, runs: resample(spec, channel, window) }))
    .map((entry) => ({ ...entry, weight: weigh(entry.runs) }))
    .sort((a, b) => b.weight - a.weight);

  for (const { channel, runs } of curves) fill(doc, box, spec, channel, runs);
  for (const { channel, runs } of curves) stroke(doc, box, spec, channel, runs);

  endLabels(doc, box, spec);

  // The axes last, so a trace that runs to zero does not sit on top of them.
  doc.lineWidth(0.8).strokeColor(COLOURS.inkSoft);
  doc.moveTo(x, y).lineTo(x, y + height).stroke();
  doc.moveTo(x, y + height).lineTo(x + width, y + height).stroke();
  doc.lineWidth(1).strokeColor("#000000");
}

/* --- the frame ------------------------------------------------------------ */

function grid(doc: Doc, box: ChartBox, spec: ChartSpec) {
  const { x, y, width, height } = box;
  const steps = niceSteps(spec.maxAmps);

  doc.lineWidth(0.4).strokeColor(COLOURS.hair);
  for (const amps of steps) {
    const at = y + height - (amps / spec.maxAmps) * height;
    doc.moveTo(x, at).lineTo(x + width, at).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(`${amps}`, x - 36, at - 4, { width: 31, align: "right", lineBreak: false });
  }

  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
  doc.text("CURRENT (A)", x - 36, y - 16, { characterSpacing: 1.2, lineBreak: false });

  // A rule on every day boundary; a date under every third one, as asked.
  for (let at = spec.from; at <= spec.to + 1; at += DAY) {
    const across = x + ((at - spec.from) / (spec.to - spec.from)) * width;
    const days = Math.round((at - spec.from) / DAY);
    const labelled = days % spec.labelEveryDays === 0;

    doc.lineWidth(labelled ? 0.5 : 0.35).strokeColor(labelled ? COLOURS.hair : "#eef2f6");
    doc.moveTo(across, y).lineTo(across, y + height).stroke();

    if (!labelled || across > x + width + 1) continue;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(shortDay(at), across - 18, y + height + 6, {
      width: 36,
      align: "center",
      lineBreak: false,
    });
  }

  doc.lineWidth(1).strokeColor("#000000");
}

/** "07/09" — the date a tick is, in the order it is written on site. */
function shortDay(at: number): string {
  const date = new Date(at);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * A scale that lands on round numbers.
 *
 * Six or so gridlines, stepping by something a person would choose — 5, 10, 20,
 * 25, 50 — rather than by the maximum divided by six.
 */
function niceSteps(max: number): number[] {
  const target = max / 6;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 1)));
  const step =
    [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude).find((value) => value >= target) ??
    magnitude * 10;

  const out: number[] = [];
  for (let amps = 0; amps <= max + step / 2; amps += step) out.push(Math.round(amps));
  return out;
}

/** The top of the scale: above every reading, and on a round number. */
export function scaleTop(maxReading: number): number {
  const steps = niceSteps(Math.max(maxReading, 1));
  return steps[steps.length - 1];
}

/* --- from readings to a curve --------------------------------------------- */

type Point = { at: number; amps: number };
/** A stretch of continuous readings. A gap in the logging starts a new one. */
type Run = Point[];

/** The windows a person would choose, in minutes. */
const WINDOWS = [5, 10, 15, 20, 30, 60, 120, 180, 360];

/**
 * How wide a window to take the readings in.
 *
 * Aimed at roughly a point every four points of paper: closer than that and
 * neighbouring readings sit on top of each other and the line is a band of
 * noise; further apart and a real event starts getting skipped over. A week
 * lands on the hour, which is also the unit a person thinks in.
 *
 * Never finer than the logger's own interval — there is nothing in between.
 */
function windowFor(spec: ChartSpec): number {
  const minutes = (spec.to - spec.from) / MINUTE / 180;
  return (WINDOWS.find((value) => value >= minutes) ?? WINDOWS[WINDOWS.length - 1]) * MINUTE;
}

/**
 * The readings, one window at a time.
 *
 * The **highest** reading in each window, never the average. On a recording of
 * maximum demand the average is the one number nobody asked for, and averaging
 * is what removes the peak the whole exercise exists to find — the highest
 * reading of the fortnight survives this untouched, and so does the moment it
 * happened.
 *
 * A window the logger recorded nothing in ends the run, so a gap in the
 * logging shows as a gap rather than a straight line drawn across it.
 */
function resample(spec: ChartSpec, channel: Channel, window: number): Run[] {
  const runs: Run[] = [];
  let run: Run = [];

  for (let from = spec.from; from < spec.to; from += window) {
    const to = from + window;
    let highest: number | null = null;
    for (const sample of spec.samples) {
      if (sample.at < from || sample.at >= to) continue;
      const amps = sample[channel];
      if (amps === null) continue;
      if (highest === null || amps > highest) highest = amps;
    }

    if (highest === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      continue;
    }
    run.push({ at: from + window / 2, amps: highest });
  }

  if (run.length > 0) runs.push(run);
  return runs;
}

/** Roughly how much of the plot a channel covers, for the drawing order. */
function weigh(runs: Run[]): number {
  return runs.reduce(
    (total, run) => total + run.reduce((sum, point) => sum + point.amps, 0),
    0,
  );
}

/* --- drawing it ----------------------------------------------------------- */

function place(box: ChartBox, spec: ChartSpec) {
  const span = spec.to - spec.from;
  return {
    x: (at: number) => box.x + ((at - spec.from) / span) * box.width,
    y: (amps: number) =>
      box.y + box.height - (Math.min(amps, spec.maxAmps) / spec.maxAmps) * box.height,
  };
}

function fill(doc: Doc, box: ChartBox, spec: ChartSpec, channel: Channel, runs: Run[]) {
  const to = place(box, spec);
  const baseline = box.y + box.height;

  doc.save();
  doc.fillOpacity(spec.fillOpacity ?? FILL_OPACITY);
  for (const run of runs) {
    if (run.length < 2) continue;
    const points = run.map((point) => [to.x(point.at), to.y(point.amps)] as const);
    doc.moveTo(points[0][0], baseline);
    doc.lineTo(points[0][0], points[0][1]);
    curve(doc, points);
    doc.lineTo(points[points.length - 1][0], baseline);
    doc.closePath();
    doc.fillColor(SERIES[channel]).fill();
  }
  doc.restore();
  doc.fillOpacity(1);
}

function stroke(doc: Doc, box: ChartBox, spec: ChartSpec, channel: Channel, runs: Run[]) {
  const to = place(box, spec);

  doc.lineWidth(1.1).strokeColor(SERIES[channel]).lineJoin("round").lineCap("round");
  for (const run of runs) {
    const points = run.map((point) => [to.x(point.at), to.y(point.amps)] as const);
    if (points.length === 1) {
      doc.circle(points[0][0], points[0][1], 0.9).fill(SERIES[channel]);
      continue;
    }
    doc.moveTo(points[0][0], points[0][1]);
    curve(doc, points);
    doc.stroke();
  }
  doc.lineWidth(1).strokeColor("#000000");
}

/**
 * A smooth line through the points, without inventing anything between them.
 *
 * Catmull-Rom, which passes through every point rather than near it, converted
 * to the cubic curves a PDF draws. The control points are held inside each
 * segment's own range, which is what stops a curve overshooting a peak and
 * drawing a higher reading than was ever taken — or dipping below zero after a
 * sharp fall, which on a current chart is nonsense.
 */
function curve(doc: Doc, points: readonly (readonly [number, number])[]) {
  for (let at = 0; at < points.length - 1; at += 1) {
    const previous = points[at === 0 ? at : at - 1];
    const start = points[at];
    const end = points[at + 1];
    const next = points[at + 2 < points.length ? at + 2 : at + 1];

    const lowY = Math.min(start[1], end[1]);
    const highY = Math.max(start[1], end[1]);
    const clamp = (value: number) => Math.max(lowY, Math.min(highY, value));

    doc.bezierCurveTo(
      start[0] + (end[0] - previous[0]) / 6,
      clamp(start[1] + (end[1] - previous[1]) / 6),
      end[0] - (next[0] - start[0]) / 6,
      clamp(end[1] - (next[1] - start[1]) / 6),
      end[0],
      end[1],
    );
  }
}

/**
 * The name of each trace at the end of it.
 *
 * Two of the four palette slots sit under 3:1 on white, which obliges a label
 * rather than leaving identity to the colour. Labels that would overlap are
 * pushed apart, because four traces at the same current is exactly the case
 * this chart exists to show.
 */
function endLabels(doc: Doc, box: ChartBox, spec: ChartSpec) {
  // One trace needs no label at its end: the page it is on is named after it.
  if (spec.channels.length < 2) return;
  const span = spec.to - spec.from;
  const placed: { channel: Channel; y: number }[] = [];

  for (const channel of spec.channels) {
    const last = [...spec.samples].reverse().find((sample) => sample[channel] !== null);
    if (!last) continue;
    const amps = Math.min(last[channel] ?? 0, spec.maxAmps);
    placed.push({
      channel,
      y: box.y + box.height - (amps / spec.maxAmps) * box.height,
    });
  }

  placed.sort((a, b) => a.y - b.y);
  for (let at = 1; at < placed.length; at += 1) {
    const gap = placed[at].y - placed[at - 1].y;
    if (gap < 9) placed[at].y = placed[at - 1].y + 9;
  }

  const last = spec.samples[spec.samples.length - 1];
  const x = last
    ? Math.min(box.x + ((last.at - spec.from) / span) * box.width, box.x + box.width)
    : box.x + box.width;

  for (const entry of placed) {
    doc.rect(x + 4, entry.y - 2.5, 5, 5).fill(SERIES[entry.channel]);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.ink);
    doc.text(CHANNEL_LABELS[entry.channel], x + 12, entry.y - 4, { lineBreak: false });
  }
}

/* --- the peak, called out ------------------------------------------------- */

export function markPeak(
  doc: Doc,
  box: ChartBox,
  spec: ChartSpec,
  peak: { channel: Channel; amps: number; at: number },
) {
  const to = place(box, spec);
  const x = to.x(peak.at);
  const y = to.y(peak.amps);

  // A dropped line to the axis, so the moment is readable off the dates.
  doc.lineWidth(0.8).strokeColor(COLOURS.inkSoft).dash(2, { space: 2.5 });
  doc.moveTo(x, y).lineTo(x, box.y + box.height).stroke();
  doc.undash();

  doc.lineWidth(2).strokeColor("#ffffff");
  doc.circle(x, y, 4.2).stroke();
  doc.lineWidth(1.4).strokeColor(SERIES[peak.channel]);
  doc.circle(x, y, 4.2).stroke();
  doc.lineWidth(1).strokeColor("#000000");

  const text = `${round(peak.amps)} A  ·  ${CHANNEL_LABELS[peak.channel]}  ·  ${when(peak.at)}`;
  doc.font("Helvetica-Bold").fontSize(7.5);
  const width = doc.widthOfString(text) + 14;
  // Flipped to the left where the peak is near the right-hand edge, so the
  // callout never runs off the plot.
  const right = x + 10 + width < box.x + box.width;
  const boxX = right ? x + 10 : x - 10 - width;
  const boxY = Math.max(box.y + 2, y - 26);

  doc.roundedRect(boxX, boxY, width, 15, 4).fillAndStroke("#ffffff", SERIES[peak.channel]);
  doc.fillColor(COLOURS.ink).text(text, boxX + 7, boxY + 4, { lineBreak: false });
}

/* --- every day's own peak, called out ------------------------------------- */

export type DayPeak = {
  /** Midnight at the start of the day. */
  day: number;
  amps: number;
  at: number;
};

/**
 * The highest reading on each calendar day of a chart's span.
 *
 * Taken off the raw readings rather than off the drawn curve, so the figure
 * and the moment are the logger's own. A day the logger recorded nothing on is
 * left out entirely rather than reported as zero.
 */
export function dailyPeaks(
  samples: Sample[],
  channel: Channel,
  from: number,
  to: number,
): DayPeak[] {
  const best = new Map<number, DayPeak>();

  for (const sample of samples) {
    if (sample.at < from || sample.at >= to) continue;
    const amps = sample[channel];
    if (amps === null) continue;
    const day = Math.floor(sample.at / DAY) * DAY;
    const held = best.get(day);
    if (!held || amps > held.amps) best.set(day, { day, amps, at: sample.at });
  }

  return [...best.values()].sort((a, b) => a.day - b.day);
}

/**
 * Each day's highest reading, marked where it happened.
 *
 * A week holds seven of these and they have to read as a set rather than as
 * seven callout boxes fighting each other, so the mark is small and the figure
 * sits directly above it: a dropped line to the axis, a ringed dot on the
 * reading, and the current over the top. The day that carried the week's own
 * highest is drawn heavier and keeps its time, because that is the one number
 * the page exists to deliver.
 *
 * Labels that would collide with the top of the plot are dropped underneath
 * their dot instead, which is always clear — a peak near the ceiling has
 * nothing but its own curve below it.
 */
export function markDays(
  doc: Doc,
  box: ChartBox,
  spec: ChartSpec,
  channel: Channel,
  peaks: DayPeak[],
) {
  if (peaks.length === 0) return;
  const to = place(box, spec);
  const colour = SERIES[channel];
  const highest = peaks.reduce((best, peak) => (peak.amps > best.amps ? peak : best), peaks[0]);

  for (const peak of peaks) {
    const x = to.x(peak.at);
    const y = to.y(peak.amps);
    const best = peak === highest;

    doc.lineWidth(best ? 0.8 : 0.5).strokeColor(best ? COLOURS.inkSoft : COLOURS.hair);
    doc.dash(2, { space: 2.5 });
    doc.moveTo(x, y).lineTo(x, box.y + box.height).stroke();
    doc.undash();

    doc.lineWidth(2).strokeColor("#ffffff");
    doc.circle(x, y, best ? 4 : 2.8).stroke();
    doc.lineWidth(best ? 1.5 : 1.1).strokeColor(colour);
    doc.circle(x, y, best ? 4 : 2.8).stroke();
    if (best) doc.circle(x, y, 1.5).fill(colour);

    const text = `${round(peak.amps)} A`;
    doc.font("Helvetica-Bold").fontSize(best ? 8 : 7);
    const width = doc.widthOfString(text);
    const above = y - 14 > box.y;
    const labelY = above ? y - 13 : y + 7;

    // A plate behind the figure, so it stays readable over the fill.
    doc.save();
    doc.fillOpacity(0.86);
    doc.rect(x - width / 2 - 3, labelY - 1.5, width + 6, 10).fill("#ffffff");
    doc.restore();
    doc.fillOpacity(1);

    doc.fillColor(best ? colour : COLOURS.ink);
    doc.text(text, x - width / 2, labelY, { lineBreak: false });

    if (!best) continue;
    const stamp = when(peak.at).slice(6);
    doc.font("Helvetica").fontSize(6.5).fillColor(COLOURS.inkSoft);
    const stampWidth = doc.widthOfString(stamp);
    doc.text(stamp, x - stampWidth / 2, above ? labelY - 8 : labelY + 10, { lineBreak: false });
  }

  doc.lineWidth(1).strokeColor("#000000").fillColor(COLOURS.ink);
}

/** "Mon 07/09" — the day a peak fell on, the way a week is read. */
export function dayName(at: number): string {
  const date = new Date(at);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${names[date.getUTCDay()]} ${day}/${month}`;
}

export function when(at: number): string {
  const date = new Date(at);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month} ${hour}:${minute}`;
}

export function round(amps: number): string {
  return Number.isInteger(amps) ? String(amps) : amps.toFixed(1);
}

/** How the chart was drawn, so the page can say it in a line. */
export function describeWindow(spec: ChartSpec): string {
  const minutes = windowFor(spec) / MINUTE;
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}-hour`;
  }
  return `${minutes}-minute`;
}

/* --- the legend ----------------------------------------------------------- */

export function legend(doc: Doc, x: number, y: number, channels: Channel[], names: string[]) {
  let at = x;
  channels.forEach((channel, index) => {
    // A swatch at the fill's own strength with the line over it, so the key
    // looks like the thing it is a key to.
    doc.save();
    doc.fillOpacity(FILL_OPACITY);
    doc.rect(at, y - 2, 16, 8).fill(SERIES[channel]);
    doc.restore();
    doc.fillOpacity(1);
    doc.rect(at, y - 2, 16, 1.4).fill(SERIES[channel]);

    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.ink);
    doc.text(CHANNEL_LABELS[channel], at + 21, y - 1.5, { lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    const note = names[index];
    doc.text(note, at + 21 + doc.widthOfString(CHANNEL_LABELS[channel]) + 6, y - 1, {
      lineBreak: false,
    });
    at +=
      21 + doc.widthOfString(CHANNEL_LABELS[channel]) + 6 + doc.widthOfString(note) + 22;
  });
  doc.fillColor(COLOURS.ink);
}
