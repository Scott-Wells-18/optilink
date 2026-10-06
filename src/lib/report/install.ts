import PDFDocument from "pdfkit";
import { PDFDocument as Lib } from "pdf-lib";
import { COLOURS, SEVERITY, longDate, safe, shortDate } from "@/lib/report/theme";
import { guarded, mastheadLines, ohmText, sectionBar, stampWideFeet, tableHead, type Doc, type PageMeta } from "@/lib/report/furniture";
import { equipmentPagesPortrait } from "@/lib/report/equipment";
import { fitted, stampCertificate, type Box, type Certificate, type Slot } from "@/lib/report/certificate";
import type { Instrument } from "@/lib/report/instrument";
import {
  MEASUREMENT_LABELS,
  TERMINALS,
  resistanceReads,
  voltsReads,
  type InstallRow,
  type Terminals,
} from "@/lib/install/parse";
import {
  PHASE_LABELS,
  reasonFor,
  type Anomaly,
  type Exclusion,
  type Repeat,
  type Phases,
  type Point,
} from "@/lib/install/points";

/**
 * The installation test report.
 *
 * What it says is bounded by what the instrument actually measured. The tables
 * are the results; the charts are there to make a column of numbers legible
 * and nothing more, which is why there are several of them rather than one.
 *
 * Three measurements with nothing in common: a resistance in megohms, trip
 * times in milliseconds, and voltages — and among the voltages, a line reading
 * near 240 V beside a neutral-to-earth reading near half a volt. Drawn on one
 * axis the half-volt reading is a flat line on the floor and the insulation
 * reading is off the top of the page. So each gets its own chart with its own
 * unit, and the two voltage scales are drawn apart.
 *
 * And it does not conclude more than it measured. Voltage between pairs of
 * terminals shows what was present at each point on the day; it is not by
 * itself a polarity verification and the report says so rather than implying
 * otherwise.
 */

/*
 * Read landscape, with its appendices portrait.
 *
 * The results are tables — a point and its three readings, a record and the
 * line the instrument wrote for it — and a table reads better across than
 * down. The three things this report reproduces rather than retypes are all
 * A4 portrait documents: the instrument's calibration certificate and the
 * tester's own export. Those keep their own shape, so they come out nearly
 * full size instead of small with white down either side.
 */
const SHEET = { width: 841.89, height: 595.28 };
const MARGIN = 34;
const CONTENT = SHEET.width - MARGIN * 2;
const FLOOR = SHEET.height - 72;

/** The upright page the certificate and the instrument's export go on. */
const UPRIGHT = { width: 595.28, height: 841.89, margin: 42, top: 104, foot: 76 };
const UPRIGHT_CONTENT = UPRIGHT.width - UPRIGHT.margin * 2;

/** What a full-width bar spans on the landscape page. */
const SPAN = { x: MARGIN, width: CONTENT };

export type InstallReport = PageMeta & {
  reportDate: Date;
  testedOn: Date;
  phases: Phases;
  installation: string | null;
  circuitDetails: string | null;
  contactName: string | null;
  instrumentName: string | null;

  /** Everything the instrument wrote, excluded records included. */
  allRows: InstallRow[];
  /** What the results are drawn from: everything not set aside. */
  rows: InstallRow[];
  points: Point[];
  stray: InstallRow[];
  /** Readings the instrument took twice, left out of the points. */
  repeats: Repeat[];
  exclusions: Exclusion[];
  anomalies: Anomaly[];
  circuits: Record<string, string>;

  /** What the instrument said about itself. */
  header: {
    title: string | null;
    siteName: string | null;
    boardNumber: string | null;
    circuitRange: string | null;
    notes: string[];
  };

  /** What took the readings, with its calibration certificate. */
  instrument: Instrument | null;

  /**
   * The tester's own export: its page sizes, so the gaps can be drawn, and the
   * bytes, so the untouched file goes along as an attachment.
   */
  original: { pages: Certificate; bytes: Buffer } | null;
  originalName: string | null;
};

export async function buildInstallReport(data: InstallReport): Promise<Buffer> {
  const doc = guarded(
    new PDFDocument({
      size: [SHEET.width, SHEET.height],
      margin: MARGIN,
      bufferPages: true,
    }),
  );
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  cover(doc, data);
  basis(doc, data);
  insulation(doc, data);
  rcd(doc, data);
  points(doc, data);
  setAside(doc, data);

  /*
   * The pages that carry somebody else's document, all of them upright.
   *
   * The gaps are drawn here — borders, captions and all — and the documents
   * themselves are stamped into them afterwards, because pdfkit cannot place a
   * page of another PDF and pdf-lib cannot draw the report. Both sets of gaps
   * are collected before anything is stamped.
   */
  const certificate = equipmentPagesPortrait(doc, data.instrument, (note) =>
    uprightHead(doc, data, "Equipment Used", note), UPRIGHT);
  const original = originalPages(doc, data);

  stampWideFeet(doc, data, {
    width: SHEET.width,
    height: SHEET.height,
    margin: MARGIN,
  });
  doc.end();

  let out = await done;
  if (data.original?.pages && original.length > 0) {
    out = await stampCertificate(out, data.original.pages, original);
  }
  if (data.instrument?.certificate && certificate.length > 0) {
    out = await stampCertificate(out, data.instrument.certificate, certificate);
  }
  return attachOriginals(out, data);
}

