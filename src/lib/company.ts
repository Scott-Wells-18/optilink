/**
 * Who the report is from. Fixed here rather than in Settings because it goes
 * on every page of every report and changes about once a decade.
 */
export const COMPANY = {
  name: "Optilink",
  abn: "19 075 861 611",
  addressLine1: "20-22 Parramatta St, Cronulla",
  addressLine2: "New South Wales 2230",
  phone: "0418 614 154",
  email: "scott@optilink.com.au",
} as const;

/** Who carried the survey out and signs the report. */
export const THERMOGRAPHER = {
  name: "Scott Wells",
  level: "Level I Thermographer",
  certificateNumber: "20399",
} as const;

/** "Scott Wells (Level I Thermographer - 20399)" */
export function reportBy(): string {
  return `${THERMOGRAPHER.name} (${THERMOGRAPHER.level} - ${THERMOGRAPHER.certificateNumber})`;
}
