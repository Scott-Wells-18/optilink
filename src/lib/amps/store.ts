import type { AmpReading, Check } from "@/lib/amps/parse";
import { DEVICES, summariseAmps, type Device } from "@/lib/amps/summary";

/**
 * What is kept about a recording once it has been read.
 *
 * The file itself is kept as it came and read again whenever the report is
 * drawn, so nothing here is ever the source of a figure on a page. It is what
 * the dialog and the tree need to describe a recording without opening a file:
 * how many readings, over what period, the highest and the average — and the
 * account of what could not be read, so that account survives a refresh.
 *
 * Nothing that depends on the device rating is stored, because the rating can
 * be changed after the file is loaded and a stored verdict would go stale
 * without looking stale.
 */
export type StoredSummary = {
  count: number;
  from: number;
  to: number;
  seconds: number;
  max: number;
  maxAt: number;
  min: number;
  average: number;
  zeros: number;
  intervalSeconds: number;
  dated: boolean;
  heading: string | null;
  checks: Check[];
  notes: string[];
  remarks: string[];
};

export function storedSummary(reading: AmpReading): StoredSummary | null {
  const figures = summariseAmps(reading.samples, null);
  if (!figures) return null;
  return {
    count: figures.count,
    from: figures.from,
    to: figures.to,
    seconds: figures.seconds,
    max: figures.max,
    maxAt: figures.maxAt,
    min: figures.min,
    average: figures.average,
    zeros: figures.zeros,
    intervalSeconds: reading.intervalSeconds,
    dated: reading.dated,
    heading: reading.heading,
    checks: reading.checks,
    notes: reading.notes,
    remarks: reading.remarks,
  };
}

/**
 * The device's stated current rating, in amps.
 *
 * Anything that is not a positive number is no rating at all rather than a
 * rating of zero — a rating of zero would put every reading above it, and a
 * report with no rating is meant to draw no verdict rather than a damning one.
 */
export function readRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return Math.round(rating * 100) / 100;
}

export function readDevice(value: unknown): Device | null {
  const text = String(value ?? "");
  return (DEVICES as readonly string[]).includes(text) ? (text as Device) : null;
}