/* --- small helpers ---------------------------------------------------------- */

function head(doc: Doc, data: InstallReport, title: string): number {
  if (data.logo) doc.image(data.logo, MARGIN, 26, { fit: [104, 34] });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(title, MARGIN + 120, 32, { width: CONTENT - 120, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(safe([data.clientName, data.siteName].filter(Boolean).join("  ·  ")), MARGIN + 120, 48, {
    width: CONTENT - 120,
    lineBreak: false,
    ellipsis: true,
  });
  doc.rect(MARGIN, 66, CONTENT, 0.8).fill(COLOURS.hair);
  doc.y = 80;
  doc.fillColor(COLOURS.ink);
  return doc.y;
}

function room(doc: Doc, data: InstallReport, needed: number, title: string): number {
  if (doc.y + needed <= FLOOR) return doc.y;
  doc.addPage();
  return head(doc, data, title);
}

function rows(doc: Doc, data: InstallReport, pairs: [string, string][], title: string) {
  const labelWidth = 176;
  for (const [name, value] of pairs) {
    doc.font("Helvetica-Bold").fontSize(9);
    const height = Math.max(
      18,
      doc.heightOfString(safe(value) || "—", {
        width: CONTENT - labelWidth - 4,
        lineGap: 1.4,
      }) + 9,
    );
    const y = room(doc, data, height + 4, title);
    doc.rect(MARGIN, y, CONTENT, 0.5).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9);
    doc.text(name, MARGIN + 2, y + 5, { width: labelWidth - 8 });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9);
    doc.text(safe(value) || "—", MARGIN + labelWidth, y + 5, {
      width: CONTENT - labelWidth - 4,
      lineGap: 1.4,
    });
    doc.y = y + height;
  }
  doc.rect(MARGIN, doc.y, CONTENT, 0.5).fill(COLOURS.hair);
  doc.y += 12;
  doc.fillColor(COLOURS.ink);
}

function note(doc: Doc, text: string, size = 8.5) {
  doc.font("Helvetica").fontSize(size).fillColor(COLOURS.inkSoft);
  doc.text(safe(text), MARGIN, doc.y, { width: CONTENT, lineGap: 1.6 });
  doc.y += 10;
  doc.fillColor(COLOURS.ink);
}

/* --- charts ------------------------------------------------------------------ */

type Bar = { label: string; value: number; reads: string; alarm?: boolean };

/**
 * A short row of bars with one axis and its own unit.
 *
 * Every chart on this report is one measurement in one unit, because the
 * measurements on it have nothing in common and a shared axis would be a lie.
 * The grid is recessive, there is one series so there is no legend, and every
 * bar is labelled with the reading it stands for — there are never more than a
 * handful, so a value on each is a help rather than clutter.
 *
 * A bar past its limit is drawn in the alarm colour AND carries the word, so
 * the colour is never the only thing saying so.
 */
