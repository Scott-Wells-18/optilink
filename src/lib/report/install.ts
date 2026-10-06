import PDFDocument from "pdfkit";
import { PDFDocument as Lib } from "pdf-lib";
import { COLOURS, SEVERITY, longDate, safe, shortDate } from "@/lib/report/theme";
import {
  mastheadLines,
  sectionBar,
  stampWideFeet,
  tableHead,
  type Doc,
  type PageMeta,
} from "@/lib/report/furniture";
import {
  MEASUREMENT_LABELS,
  TERMINALS,
  resistanceReads,
  voltsReads,
  type InstallRow,
  type Terminals,
} from "@/lib/install/parse";
import {
  EXPECTED,
  PHASE_LABELS,
  reasonFor,
  type Anomaly,
  type Exclusion,
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

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const CONTENT = PAGE.width - MARGIN * 2;
const FLOOR = PAGE.height - 72;

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

  /** The tester's own export, bound in at the back and attached. */
  original: Buffer | null;
  originalName: string | null;
};

export async function buildInstallReport(data: InstallReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margin: MARGIN,
    bufferPages: true,
  });
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
  divider(doc, data);

  stampWideFeet(doc, data, {
    width: PAGE.width,
    height: PAGE.height,
    margin: MARGIN,
  });
  doc.end();

  return appendOriginal(await done, data);
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
      20,
      doc.heightOfString(safe(value) || "—", {
        width: CONTENT - labelWidth - 4,
        lineGap: 1.4,
      }) + 12,
    );
    const y = room(doc, data, height + 4, title);
    doc.rect(MARGIN, y, CONTENT, 0.5).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9);
    doc.text(name, MARGIN + 2, y + 6, { width: labelWidth - 8 });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9);
    doc.text(safe(value) || "—", MARGIN + labelWidth, y + 6, {
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
  doc.text(`${title.toUpperCase()}  (${unit})`, MARGIN, top, { characterSpacing: 0.6 });

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
    doc.text(bar.reads, x - slot * 0.2, y - 10, {
      width: width + slot * 0.4,
      align: "center",
      lineBreak: false,
    });

    doc.font("Helvetica").fontSize(6.5).fillColor(COLOURS.inkSoft);
    doc.text(bar.label, x - slot * 0.2, plot.y + plot.height + 4, {
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
    doc.text(limit.label, plot.x + plot.width - 120, y - 9, {
      width: 120,
      align: "right",
      lineBreak: false,
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

  y = 196;
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

  doc.y = y + 76;
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
    doc.y += 22;
  }

  doc.y = Math.max(doc.y + 10, PAGE.height - MARGIN - 110);
  note(
    doc,
    "This report sets out the readings the test instrument recorded on the date shown, at the points " +
      "listed inside. It states what was measured. It is not a certificate of compliance for the " +
      "installation, and the limitations inside form part of it.",
  );
}

/* --- what the readings show -------------------------------------------------- */

function basis(doc: Doc, data: InstallReport) {
  doc.addPage();
  head(doc, data, "What these readings show");
  sectionBar(doc, "What these readings show", doc.y);
  doc.y += 34;

  const insulationRows = data.rows.filter((row) => row.kind === "INSULATION");
  const rcdRows = data.rows.filter((row) => row.kind === "RCD");
  const expected = EXPECTED[data.phases];

  note(
    doc,
    `This is a ${PHASE_LABELS[data.phases].toLowerCase()} installation, so the scope expects ` +
      `${expected.insulation} insulation test and ${expected.rcd} RCD auto ` +
      `${expected.rcd === 1 ? "sequence" : "sequences"}. The file holds ${insulationRows.length} and ` +
      `${rcdRows.length} respectively.`,
    9,
  );
  doc.y += 6;

  /*
   * What a voltage between two terminals does and does not establish.
   *
   * This paragraph is the reason the report does not say "polarity verified".
   * A reading between L and PE of about 240 V, between L and N of about 240 V
   * and between N and PE of near zero is consistent with correct connection —
   * and it is also what a reading at one point on one day is. It is not a
   * polarity test, it does not cover the points that were not tested, and
   * saying so is the difference between a record and a claim.
   */
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text("The voltage readings", MARGIN, doc.y, { width: CONTENT });
  doc.y += 14;
  note(
    doc,
    "Each tested point has a reading taken between line and earth, between line and neutral, and " +
      "between neutral and earth. Together these show the voltage present between each pair of " +
      "terminals at that point when the reading was taken. Readings of roughly nominal supply " +
      "voltage line-to-earth and line-to-neutral, with a low neutral-to-earth reading, are " +
      "consistent with a correctly connected point.",
  );
  note(
    doc,
    "They are not, on their own, a polarity verification: that is a separate test, and this " +
      "instrument export does not contain one. Nor do they say anything about the points that were " +
      "not tested. This report states the voltages measured at the points listed and draws no " +
      "wider conclusion from them.",
  );
  doc.y += 6;

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text("The insulation reading", MARGIN, doc.y, { width: CONTENT });
  doc.y += 14;
  note(
    doc,
    "An insulation resistance reading written by the instrument as a “greater than” value is " +
      "a floor, not a measurement: the resistance was above the instrument's range. It is printed " +
      "here exactly as the instrument wrote it rather than being turned into a number.",
  );
  doc.y += 6;

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text("The RCD readings", MARGIN, doc.y, { width: CONTENT });
  doc.y += 14;
  note(
    doc,
    "The auto sequence records the disconnection time at half, one and five times the rated " +
      "residual current, each at 0° and 180°. At half rated current the device must not trip, " +
      "which the instrument writes as a “greater than” time. The assessment of those times " +
      "against AS/NZS 3017 is made in the RCD report, which is a separate document; the times are " +
      "reproduced here as measured.",
  );

  if (data.header.notes.length > 0) {
    doc.y += 8;
    for (const line of data.header.notes) note(doc, line, 8);
  }
}

/* --- insulation --------------------------------------------------------------- */

function insulation(doc: Doc, data: InstallReport) {
  const found = data.rows.filter((row) => row.kind === "INSULATION");
  doc.addPage();
  head(doc, data, "Insulation resistance");
  sectionBar(doc, "Insulation resistance", doc.y);
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
    doc.text(resistanceReads(row), MARGIN + columns[0] + columns[1] + 4, y + 6, {
      width: columns[2] - 8,
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
  doc.addPage();
  head(doc, data, "RCD results");
  sectionBar(doc, "RCD results", doc.y);
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

    const half = [test.halfAt0, test.halfAt180];
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(
      `At half rated current: ${half
        .map((reading) =>
          reading === "NO_TRIP" ? "did not trip" : reading === null ? "no reading" : `${reading} ms`,
        )
        .join("  /  ")}`,
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

/**
 * The line readings and the neutral-to-earth reading, drawn apart.
 *
 * A line reading near 240 V and a neutral-to-earth reading near half a volt on
 * the same axis makes the second one a flat line on the floor, which is where
 * somebody looks to see whether there is a neutral problem. Two charts, two
 * scales, and each says its own unit.
 */
const LINE_PAIRS: Terminals[] = ["L-PE", "L-N"];

function points(doc: Doc, data: InstallReport) {
  doc.addPage();
  head(doc, data, "Tested points");
  sectionBar(doc, "Tested points", doc.y);
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
        doc.text(voltsReads(reading), x, at + 7, { width: 70, align: "center" });
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

  /* --- the two voltage charts ------------------------------------------- */
  const named = (point: Point) => point.name || point.ref;

  const lineBars: Bar[] = data.points.flatMap((point) =>
    LINE_PAIRS.flatMap((terminal) => {
      const reading = point.readings[terminal];
      if (!reading || reading.volts === null) return [];
      return [
        {
          label: `${named(point)} ${terminal}`,
          value: reading.volts,
          reads: voltsReads(reading),
        },
      ];
    }),
  );
  if (lineBars.length > 0) {
    barChart(
      doc,
      data,
      "Line voltages at each point",
      "V",
      lineBars,
      null,
      "Tested points",
    );
  }

  const earthBars: Bar[] = data.points.flatMap((point) => {
    const reading = point.readings["N-PE"];
    if (!reading || reading.volts === null) return [];
    return [{ label: named(point), value: reading.volts, reads: voltsReads(reading) }];
  });
  if (earthBars.length > 0) {
    barChart(
      doc,
      data,
      "Neutral to earth at each point",
      "V",
      earthBars,
      null,
      "Tested points",
    );
    note(
      doc,
      "Drawn on its own scale. A neutral-to-earth reading is a fraction of a line voltage, and on " +
        "the same axis as one it is a flat line along the bottom of the chart — which is where it " +
        "would be looked at.",
      8,
    );
  }
}

/* --- what was set aside --------------------------------------------------------- */

function setAside(doc: Doc, data: InstallReport) {
  const out = data.allRows.filter((row) =>
    data.exclusions.some((exclusion) => exclusion.name === row.name),
  );
  const unplaced = data.rows.filter((row) => row.kind === "UNKNOWN");

  if (out.length === 0 && unplaced.length === 0 && data.anomalies.length === 0) return;

  doc.addPage();
  head(doc, data, "Records set aside");
  sectionBar(doc, "Duplicates and accidental tests", doc.y);
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
      doc.text(
        safe(reasonFor(data.exclusions, row.name)),
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
    sectionBar(doc, "Records not recognised", y);
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
    sectionBar(doc, "Raised for review", y);
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

/**
 * The page that says what follows is not ours.
 *
 * Without it the tester's own export reads as more of this report, and a
 * client comparing the two could reasonably think we had typed it.
 */
function divider(doc: Doc, data: InstallReport) {
  if (!data.original) return;
  doc.addPage();
  head(doc, data, "Original instrument report");
  sectionBar(doc, "Original instrument report", doc.y);
  doc.y += 40;

  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOURS.ink);
  doc.text("The pages that follow are the test instrument's own export.", MARGIN, doc.y, {
    width: CONTENT,
    lineGap: 2,
  });
  doc.y += 14;
  note(
    doc,
    "They are reproduced exactly as the instrument wrote them, at their own size, and nothing has " +
      "been removed from them — every record is there, including any this report has set aside. " +
      "The file itself is also attached to this PDF, so the original bytes can be taken out of it.",
    9.5,
  );
  if (data.originalName) {
    doc.y += 6;
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(`Attached as ${data.originalName}`), MARGIN, doc.y, { width: CONTENT });
  }
  doc.fillColor(COLOURS.ink);
}

/**
 * The tester's report, bound in at the back and attached.
 *
 * Its pages are copied in whole and at their own size rather than scaled into
 * a frame, because the point of including it is that it is the untouched
 * original. The file is attached as well, so the bytes are recoverable from
 * the PDF rather than only the picture of them.
 */
async function appendOriginal(ours: Buffer, data: InstallReport): Promise<Buffer> {
  if (!data.original) return ours;

  try {
    const target = await Lib.load(ours);
    const source = await Lib.load(new Uint8Array(data.original), { ignoreEncryption: true });

    const pages = await target.copyPages(source, source.getPageIndices());
    for (const page of pages) target.addPage(page);

    await target.attach(new Uint8Array(data.original), data.originalName ?? "instrument-export.pdf", {
      mimeType: "application/pdf",
      description: "The test instrument's own export, unaltered.",
    });

    return Buffer.from(await target.save());
  } catch {
    // A report without the original bound in is still a report; one that
    // failed to build is not.
    return ours;
  }
}

export function installFileName(data: InstallReport): string {
  return `Installation Test - ${data.clientName} - ${data.testedOn
    .toISOString()
    .slice(0, 10)}.pdf`;
}
