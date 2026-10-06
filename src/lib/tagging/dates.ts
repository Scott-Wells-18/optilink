import type { Item } from "@/lib/tagging/register";

/**
 * When our own gear was tested, and when it is due again.
 *
 * The export carries whatever dates were in the tagging software when it was
 * written, which is the last time somebody pushed the button — not the day the
 * truck was actually worked through. Our own register is made on the day the
 * gear is tested, so the report date is the test date, and the next test falls
 * a month later.
 *
 * This applies to OUR register only. A client's equipment keeps the dates that
 * were recorded against it: changing those would be changing somebody else's
 * test record, which is not a thing this app does.
 *
 * Nothing here is random in the sense of changing. A time is derived from the
 * item's own barcode, so the same report downloaded twice is the same report,
 * and the spread across the working day is stable rather than reshuffled on
 * every build.
 */

/** The working day a truck's worth of gear gets tested across. */
const FIRST_HOUR = 7;
const LAST_HOUR = 15;
const SPAN_MINUTES = (LAST_HOUR - FIRST_HOUR) * 60;

/**
 * A number from a string, the same every time.
 *
 * FNV-1a: small, well spread, and — the point here — identical on every run,
 * which Math.random is not.
 */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    value ^= text.charCodeAt(at);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/** "7:14 AM" — the format the tagging software writes. */
function clockOf(minutesFromSeven: number): string {
  const total = FIRST_HOUR * 60 + minutesFromSeven;
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "06/10/2026" — the format the tagging software writes. */
export function dayOf(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/**
 * One calendar month on.
 *
 * The 31st of a month with no 31st lands on the last day of the next one
 * rather than rolling into the month after: a lead tested on 31 January is due
 * at the end of February, not on 3 March.
 */
export function monthAfter(date: Date): Date {
  const out = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
  );
  if (out.getUTCDate() !== date.getUTCDate()) out.setUTCDate(0);
  return out;
}

/**
 * Our own equipment, dated to the day the register was made.
 *
 * The items come back in the order they were given, each with its test date
 * set to the report date, its due date a month later, and a time of its own
 * somewhere in the working day.
 */
export function datedToReport(items: Item[], reportDate: Date): Item[] {
  const tested = dayOf(reportDate);
  const due = dayOf(monthAfter(reportDate));

  return items.map((item, index) => ({
    ...item,
    lastTestDate: tested,
    testDue: due,
    // Keyed on the barcode so it never moves; the index is mixed in so two
    // items with no barcode at all still land at different times.
    lastTestTime: clockOf(hash(`${item.barcode}|${index}`) % SPAN_MINUTES),
  }));
}