function barChart(
  doc: Doc,
  data: InstallReport,
  title: string,
  unit: string,
  bars: Bar[],
  limit: { value: number; label: string } | null,
  section: string,
) {
  if (bars.length === 0) return;

  const height = 112;
  const top = room(doc, data, height + 46, section);

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.inkSoft);
  ohmText(doc, `${title.toUpperCase()}  (${unit})`, MARGIN, top, {
    width: CONTENT,
    size: 8.5,
    font: "Helvetica-Bold",
  });

  const plot = { x: MARGIN + 34, y: top + 16, width: CONTENT - 40, height };
  const ceiling = Math.max(
    ...bars.map((bar) => bar.value),
    limit ? limit.value : 0,
  ) * 1.18 || 1;

  // Four recessive gridlines and their values, and nothing else behind the data.
  doc.font("Helvetica").fontSize(6.5).fillColor(COLOURS.inkSoft);
  for (let step = 0; step <= 4; step += 1) {
    const value = (ceiling / 4) * step;
    const y = plot.y + plot.height - (value / ceiling) * plot.height;
    doc.rect(plot.x, y, plot.width, 0.4).fill(step === 0 ? COLOURS.hair : COLOURS.soft);
    doc.fillColor(COLOURS.inkSoft);
    doc.text(tidy(value), MARGIN - 4, y - 3, { width: 34, align: "right", lineBreak: false });
  }

  const slot = plot.width / bars.length;
  const width = Math.min(46, slot * 0.54);

  bars.forEach((bar, at) => {
    const tall = Math.max(1.5, (bar.value / ceiling) * plot.height);
    const x = plot.x + slot * at + (slot - width) / 2;
    const y = plot.y + plot.height - tall;

    doc.roundedRect(x, y, width, tall, Math.min(4, width / 3)).fill(
      bar.alarm ? SEVERITY.fail.fill : COLOURS.accent,
    );

    doc.font("Helvetica-Bold").fontSize(7).fillColor(bar.alarm ? SEVERITY.fail.fill : COLOURS.ink);
    ohmText(doc, bar.reads, x - slot * 0.2, y - 10, {
      width: width + slot * 0.4,
      align: "center",
      size: 7,
      font: "Helvetica-Bold",
    });

    doc.font("Helvetica").fontSize(6.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(bar.label), x - slot * 0.2, plot.y + plot.height + 4, {
      width: width + slot * 0.4,
      align: "center",
      lineBreak: false,
    });
  });

  if (limit && limit.value <= ceiling) {
    const y = plot.y + plot.height - (limit.value / ceiling) * plot.height;
    doc.save();
    doc.dash(3, { space: 2 }).moveTo(plot.x, y).lineTo(plot.x + plot.width, y);
    doc.lineWidth(0.9).strokeColor(SEVERITY.fail.fill).stroke();
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(SEVERITY.fail.fill);
    ohmText(doc, limit.label, plot.x + plot.width - 120, y - 9, {
      width: 120,
      align: "right",
      size: 6.5,
      font: "Helvetica-Bold",
    });
  }

  doc.y = plot.y + plot.height + 20;
  doc.fillColor(COLOURS.ink);
}

function tidy(value: number): string {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1);
}

/* --- the cover --------------------------------------------------------------- */

function cover(doc: Doc, data: InstallReport) {
  if (data.logo) doc.image(data.logo, MARGIN, 36, { fit: [136, 44] });
  mastheadLines(doc, MARGIN + 250, 36, CONTENT - 250);

  let y = 126;
  doc.rect(MARGIN, y, 4, 48).fill(COLOURS.accent);
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(9);
  doc.text("INSTALLATION TESTING", MARGIN + 16, y + 2, { characterSpacing: 1.6 });
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(21);
  doc.text("Installation Test Report", MARGIN + 16, y + 16, { width: CONTENT - 16 });

  y = 188;
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.bar);
  doc.text("PREPARED FOR", MARGIN, y, { characterSpacing: 1.2 });
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(15);
  doc.text(safe(data.clientName), MARGIN, y + 14, { width: CONTENT });
  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.bar);
  doc.text(safe(data.siteName), MARGIN, y + 34, { width: CONTENT });
  if (data.siteLocation) {
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.inkSoft);
    doc.text(safe(data.siteLocation), MARGIN, y + 49, { width: CONTENT });
  }

  doc.y = y + 70;
  const insulationRows = data.rows.filter((row) => row.kind === "INSULATION");
  const rcdRows = data.rows.filter((row) => row.kind === "RCD");
  const complete = data.points.filter((point) => point.missing.length === 0).length;

  rows(
    doc,
    data,
    [
      ["Installation", data.installation ?? ""],
      ["Circuit / device", data.circuitDetails ?? ""],
      ["Supply", PHASE_LABELS[data.phases]],
      ["Tested on", shortDate(data.testedOn)],
      ["Report date", longDate(data.reportDate)],
      ["Prepared for", data.contactName ?? ""],
      ["Instrument", data.instrumentName ?? ""],
      [
        "Points tested",
        `${data.points.length} ${data.points.length === 1 ? "point" : "points"}` +
          (complete === data.points.length
            ? ""
            : `, of which ${complete} ${complete === 1 ? "is" : "are"} a complete set`),
      ],
      [
        "Records read",
        `${data.allRows.length} from the instrument` +
          (data.exclusions.length > 0 ? `, ${data.exclusions.length} set aside` : "") +
          `  ·  ${insulationRows.length} insulation, ${rcdRows.length} RCD`,
      ],
    ],
    "Installation Test Report",
  );

  if (data.anomalies.length > 0) {
    doc.y += 4;
    doc.rect(MARGIN, doc.y, 3, 16).fill(SEVERITY.concern.fill);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
    doc.text(
      `${data.anomalies.length} ${data.anomalies.length === 1 ? "record" : "records"} in this file needed a second look — see Records set aside.`,
      MARGIN + 12,
      doc.y + 2,
      { width: CONTENT - 14 },
    );
    doc.y += 18;
  }

  /*
   * The closing line, kept on the cover.
   *
   * It used to be dropped near the foot of the page whatever was above it, so
   * a cover with a long installation description and a note about the records
   * pushed it past the bottom — and the second half of one sentence took a
   * page of its own with nothing else on it. It is measured and placed where
   * it fits: low on the page when there is room, straight under what is above
   * it when there is not.
   */
  const closing =
    "This report sets out the readings the test instrument recorded on the date shown, at the points " +
    "listed inside. It states what was measured. It is not a certificate of compliance for the " +
    "installation, and the limitations inside form part of it.";
  /*
   * Low on the page, but never above what is already drawn there, and never
   * past the bottom of it.
   *
   * Capping it at the last line that fits put it back up the page when the
   * details ran long, straight through the note about the records — the two
   * were drawn over each other. So what is already on the page is the floor,
   * sitting low is only the preference, and when a long installation
   * description and a note have taken the room, the line is set a little
   * smaller rather than being pushed off the page.
   */
  const topOf = (tall: number) =>
    Math.max(doc.y + 6, Math.min(SHEET.height - MARGIN - 110, FLOOR - tall));
  let size = 8.5;
  let tall = 0;
  let top = 0;
  for (;;) {
    doc.font("Helvetica").fontSize(size);
    tall = doc.heightOfString(safe(closing), { width: CONTENT, lineGap: 1.6 });
    top = topOf(tall);
    if (top + tall <= FLOOR || size <= 7) break;
    size -= 0.25;
  }
  doc.y = top;
  note(doc, closing, size);
}

