import type { AmpSample } from "@/lib/amps/parse";

/**
 * What one recording came to.
 *
 * The figures a person actually asks about a minute of current: how many
 * readings, over what period, the highest one and when it happened, and the
 * average across the whole recording — zeros included, because a circuit that
 * sat idle for half the recording did draw nothing for half the recording and
 * an average taken over only the busy seconds says something different.
 *
 * Where a protective device's rating was entered, the stretches that ran above
 * it are worked out here too, with their edges taken between the samples rather
 * than at them: a reading of 18 A followed a second later by 24 A crossed 20 A
 * somewhere in between, and saying so is closer to the truth than either
 * pretending the crossing happened at the second sample or ignoring it.
 */

/** What the rating belongs to. The two are protected and read differently. */
export const DEVICES = ["BREAKER", "RCBO"] as const;
export type Device = (typeof DEVICES)[number];

export const DEVICE_LABELS: Record<Device, string> = {
  BREAKER: "Circuit breaker",
  RCBO: "RCBO / RCD",
};

export const DEVICE_NOTES: Record<Device, string> = {
  BREAKER: "A circuit breaker (MCB or MCCB) protecting the circuit.",
  RCBO:
    "An RCBO or an RCD. Enter its current rating in amps — not the residual-current rating in milliamps, which is a different thing entirely.",
};

export type Excursion = {
  /** When the reading crossed above the rating, interpolated between samples. */
  from: number;
  /** When it came back to or below it. */
  to: number;
  /** How long that ran, in seconds, as observed. */
  seconds: number;
  /** The highest reading inside it, and when. */
  peak: number;
  peakAt: number;
  /** How many recorded samples sat above the rating inside it. */
  samples: number;
};

export type Figures = {
  count: number;
  from: number;
  to: number;
  /** How long the recording ran, in seconds, first sample to last. */
  seconds: number;
  max: number;
  maxAt: number;
  min: number;
  /** Across the whole recording, recorded zeros included. */
  average: number;
  /** How many readings were exactly zero. */
  zeros: number;
  /** Only where a rating was entered. */
  rating: number | null;
  above: number;
  excursions: Excursion[];
};

export function summariseAmps(samples: AmpSample[], rating: number | null): Figures | null {
  if (samples.length === 0) return null;

  let max = samples[0].amps;
  let maxAt = samples[0].at;
  let min = samples[0].amps;
  let total = 0;
  let zeros = 0;

  for (const sample of samples) {
    if (sample.amps > max) {
      max = sample.amps;
      maxAt = sample.at;
    }
    if (sample.amps < min) min = sample.amps;
    if (sample.amps === 0) zeros += 1;
    total += sample.amps;
  }

  const from = samples[0].at;
  const to = samples[samples.length - 1].at;

  return {
    count: samples.length,
    from,
    to,
    seconds: (to - from) / 1000,
    max,
    maxAt,
    min,
    average: total / samples.length,
    zeros,
    rating,
    above: rating === null ? 0 : samples.filter((sample) => sample.amps > rating).length,
    excursions: rating === null ? [] : excursionsIn(samples, rating),
  };
}

/**
 * The stretches that ran above the rating.
 *
 * A stretch opens where the line crosses the rating and closes where it comes
 * back, both worked out between the two samples either side of the crossing.
 * One sample on its own above the rating is still a stretch — it is the case
 * this is most often looking for — and it gets the duration its two crossings
 * imply rather than a duration of nothing.
 */
function excursionsIn(samples: AmpSample[], rating: number): Excursion[] {
  const out: Excursion[] = [];
  let open: { from: number; peak: number; peakAt: number; samples: number } | null = null;

  const cross = (a: AmpSample, b: AmpSample): number => {
    const span = b.amps - a.amps;
    if (span === 0) return a.at;
    const share = (rating - a.amps) / span;
    return a.at + Math.min(1, Math.max(0, share)) * (b.at - a.at);
  };

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const previous = index > 0 ? samples[index - 1] : null;

    if (sample.amps > rating) {
      if (!open) {
        open = {
          // The first reading of the recording being above the rating says
          // nothing about when it went above it, so the stretch starts there.
          from: previous ? cross(previous, sample) : sample.at,
          peak: sample.amps,
          peakAt: sample.at,
          samples: 0,
        };
      }
      open.samples += 1;
      if (sample.amps > open.peak) {
        open.peak = sample.amps;
        open.peakAt = sample.at;
      }
      continue;
    }

    if (open && previous) {
      const to = cross(previous, sample);
      out.push({ ...open, to, seconds: (to - open.from) / 1000 });
      open = null;
    }
  }

  if (open) {
    const last = samples[samples.length - 1];
    out.push({ ...open, to: last.at, seconds: (last.at - open.from) / 1000 });
  }

  return out;
}

/** "1 min 14 s", "39 s" — how long something ran, the way it would be said. */
export function duration(seconds: number): string {
  const whole = Math.round(seconds * 10) / 10;
  if (whole < 60) return `${trimSeconds(whole)} s`;
  const minutes = Math.floor(whole / 60);
  const rest = Math.round(whole - minutes * 60);
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

function trimSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
