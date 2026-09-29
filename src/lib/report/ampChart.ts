import { COLOURS } from "@/lib/report/theme";
import { clock, trim } from "@/lib/amps/parse";
import type { AmpSample } from "@/lib/amps/parse";
import type { Excursion } from "@/lib/amps/summary";

/**
 * A minute of current, drawn a second at a time.
 *
 * Every sample is on the page. Nothing is grouped, averaged into a window or
 * smoothed through: the whole point of clamping a circuit for a minute is the
 * second it spiked, and a chart that tidies that away answers a question nobody
 * asked. The line is drawn straight between samples for the same reason — a
 * curve through sampled points invents readings between them, and on a chart
 * that is read against a protective device's rating an invented reading is a
 * wrong answer.
 *
 * One series, so no legend: the page is named after the circuit. Where a device
 * rating was entered the line above it turns red, and the crossing is put where
 * the readings actually cross rather than at the next sample — a reading of
 * 18 A followed a second later by 24 A passed 20 A somewhere in between. The
 * stretches above the rating are also banded behind the plot, because a single
 * second above the line is a hairline on the page and a hairline is easy to
 * miss.
 */

type Doc = PDFKit.PDFDocument;

export type ChartBox = { x: number; y: number; width: number; height: number };

export type AmpChartSpec = {
  samples: AmpSample[];
  from: number;
  to: number;
  /** The top of the current scale. */
  maxAmps: number;
  /** The protective device's rating, where one was entered. */
  rating: number | null;
  /** What the threshold line is called — "20 A circuit breaker". */
  ratingLabel?: string;
  /** The average across the whole recording, recorded zeros included. */
  average: number;
  peak: { amps: number; at: number } | null;
  excursions: Excursion[];
};

/** How solid the band under the line is. */
const UNDER = 0.16;
/** And the band above the rating, which has to carry further. */
const OVER = 0.3;

export function drawAmpChart(doc: Doc, box: ChartBox, spec: AmpChartSpec) {
  const at = place(box, spec);

  bands(doc, box, spec, at);
  grid(doc, box, spec, at);

  const pieces = segments(spec.samples, spec.rating);
  fills(doc, box, spec, at, pieces);
  lines(doc, spec, at, pieces);
  markers(doc, spec, at);

  averageLine(doc, box, spec, at);
  if (spec.rating !== null) ratingLine(doc, box, spec, at);
  if (spec.peak) markPeak(doc, box, spec, at);

  // The axes last, so a line that runs along zero does not sit on top of them.
  doc.lineWidth(0.8).strokeColor(COLOURS.inkSoft);
  doc.moveTo(box.x, box.y).lineTo(box.x, box.y + box.height).stroke();
  doc
    .moveTo(box.x, box.y + box.height)
    .lineTo(box.x + box.width, box.y + box.height)
    .stroke();
  doc.lineWidth(1).strokeColor("#000000").fillColor(COLOURS.ink);
}

/* --- where things go ------------------------------------------------------ */

type Place = { x: (at: number) => number; y: (amps: number) => number };

function place(box: ChartBox, spec: AmpChartSpec): Place {
  const span = Math.max(1, spec.to - spec.from);
  const top = Math.max(spec.maxAmps, 0.1);
  return {
    x: (at: number) => box.x + ((at - spec.from) / span) * box.width,
    y: (amps: number) =>
      box.y + box.height - (Math.min(Math.max(amps, 0), top) / top) * box.height,
  };
}

/* --- the frame ------------------------------------------------------------ */

function grid(doc: Doc, box: ChartBox, spec: AmpChartSpec, at: Place) {
  doc.lineWidth(0.4).strokeColor(COLOURS.hair);
  for (const amps of ampSteps(spec.maxAmps)) {
    const y = at.y(amps);
    doc.moveTo(box.x, y).lineTo(box.x + box.width, y).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(trim(amps), box.x - 34, y - 4, { width: 29, align: "right", lineBreak: false });
  }

  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
  doc.text("CURRENT (A)", box.x - 34, box.y - 15, { characterSpacing: 1.1, lineBreak: false });

  for (const tick of timeSteps(spec.from, spec.to)) {
    const x = at.x(tick);
    doc.lineWidth(0.35).strokeColor("#eef2f6");
    doc.moveTo(x, box.y).lineTo(x, box.y + box.height).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(COLOURS.inkSoft);
    doc.text(clock(tick), x - 22, box.y + box.height + 6, {
      width: 44,
      align: "center",
      lineBreak: false,
    });
  }

  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
  doc.text("TIME (HH:MM:SS)", box.x, box.y + box.height + 19, {
    width: box.width,
    align: "center",
    characterSpacing: 1.1,
    lineBreak: false,
  });

  doc.lineWidth(1).strokeColor("#000000");
}

/** The stretches above the rating, banded so a one-second peak is visible. */
function bands(doc: Doc, box: ChartBox, spec: AmpChartSpec, at: Place) {
  if (spec.excursions.length === 0) return;
  doc.save();
  doc.fillOpacity(0.07);
  for (const run of spec.excursions) {
    const from = at.x(run.from);
    const width = Math.max(1.6, at.x(run.to) - from);
    doc.rect(from, box.y, width, box.height).fill(COLOURS.alert);
  }
  doc.restore();
  doc.fillOpacity(1);
}