/* --- what the readings show -------------------------------------------------- */

function basis(doc: Doc, data: InstallReport) {
  doc.addPage();
  head(doc, data, "What these readings show");
  sectionBar(doc, "What these readings show", doc.y, SPAN);
  doc.y += 34;

  const insulationRows = data.rows.filter((row) => row.kind === "INSULATION");
  const rcdRows = data.rows.filter((row) => row.kind === "RCD");

  note(
    doc,
    `This report records ${insulationRows.length} insulation resistance ` +
      `${insulationRows.length === 1 ? "test" : "tests"} and ${rcdRows.length} RCD automatic test ` +
      `${rcdRows.length === 1 ? "sequence" : "sequences"} for the ` +
      `${PHASE_LABELS[data.phases].toLowerCase()} installation.`,
    9,
  );
  doc.y += 6;

  /*
   * What a voltage between two terminals does and does not establish.
   *
   * The second paragraph is the reason the report does not say "polarity
   * verified". A reading between L and PE of about 240 V, between L and N of
   * about 240 V and between N and PE of near zero is consistent with correct
   * connection — and it is also what a reading at one point on one day is. It
   * is not a polarity test, it does not cover the points that were not tested,
   * and saying so is the difference between a record and a claim.
   */
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text("Voltage readings", MARGIN, doc.y, { width: CONTENT });
  doc.y += 14;
  note(
    doc,
    "Each tested point includes voltage measurements between line and earth (L–PE), line and " +
      "neutral (L–N), and neutral and earth (N–PE). These readings show the voltage present " +
      "between those terminals at the time of testing.",
  );
  note(
    doc,
    "Readings close to nominal supply voltage between L–PE and L–N, together with a low N–PE " +
      "voltage, are consistent with the expected voltage relationships. These measurements alone " +
      "do not confirm polarity or establish that all installation verification tests have been " +
      "completed. The results apply only to the points tested.",
  );
  doc.y += 6;

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text("Insulation resistance", MARGIN, doc.y, { width: CONTENT });
  doc.y += 14;
  note(
    doc,
    "A result displayed with a “greater than” symbol means the insulation resistance exceeded the " +
      "instrument’s displayed measurement limit. The report preserves this result as recorded " +
      "rather than presenting it as an exact resistance value.",
  );
  doc.y += 6;

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text("RCD readings", MARGIN, doc.y, { width: CONTENT });
  doc.y += 14;
  note(
    doc,
    "The automatic test sequence records results at half, one and five times the RCD’s rated " +
      "residual current, at both 0° and 180°. The half-rated-current test checks for " +
      "non-operation; the remaining tests record the device’s disconnection times.",
  );
  note(
    doc,
    "Results are reproduced as recorded by the instrument. Assessment against the applicable " +
      "requirements is provided in the separate RCD report.",
  );

  if (data.header.notes.length > 0) {
    doc.y += 8;
    for (const line of data.header.notes) note(doc, line, 8);
  }
}

/* --- insulation --------------------------------------------------------------- */

/**
 * Insulation and the RCD results share a page.
 *
 * An installation has one insulation reading on it, and one reading does not
 * need a page of its own with three quarters of it empty. It opens the page
 * and the RCD results follow underneath.
 */
