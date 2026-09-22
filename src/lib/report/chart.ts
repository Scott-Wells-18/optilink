import { COLOURS } from "@/lib/report/theme";
import { CHANNEL_LABELS, SERIES, type Channel } from "@/lib/power/channels";
import type { Sample } from "@/lib/power/parse";

export { SERIES };

/**
 * A week of current readings, drawn.
 *
 * Four traces on one axis: the three phases and the neutral, overlaid so they
 * can be compared against each other, which is the only reason to put them on
 * the same chart. One scale for every page of a recording, so week two is
 * read against week one rather than against itself.
 *
 * The colours are the first four slots of the validated categorical palette,
 * assigned in that order and never cycled. Two of them sit under 3:1 against
 * white, so every trace is also labelled at its right-hand end and every peak
 * is written out in a table beneath the chart — identity is never colour alone.
 */

type Doc = PDFKit.PDFDocument;

const DAY = 86_400_000;

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
};

export function drawChart(doc: Doc, box: ChartBox, spec: ChartSpec) {
  const { x, y, width, height } = box;

  grid(doc, box, spec);
  for (const channel of spec.channels) trace(doc, box, spec, channel);
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

/* --- the traces ----------------------------------------------------------- */

function trace(doc: Doc, box: ChartBox, spec: ChartSpec, channel: Channel) {
  const points = decimate(box, spec, channel);
  if (points.length === 0) return;

  doc.lineWidth(0.7).strokeColor(SERIES[channel]).lineJoin("round").lineCap("round");
  doc.moveTo(points[0][0], points[0][1]);
  for (const [px, py] of points.slice(1)) doc.lineTo(px, py);
  doc.stroke();
  doc.lineWidth(1).strokeColor("#000000");
}

/**
 * The trace, at the resolution the page can actually show.
 *
 * A fortnight at five-minute intervals is four thousand readings across seven
 * hundred points of paper, so most of them land on top of each other. Each
 * column of the plot is reduced to its lowest and its highest reading, in the
 * order they occurred — which is what an oscilloscope does, and it is the one
 * reduction that cannot lose a peak. Averaging would, and a power analysis is
 * read for its peaks.
 */
function decimate(box: ChartBox, spec: ChartSpec, channel: Channel): [number, number][] {
  const span = spec.to - spec.from;
  const toX = (at: number) => box.x + ((at - spec.from) / span) * box.width;
  const toY = (amps: number) =>
    box.y + box.height - (Math.min(amps, spec.maxAmps) / spec.maxAmps) * box.height;

  const columns = new Map<number, { first: Sample; low: Sample; high: Sample; last: Sample }>();
  for (const sample of spec.samples) {
    const amps = sample[channel];
    if (amps === null) continue;
    const column = Math.round(toX(sample.at));
    const held = columns.get(column);
    if (!held) {
      columns.set(column, { first: sample, low: sample, high: sample, last: sample });
      continue;
    }
    held.last = sample;
    if (amps < (held.low[channel] ?? Infinity)) held.low = sample;
    if (amps > (held.high[channel] ?? -Infinity)) held.high = sample;
  }

  const out: [number, number][] = [];
  for (const column of [...columns.keys()].sort((a, b) => a - b)) {
    const { first, low, high, last } = columns.get(column)!;
    // In the order they happened, so the line enters and leaves the column
    // where the readings actually did.
    const ordered = [first, low, high, last]
      .filter((sample, index, all) => all.indexOf(sample) === index)
      .sort((a, b) => a.at - b.at);
    for (const sample of ordered) out.push([column, toY(sample[channel] ?? 0)]);
  }
  return out;
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
  const span = spec.to - spec.from;
  const x = box.x + ((peak.at - spec.from) / span) * box.width;
  const y = box.y + box.height - (Math.min(peak.amps, spec.maxAmps) / spec.maxAmps) * box.height;

  // A dropped line to the axis, so the moment is readable off the dates.
  doc.lineWidth(0.6).strokeColor(SERIES[peak.channel]).dash(2, { space: 2 });
  doc.moveTo(x, y).lineTo(x, box.y + box.height).stroke();
  doc.undash();

  doc.lineWidth(1.6).strokeColor("#ffffff");
  doc.circle(x, y, 4.2).stroke();
  doc.lineWidth(1.2).strokeColor(SERIES[peak.channel]);
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

/* --- the legend ----------------------------------------------------------- */

export function legend(doc: Doc, x: number, y: number, channels: Channel[], names: string[]) {
  let at = x;
  channels.forEach((channel, index) => {
    doc.rect(at, y + 1.5, 16, 2.4).fill(SERIES[channel]);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.ink);
    doc.text(CHANNEL_LABELS[channel], at + 21, y - 1.5, { lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    const note = names[index];
    doc.text(note, at + 21 + doc.widthOfString(CHANNEL_LABELS[channel]) + 6, y - 1, {
      lineBreak: false,
    });
    at +=
      21 +
      doc.widthOfString(CHANNEL_LABELS[channel]) +
      6 +
      doc.widthOfString(note) +
      22;
  });
  doc.fillColor(COLOURS.ink);
}