/* --- the readings --------------------------------------------------------- */

type Point = { at: number; amps: number };
type Segment = { above: boolean; points: Point[] };

/**
 * The readings, cut where they cross the rating.
 *
 * The crossing point is worked out between the two samples either side of it
 * and belongs to both segments, so the colour changes exactly on the rating
 * and the line stays unbroken across it.
 */
export function segments(samples: AmpSample[], rating: number | null): Segment[] {
  if (samples.length === 0) return [];
  if (rating === null) return [{ above: false, points: samples.map(point) }];

  const out: Segment[] = [];
  let current: Segment = { above: samples[0].amps > rating, points: [point(samples[0])] };

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const sample = samples[index];
    const above = sample.amps > rating;
    if (above === current.above) {
      current.points.push(point(sample));
      continue;
    }
    const span = sample.amps - previous.amps;
    const share = span === 0 ? 0 : (rating - previous.amps) / span;
    const crossing: Point = {
      at: previous.at + Math.min(1, Math.max(0, share)) * (sample.at - previous.at),
      amps: rating,
    };
    current.points.push(crossing);
    out.push(current);
    current = { above, points: [crossing, point(sample)] };
  }

  out.push(current);
  return out;
}

function point(sample: AmpSample): Point {
  return { at: sample.at, amps: sample.amps };
}

/**
 * The bands under the line.
 *
 * Blue up to the rating and red from the rating to the reading, rather than
 * one colour all the way down: a block of red under a single peak reads as
 * though the whole circuit was overloaded, when what happened is that one
 * second went over.
 */
function fills(doc: Doc, box: ChartBox, spec: AmpChartSpec, at: Place, pieces: Segment[]) {
  const baseline = box.y + box.height;
  const rating = spec.rating;

  doc.save();
  doc.fillOpacity(UNDER);
  for (const piece of pieces) {
    if (piece.points.length < 2) continue;
    // Below the rating everywhere, so the blue band is the part of the
    // reading the device is happy with.
    const under = piece.points.map((entry) => ({
      at: entry.at,
      amps: rating === null ? entry.amps : Math.min(entry.amps, rating),
    }));
    polygon(doc, at, under, baseline);
    doc.fillColor(COLOURS.accent).fill();
  }
  doc.restore();

  if (rating !== null) {
    doc.save();
    doc.fillOpacity(OVER);
    for (const piece of pieces) {
      if (!piece.above || piece.points.length < 2) continue;
      polygon(doc, at, piece.points, at.y(rating));
      doc.fillColor(COLOURS.alert).fill();
    }
    doc.restore();
  }
  doc.fillOpacity(1);
}

function polygon(doc: Doc, at: Place, points: Point[], baseline: number) {
  doc.moveTo(at.x(points[0].at), baseline);
  for (const entry of points) doc.lineTo(at.x(entry.at), at.y(entry.amps));
  doc.lineTo(at.x(points[points.length - 1].at), baseline);
  doc.closePath();
}

function lines(doc: Doc, spec: AmpChartSpec, at: Place, pieces: Segment[]) {
  doc.lineJoin("round").lineCap("round");
  for (const piece of pieces) {
    const colour = piece.above ? COLOURS.alert : COLOURS.accent;
    if (piece.points.length === 1) {
      doc.circle(at.x(piece.points[0].at), at.y(piece.points[0].amps), 1.4).fill(colour);
      continue;
    }
    doc.lineWidth(piece.above ? 1.9 : 1.5).strokeColor(colour);
    doc.moveTo(at.x(piece.points[0].at), at.y(piece.points[0].amps));
    for (const entry of piece.points.slice(1)) doc.lineTo(at.x(entry.at), at.y(entry.amps));
    doc.stroke();
  }
  doc.lineWidth(1).strokeColor("#000000");
}

/** A dot on each sample, where there are few enough for them to mean anything. */
function markers(doc: Doc, spec: AmpChartSpec, at: Place) {
  if (spec.samples.length > 150) return;
  for (const sample of spec.samples) {
    const above = spec.rating !== null && sample.amps > spec.rating;
    doc.circle(at.x(sample.at), at.y(sample.amps), 1.5).fill(above ? COLOURS.alert : COLOURS.accent);
  }
  doc.fillColor(COLOURS.ink);
}

/* --- the reference lines -------------------------------------------------- */