function insulation(doc: Doc, data: InstallReport) {
  const found = data.rows.filter((row) => row.kind === "INSULATION");
  doc.addPage();
  head(doc, data, "Insulation resistance and RCD results");
  sectionBar(doc, "Insulation resistance", doc.y, SPAN);
  doc.y += 34;

  if (found.length === 0) {
    note(doc, "No insulation resistance record was read from this file.", 10);
    return;
  }

  const columns = [62, 104, 120, CONTENT - 62 - 104 - 120];
  tableHead(doc, doc.y, ["Record", "Test voltage", "Resistance", "Circuit"], columns);
  doc.y += 20;

  for (const row of found) {
    const y = doc.y;
    doc.rect(MARGIN, y + 22, CONTENT, 0.5).fill(COLOURS.hair);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
    doc.text(row.name, MARGIN + 4, y + 6, { width: columns[0] - 8 });
    doc.font("Helvetica").fontSize(9);
    doc.text(
      row.terminalVolts === null ? "—" : `${row.terminalVolts} V`,
      MARGIN + columns[0] + 4,
      y + 6,
      { width: columns[1] - 8 },
    );
    doc.font("Helvetica-Bold").fontSize(9.5);
    ohmText(doc, resistanceReads(row), MARGIN + columns[0] + columns[1] + 4, y + 6, {
      width: columns[2] - 8,
      size: 9.5,
      font: "Helvetica-Bold",
    });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(
      safe(data.circuits[row.name] ?? ""),
      MARGIN + columns[0] + columns[1] + columns[2] + 4,
      y + 7,
      { width: columns[3] - 8, height: 11, ellipsis: true },
    );
    doc.y = y + 22;
    doc.fillColor(COLOURS.ink);
  }
  doc.y += 14;

  // Only where there is more than one to compare; one bar is not a chart.
  const measured = found.filter((row) => row.megohms !== null);
  if (measured.length > 1) {
    barChart(
      doc,
      data,
      "Insulation resistance by record",
      "MΩ",
      measured.map((row) => ({
        label: row.name,
        value: row.megohms as number,
        reads: resistanceReads(row),
      })),
      { value: 1, label: "1 MΩ" },
      "Insulation resistance",
    );
  }

  const floors = found.filter((row) => row.megohmsAtLeast !== null);
  if (floors.length > 0) {
    note(
      doc,
      `${floors.length === 1 ? "This reading is" : "These readings are"} a floor rather than a ` +
        "measured value: the resistance was above the instrument's range, so there is no number to " +
        "plot and none has been invented.",
      8,
    );
  }
}

/* --- rcd ---------------------------------------------------------------------- */

const TRIPS: { key: "ratedAt0" | "ratedAt180" | "fiveAt0" | "fiveAt180"; label: string }[] = [
  { key: "ratedAt0", label: "×1 0°" },
  { key: "ratedAt180", label: "×1 180°" },
  { key: "fiveAt0", label: "×5 0°" },
  { key: "fiveAt180", label: "×5 180°" },
];

function rcd(doc: Doc, data: InstallReport) {
  const found = data.rows.filter((row) => row.kind === "RCD" && row.rcd);
  // Under the insulation reading where there is room for it, on its own page
  // where there is not.
  const y = room(doc, data, 150, "Insulation resistance and RCD results");
  doc.y = y + 10;
  sectionBar(doc, "RCD results", doc.y, SPAN);
  doc.y += 34;

  if (found.length === 0) {
    note(doc, "No RCD record was read from this file.", 10);
    return;
  }

  for (const [at, row] of found.entries()) {
    const test = row.rcd!;
    const y = room(doc, data, 200, "RCD results");
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLOURS.ink);
    doc.text(
      `${row.name}${data.circuits[row.name] ? `  —  ${safe(data.circuits[row.name])}` : ""}`,
      MARGIN,
      y,
      { width: CONTENT },
    );
    doc.y = y + 16;

    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(
      safe(
        [
          test.ratingMa ? `${test.ratingMa} mA` : null,
          test.waveform ? `Type ${test.waveform}${test.selective ? " S" : ""}` : null,
          test.touchVolts !== null ? `Touch voltage ${test.touchVolts} V` : null,
          test.limitVolts !== null ? `limit ${test.limitVolts} V` : null,
        ]
          .filter(Boolean)
          .join("  ·  "),
      ),
      MARGIN,
      doc.y,
      { width: CONTENT },
    );
    doc.y += 16;

    /*
     * Half rated current, said once where both say the same thing.
     *
     * The instrument takes it at 0° and at 180°, and on a device that passes
     * both read the same — "did not trip  /  did not trip" is the same fact
     * twice. Where they differ both are printed, because then it matters.
     */
    const half = [test.halfAt0, test.halfAt180].map((reading) =>
      reading === "NO_TRIP" ? "did not trip" : reading === null ? "no reading" : `${reading} ms`,
    );
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(
      `At half rated current: ${half[0] === half[1] ? half[0] : half.join("  /  ")}`,
      MARGIN,
      doc.y,
      { width: CONTENT },
    );
    doc.y += 18;

    const bars: Bar[] = TRIPS.flatMap((trip) => {
      const reading = test[trip.key];
      if (typeof reading !== "number") return [];
      return [{ label: trip.label, value: reading, reads: `${reading} ms` }];
    });

    if (bars.length > 0) {
      barChart(doc, data, `${row.name} disconnection time`, "ms", bars, null, "RCD results");
    } else {
      note(doc, "No disconnection time was recorded on this sequence.", 8.5);
    }

    if (at < found.length - 1) doc.y += 8;
  }

  doc.y += 4;
  note(
    doc,
    "Times are as measured. Whether each one meets the maximum disconnection time for its device " +
      "is assessed in the RCD report, which cites AS/NZS 3017 and is produced separately.",
    8,
  );
}

