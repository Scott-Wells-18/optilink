/**
 * What the four conductors are called, and what colour each is drawn.
 *
 * Kept apart from the reader so the dialog can use them without dragging the
 * spreadsheet parser — and Node's zlib with it — into the browser bundle.
 *
 * The colours are the first four slots of the validated categorical palette,
 * in that order. Two of them sit under 3:1 against white, which is why every
 * trace is also labelled and every peak written out: identity is never colour
 * alone.
 */

export type Channel = "l1" | "l2" | "l3" | "n";

export const CHANNELS: Channel[] = ["l1", "l2", "l3", "n"];

export const CHANNEL_LABELS: Record<Channel, string> = {
  l1: "L1",
  l2: "L2",
  l3: "L3",
  n: "N",
};

export const SERIES: Record<Channel, string> = {
  l1: "#2a78d6",
  l2: "#eb6834",
  l3: "#1baf7a",
  n: "#eda100",
};

export type Peak = { channel: Channel; amps: number; at: number };

export type Summary = {
  from: number;
  to: number;
  count: number;
  intervalMinutes: number;
  /** The highest reading on each channel, and when it happened. */
  peaks: Partial<Record<Channel, Peak>>;
  /** The highest reading anywhere in the recording. */
  highest: Peak | null;
  skipped: number;
};