function averageLine(doc: Doc, box: ChartBox, spec: AmpChartSpec, at: Place) {
  const y = at.y(spec.average);
  doc.lineWidth(0.8).strokeColor(COLOURS.inkSoft).dash(3, { space: 3 });
  doc.moveTo(box.x, y).lineTo(box.x + box.width, y).stroke();
  doc.undash();

  const text = `AVERAGE ${trim(round2(spec.average))} A`;
  doc.font("Helvetica-Bold").fontSize(6.5);
  const width = doc.widthOfString(text) + 8;
  const left = box.x + box.width - width;
  // Above its own line, unless that is off the top of the plot or would sit on
  // the rating's label — an average a little under the rating is common, and
  // two labels on top of each other is two labels nobody can read.
  const rating = spec.rating === null ? null : at.y(spec.rating);
  const clash = rating !== null && Math.abs(rating - y) < 13;
  const top = y - 11 > box.y && !clash ? y - 11 : y + 2.5;
  doc.save();
  doc.fillOpacity(0.88);
  doc.rect(left, top, width, 9.5).fill("#ffffff");
  doc.restore();
  doc.fillOpacity(1);
  doc.fillColor(COLOURS.inkSoft).text(text, left + 4, top + 2, { lineBreak: false });
  doc.lineWidth(1).strokeColor("#000000").fillColor(COLOURS.ink);
}

function ratingLine(doc: Doc, box: ChartBox, spec: AmpChartSpec, at: Place) {
  const rating = spec.rating as number;
  const y = at.y(rating);

  doc.lineWidth(1).strokeColor(COLOURS.alert).dash(4, { space: 2.5 });
  doc.moveTo(box.x, y).lineTo(box.x + box.width, y).stroke();
  doc.undash();

  const text = spec.ratingLabel ?? `${trim(rating)} A`;
  doc.font("Helvetica-Bold").fontSize(6.5);
  const width = doc.widthOfString(text) + 9;
  const top = y - 11 > box.y ? y - 11 : y + 2.5;
  doc.save();
  doc.fillOpacity(0.92);
  doc.rect(box.x + 2, top, width, 9.5).fill("#ffffff");
  doc.restore();
  doc.fillOpacity(1);
  doc.rect(box.x + 2, top, 2, 9.5).fill(COLOURS.alert);
  doc.fillColor(COLOURS.alert).text(text, box.x + 8, top + 2, { lineBreak: false });
  doc.lineWidth(1).strokeColor("#000000").fillColor(COLOURS.ink);
}

/** The highest reading of the recording, ringed and written out. */
function markPeak(doc: Doc, box: ChartBox, spec: AmpChartSpec, at: Place) {
  const peak = spec.peak as { amps: number; at: number };
  const x = at.x(peak.at);
  const y = at.y(peak.amps);
  const colour = spec.rating !== null && peak.amps > spec.rating ? COLOURS.alert : COLOURS.accent;

  doc.lineWidth(0.7).strokeColor(COLOURS.inkSoft).dash(2, { space: 2.5 });
  doc.moveTo(x, y).lineTo(x, box.y + box.height).stroke();
  doc.undash();

  doc.lineWidth(2).strokeColor("#ffffff");
  doc.circle(x, y, 4).stroke();
  doc.lineWidth(1.4).strokeColor(colour);
  doc.circle(x, y, 4).stroke();

  const text = `${trim(peak.amps)} A  ·  ${clock(peak.at)}`;
  doc.font("Helvetica-Bold").fontSize(7.5);
  const width = doc.widthOfString(text) + 14;
  // Flipped to the left where the peak is near the right-hand edge.
  const right = x + 10 + width < box.x + box.width;
  const left = right ? x + 10 : x - 10 - width;
  const top = Math.max(box.y + 2, y - 26);

  doc.roundedRect(left, top, width, 15, 4).fillAndStroke("#ffffff", colour);
  doc.fillColor(COLOURS.ink).text(text, left + 7, top + 4, { lineBreak: false });
  doc.lineWidth(1).strokeColor("#000000");
}

/* --- the scales ----------------------------------------------------------- */

/**
 * Gridlines on numbers a person would choose — 5, 10, 20, 25 — rather than the
 * maximum divided by six.
 */
export function ampSteps(max: number): number[] {
  const target = Math.max(max, 0.1) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 0.01)));
  const step =
    [1, 2, 2.5, 5, 10].map((multiple) => multiple * magnitude).find((value) => value >= target) ??
    magnitude * 10;

  const out: number[] = [];
  for (let amps = 0; amps <= max + step / 2; amps += step) out.push(round2(amps));
  return out;
}

/**
 * The top of the scale.
 *
 * Above every reading and above the rating, so the threshold is always on the
 * page even where nothing went near it, with a little air over the highest
 * reading so its callout has somewhere to sit.
 */
export function ampScaleTop(max: number, rating: number | null): number {
  const wanted = Math.max(max * 1.08, rating === null ? 0 : rating * 1.15, 1);
  const steps = ampSteps(wanted);
  return steps[steps.length - 1];
}

/** The seconds a person would put a tick on. */
const TICKS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

function timeSteps(from: number, to: number): number[] {
  const span = Math.max(1000, to - from);
  const wanted = span / 1000 / 7;
  const step = (TICKS.find((value) => value >= wanted) ?? TICKS[TICKS.length - 1]) * 1000;

  const out: number[] = [];
  // Started on a round multiple of the step so the ticks land on whole
  // seconds, minutes or hours rather than on the moment the clamp went on.
  for (let at = Math.ceil(from / step) * step; at <= to; at += step) out.push(at);
  if (out.length === 0) out.push(from, to);
  return out;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