/* --- the points ---------------------------------------------------------------- */


function points(doc: Doc, data: InstallReport) {
  doc.addPage();
  head(doc, data, "Tested points");
  sectionBar(doc, "Tested points", doc.y, SPAN);
  doc.y += 34;

  if (data.points.length === 0) {
    note(doc, "No voltage readings were read from this file.", 10);
    return;
  }

  /* --- the table, which is the result ---------------------------------- */
  const columns = [40, CONTENT - 40 - 74 * 3, 74, 74, 74];
  tableHead(doc, doc.y, ["Ref", "Point", "L-PE", "L-N", "N-PE"], columns);
  doc.y += 20;

  for (const point of data.points) {
    const y = room(doc, data, 26, "Tested points");
    if (y !== doc.y) {
      tableHead(doc, doc.y, ["Ref", "Point", "L-PE", "L-N", "N-PE"], columns);
      doc.y += 20;
    }
    const at = doc.y;
    doc.rect(MARGIN, at + 24, CONTENT, 0.5).fill(COLOURS.hair);

    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
    doc.text(point.ref, MARGIN + 4, at + 7, { width: columns[0] - 8 });
    doc.text(safe(point.name || "(not named)"), MARGIN + columns[0], at + 7, {
      width: columns[1] - 10,
      height: 11,
      ellipsis: true,
    });

    TERMINALS.forEach((terminal, index) => {
      const reading = point.readings[terminal];
      const x = MARGIN + columns[0] + columns[1] + 74 * index;
      if (reading) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
        doc.text(safe(voltsReads(reading, terminal)), x, at + 7, { width: 70, align: "center" });
        doc.font("Helvetica").fontSize(6.5).fillColor(COLOURS.inkSoft);
        doc.text(reading.name, x, at + 17, { width: 70, align: "center", lineBreak: false });
      } else {
        doc.font("Helvetica-Bold").fontSize(7).fillColor(SEVERITY.concern.fill);
        doc.text("NOT TAKEN", x, at + 9, { width: 70, align: "center", lineBreak: false });
      }
    });

    doc.y = at + 24;
    doc.fillColor(COLOURS.ink);
  }
  doc.y += 14;

  const incomplete = data.points.filter((point) => point.missing.length > 0);
  if (incomplete.length > 0) {
    note(
      doc,
      `${incomplete.length} ${incomplete.length === 1 ? "point is" : "points are"} short of a ` +
        "complete set. A reading marked NOT TAKEN was not recorded at that point; nothing has been " +
        "carried over from another point to fill it.",
      8.5,
    );
    doc.y += 4;
  }

  /*
   * No charts here.
   *
   * The readings are a table of three voltages a point, and a chart of them is
   * eight bars all the same height: it takes a page to say what the table has
   * already said in a line. The table is the result.
   */
}

/* --- what was set aside --------------------------------------------------------- */

function setAside(doc: Doc, data: InstallReport) {
  /*
   * Two ways a record is not in the results, listed together.
   *
   * One the operator set aside by hand, with a reason they typed. One the
   * reading of the file set aside on its own: a pair taken twice before the
   * point was finished is the same reading twice, and it cannot be a point of
   * its own. Both are here with what they read and why, because a record left
   * out of the results without the report saying so is a record deleted.
   */
  const byHand = data.allRows.filter((row) =>
    data.exclusions.some((exclusion) => exclusion.name === row.name),
  );
  const repeated = data.repeats.map((repeat) => repeat.row.name);
  const out = [
    ...byHand,
    ...data.allRows.filter(
      (row) => repeated.includes(row.name) && !byHand.some((held) => held.name === row.name),
    ),
  ];
  const unplaced = data.rows.filter((row) => row.kind === "UNKNOWN");

  if (out.length === 0 && unplaced.length === 0 && data.anomalies.length === 0) return;

  doc.addPage();
  head(doc, data, "Records set aside");
  sectionBar(doc, "Duplicates and accidental tests", doc.y, SPAN);
  doc.y += 34;

  if (out.length === 0) {
    note(doc, "No records were set aside from this file.", 9.5);
  } else {
    note(
      doc,
      "These records were recorded by the instrument and are not included in the results above. " +
        "They have not been deleted: each is listed here with its original reference and the reason, " +
        "and every one of them appears in the instrument's own export reproduced at the back of this " +
        "report.",
    );
    doc.y += 4;

    const columns = [58, 92, CONTENT - 58 - 92 - 130, 130];
    tableHead(doc, doc.y, ["Record", "Measurement", "As recorded", "Set aside because"], columns);
    doc.y += 20;

    for (const row of out) {
      doc.font("Helvetica").fontSize(8);
      const recorded = safe(
        [row.rawFunction, row.rawParameters, row.rawResult].filter(Boolean).join("  ·  "),
      );
      const height = Math.max(
        22,
        doc.heightOfString(recorded || " ", { width: columns[2] - 8, lineGap: 1.2 }) + 11,
      );
      const y = room(doc, data, height, "Records set aside");
      doc.rect(MARGIN, y + height, CONTENT, 0.5).fill(COLOURS.hair);

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.ink);
      doc.text(row.name, MARGIN + 4, y + 5, { width: columns[0] - 8 });
      doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
      doc.text(MEASUREMENT_LABELS[row.kind], MARGIN + columns[0], y + 5, {
        width: columns[1] - 8,
      });
      doc.fillColor(COLOURS.ink).fontSize(8);
      doc.text(recorded, MARGIN + columns[0] + columns[1], y + 5, {
        width: columns[2] - 8,
        lineGap: 1.2,
      });
      doc.fillColor(COLOURS.inkSoft);
      const repeat = data.repeats.find((held) => held.row.name === row.name);
      const why = data.exclusions.some((exclusion) => exclusion.name === row.name)
        ? reasonFor(data.exclusions, row.name)
        : repeat
          ? `${repeat.differs ? "Re-take of" : "Repeat of"} ${repeat.of.name}, same pair at the same point`
          : "—";
      doc.text(
        safe(why),
        MARGIN + columns[0] + columns[1] + columns[2],
        y + 5,
        { width: columns[3] - 6, lineGap: 1.2 },
      );
      doc.y = y + height;
      doc.fillColor(COLOURS.ink);
    }
    doc.y += 14;
  }

  if (unplaced.length > 0) {
    const y = room(doc, data, 60, "Records set aside");
    sectionBar(doc, "Records not recognised", y, SPAN);
    doc.y = y + 34;
    note(
      doc,
      "The instrument wrote these and this report could not tell what kind of test they are, so " +
        "they are not counted in any result. They are reproduced word for word.",
    );
    for (const row of unplaced) {
      const at = room(doc, data, 24, "Records set aside");
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.ink);
      doc.text(row.name, MARGIN, at, { width: 54, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
      doc.text(
        safe([row.rawFunction, row.rawParameters, row.rawResult].filter(Boolean).join("  ·  ")),
        MARGIN + 54,
        at,
        { width: CONTENT - 54, lineGap: 1.2 },
      );
      doc.y += 4;
    }
    doc.y += 10;
  }

  if (data.anomalies.length > 0) {
    const y = room(doc, data, 70, "Records set aside");
    sectionBar(doc, "Raised for review", y, SPAN);
    doc.y = y + 34;
    for (const anomaly of data.anomalies) {
      const at = room(doc, data, 46, "Records set aside");
      doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
      doc.text(safe(anomaly.title), MARGIN, at, { width: CONTENT });
      doc.y += 2;
      doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
      doc.text(
        safe(
          `${anomaly.detail}${anomaly.rows.length > 0 ? `  (${anomaly.rows.join(", ")})` : ""}`,
        ),
        MARGIN,
        doc.y,
        { width: CONTENT, lineGap: 1.3 },
      );
      doc.y += 10;
    }
  }
}

/* --- the instrument's own export ------------------------------------------------ */

/* --- the instrument's own export, reproduced ------------------------------- */

/** The heading on an upright page, which is a narrower page than the rest. */
function uprightHead(doc: Doc, data: InstallReport, title: string, note?: string) {
  const { margin } = UPRIGHT;
  if (data.logo) doc.image(data.logo, margin, 26, { fit: [104, 34] });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(title, margin + 120, 32, {
    width: UPRIGHT_CONTENT - 120,
    lineBreak: false,
    ellipsis: true,
  });
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(note ?? [data.clientName, data.siteName].filter(Boolean).join("  ·  ")),
    margin + 120,
    48,
    { width: UPRIGHT_CONTENT - 120, lineBreak: false, ellipsis: true },
  );
  doc.rect(margin, 66, UPRIGHT_CONTENT, 0.8).fill(COLOURS.hair);
  doc.fillColor(COLOURS.ink);
}

/** How a borrowed page is set in from its blue rule, and the rule from it. */
const BORDER_GAP = 5;
const BORDER_WIDTH = 1.4;

/**
 * The gaps the tester's own export is stamped into, two to an upright page.
 *
 * Reproduced rather than appended. An appended page is the instrument's page
 * with our page numbers running off the end of it; a reproduced one sits on
 * our page, inside an Optilink rule, captioned with which page of theirs it
 * is — the same way the RCD report carries a board's export. The untouched
 * file still goes along as an attachment, so nothing is lost by it.
 */
function originalPages(doc: Doc, data: InstallReport): Slot[] {
  const sizes = data.original?.pages.sizes ?? [];
  if (sizes.length === 0) return [];

  const slots: Slot[] = [];
  const perPage = 2;

  for (let from = 0; from < sizes.length; from += perPage) {
    const chunk = sizes.slice(from, from + perPage);
    doc.addPage({ size: [UPRIGHT.width, UPRIGHT.height], margin: UPRIGHT.margin });
    uprightHead(
      doc,
      data,
      "Original Instrument Report",
      `${data.instrument?.name ?? data.instrumentName ?? "The test instrument"}'s own export, reproduced unaltered.`,
    );

    const page = doc.bufferedPageRange().count - 1;
    const region: Box = {
      x: UPRIGHT.margin,
      y: UPRIGHT.top,
      width: UPRIGHT_CONTENT,
      height: UPRIGHT.height - UPRIGHT.foot - UPRIGHT.top,
    };
    const gap = 16;
    const share = (region.width - gap * (chunk.length - 1)) / chunk.length;

    chunk.forEach((size, at) => {
      const inset = BORDER_GAP + BORDER_WIDTH + 2;
      const box = fitted(
        {
          x: region.x + at * (share + gap) + inset,
          y: region.y + inset,
          width: share - inset * 2,
          height: region.height - inset * 2 - 12,
        },
        size,
      );

      // A hairline on the page's own edge, so a white export has a definite
      // boundary; the blue rule sits outside it rather than on top of it, so a
      // document that has a border of its own keeps it.
      doc.lineWidth(0.5).strokeColor(COLOURS.hair);
      doc.rect(box.x, box.y, box.width, box.height).stroke();
      doc.lineWidth(BORDER_WIDTH).strokeColor(COLOURS.accent);
      doc
        .rect(
          box.x - BORDER_GAP,
          box.y - BORDER_GAP,
          box.width + BORDER_GAP * 2,
          box.height + BORDER_GAP * 2,
        )
        .stroke();
      doc.lineWidth(1).strokeColor("#000000");

      doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
      doc.text(
        `PAGE ${from + at + 1} OF ${sizes.length}`,
        box.x - BORDER_GAP,
        box.y + box.height + BORDER_GAP + 5,
        { width: box.width + BORDER_GAP * 2, align: "center", characterSpacing: 1.1 },
      );
      doc.fillColor(COLOURS.ink);

      slots.push({ ...box, page, source: from + at });
    });
  }

  return slots;
}

/**
 * The originals, attached whole as well as reproduced.
 *
 * A page reproduced on our paper is readable; the file itself is the evidence.
 * Both go in, so the report can be read and the original pulled out of it.
 */
async function attachOriginals(ours: Buffer, data: InstallReport): Promise<Buffer> {
  if (!data.original && !data.instrument?.certificate) return ours;

  try {
    const target = await Lib.load(ours);
    if (data.original) {
      await target.attach(
        new Uint8Array(data.original.bytes),
        data.originalName ?? "instrument-export.pdf",
        {
          mimeType: "application/pdf",
          description: "The test instrument's own export, unaltered.",
        },
      );
    }
    if (data.instrument?.certificate) {
      await target.attach(
        new Uint8Array(data.instrument.certificate.bytes),
        "calibration-certificate.pdf",
        {
          mimeType: "application/pdf",
          description: "The instrument's calibration certificate, as issued.",
        },
      );
    }
    return Buffer.from(await target.save());
  } catch {
    // A report without its attachments is still a report; one that failed to
    // build is not.
    return ours;
  }
}

export function installFileName(data: InstallReport): string {
  return `Installation Test - ${data.clientName} - ${data.testedOn
    .toISOString()
    .slice(0, 10)}.pdf`;
}
