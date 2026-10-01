import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { personName } from "@/lib/contacts";
import { COMPANY, THERMOGRAPHER } from "@/lib/company";
import { preparedByFor } from "@/lib/profiles.server";
import { readAmpRecording, clock, trim, type AmpReading, type Check } from "@/lib/amps/parse";
import { numberRecordings, type Numbered } from "@/lib/amps/grouping";
import {
  DEVICE_LABELS,
  PHASE_LABELS,
  duration,
  summariseAmps,
  type Device,
  type Figures,
  type Phase,
} from "@/lib/amps/summary";
import { readInstrument, type Instrument } from "@/lib/report/instrument";
import { expiry } from "@/lib/report/calibration";
import {
  mastheadLines,
  signOffBlock,
  stampWideFeet,
  type PageMeta,
} from "@/lib/report/furniture";
import { stampCertificate } from "@/lib/report/certificate";
import { equipmentPageCount, equipmentPages } from "@/lib/report/equipment";
import { ampScaleTop, drawAmpChart } from "@/lib/report/ampChart";
import { COLOURS, longDate, safe, shortDate } from "@/lib/report/theme";

/**
 * The amp reading report.
 *
 * A clamp goes on one circuit for a minute and writes the current every second.
 * Do that on four circuits and you have four recordings that have to stay four
 * recordings: each one is a different circuit with its own protective device,
 * its own figures and its own chart, and the one thing that must never happen
 * is an average across the lot of them. A number that describes no circuit is
 * worse than no number.
 *
 * Where the device's rating was given, the report says what went above it, for
 * how long and how far — and stops there. Whether a brief excursion matters is
 * a question about the device's characteristic, the cable, the installation and
 * the duration, and this report holds the measurements rather than the verdict.
 * Where no rating was given it draws no conclusion at all.
 *
 * Landscape throughout, the way the power analysis is. A minute of readings a
 * second apart is a wide thing: given the width of the page the line has room
 * to show every sample it was drawn from, and the panels that read it sit side
 * by side underneath rather than stacked down a column.
 */

const PAGE = { width: 841.89, height: 595.28 };
const MARGIN = 34;
const CONTENT = PAGE.width - MARGIN * 2;

/** The foot of the page: where content stops and the page furniture starts. */
const FLOOR = PAGE.height - 54;

export type Entry = {
  id: string;
  /** "A-Phase PIT JACKS". */
  name: string;
  /** The section it belongs to, where it is in one. */
  groupName: string | null;
  rating: number | null;
  device: Device | null;
  /** The conductor the clamp went on, where it was said. */
  phase: Phase | null;
  fileName: string;
  reading: AmpReading;
  figures: Figures;
};

export type AmpReport = PageMeta & {
  location: string | null;
  boardName: string | null;
  purpose: string | null;
  contactName: string | null;
  instrument: Instrument | null;
  takenOn: Date;
  reportDate: Date;
  entries: Entry[];
};

export type AmpLoad =
  | { ok: true; report: AmpReport }
  | { ok: false; missing: boolean; reason: string };

/* --- gathering ------------------------------------------------------------ */

export async function loadAmpReport(id: string): Promise<AmpLoad> {
  const report = await prisma.ampReport.findUnique({
    where: { id },
    include: {
      recordings: {
        orderBy: { position: "asc" },
        include: { file: true },
      },
      equipment: { select: { name: true } },
      instrument: { include: { certFile: true, photoFile: true } },
      contact: { select: { name: true } },
      site: { include: { client: { select: { name: true } } } },
    },
  });
  if (!report) return { ok: false, missing: false, reason: "That report could not be found." };
  if (report.recordings.length === 0) {
    return {
      ok: false,
      missing: true,
      reason: "Add at least one recording. There is nothing to report until there is.",
    };
  }

  const entries: Entry[] = [];
  for (const row of report.recordings) {
    let bytes: Buffer;
    try {
      bytes = await readUpload(row.file.storedName);
    } catch {
      return {
        ok: false,
        missing: false,
        reason: `"${row.name}" could not be read back off disk.`,
      };
    }
    const reading = readAmpRecording(bytes, row.file.originalName);
    const figures = summariseAmps(reading.samples, row.rating ?? null);
    if (!figures) {
      return {
        ok: false,
        missing: true,
        reason: `No readings could be read out of "${row.name}". Replace that file, or remove it from the report.`,
      };
    }
    entries.push({
      id: row.id,
      name: safe(row.name),
      groupName: row.groupName ? safe(row.groupName) : null,
      rating: row.rating ?? null,
      device: (row.device as Device | null) ?? null,
      phase: (row.phase as Phase | null) ?? null,
      fileName: safe(row.file.originalName),
      reading,
      figures,
    });
  }

  return {
    ok: true,
    report: {
      clientName: safe(report.site.client.name),
      siteName: safe(report.site.name),
      siteLocation: report.site.location ? safe(report.site.location) : null,
      location: report.location ? safe(report.location) : null,
      boardName: report.equipment ? safe(report.equipment.name) : null,
      purpose: report.purpose ? safe(report.purpose) : null,
      contactName: report.contact
        ? safe(personName(report.contact.name))
        : report.contactName
          ? safe(report.contactName)
          : null,
      instrument: await readInstrument(report.instrument),
      takenOn: report.date,
      reportDate: new Date(),
      // In the order they will be printed: a recording put into a section
      // after the others moves up to join them, so a section is one section
      // under one number rather than two halves under two.
      entries: numberRecordings(entries).map((row) => row.item),
      logo: await brandBytes("logo.jpg"),
      preparedBy: await preparedByFor(report.preparedBy),
    },
  };
}

async function brandBytes(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}

/* --- the fixed wording ---------------------------------------------------- */

type Block = { text: string; bullets?: string[] };

const WHAT_CURRENT_IS: Block[] = [
  {
    text: "Current, measured in amperes (A), is the rate at which electricity flows through a conductor. Every appliance and machine on a circuit draws current while it operates, so the current on a circuit rises and falls with what is running on it at the time.",
  },
  {
    text: "Measuring it matters because current is what heats conductors and what protective devices respond to. A recording of the current a circuit actually draws in service is used to:",
    bullets: [
      "see what the circuit draws while the plant it feeds is working;",
      "compare that against the stated current rating of the device protecting it;",
      "inform decisions about adding load, or about investigating tripping or heating; and",
      "keep a dated record of what was measured, and when.",
    ],
  },
];

const WHAT_ABOVE_MEANS: Block[] = [
  {
    text: "Current above a protective device's stated current rating can be relevant to overloading, to the operation of the device, to heating at conductors and terminations, and to possible damage to cable or equipment over time. That is why any reading above the rating is marked on the charts in this report.",
  },
  {
    text: "It is set out carefully, because a measurement above a rating is not by itself a finding:",
    bullets: [
      "A brief excursion above a circuit breaker's rating does not prove that the breaker should have tripped immediately. Overcurrent devices are deliberately time-dependent and carry currents above their rating for a period that shortens as the current rises.",
      "It does not prove that a cable has been damaged, that anything has overheated, or that the installation is unsafe.",
      "Whether it matters depends on how far above the rating the current went and for how long, on the characteristics of the protective device, on the capacity of the cable, on the installation conditions and ambient temperature, and on other evidence beyond this recording.",
    ],
  },
  {
    text: "Where an RCBO is named, the rating shown in this report is its stated current rating in amperes. That is a different thing from its residual-current rating, which is measured in milliamperes and is the earth-leakage current it trips on. The two must not be confused, and nothing in this report measures earth leakage.",
  },
];

const LIMITATIONS: Block[] = [
  {
    text: "Each recording in this report represents only the conditions present on that circuit during the period it was recorded, with whatever was running at the time.",
  },
  {
    text: "Accordingly, this report:",
    bullets: [
      "does not establish the maximum demand of the circuit or of the installation;",
      "does not confirm that the cable, the protective device or any other part of the installation is adequate;",
      "does not rule out higher currents at other times, under other operating conditions, or on other days; and",
      "does not assess earth leakage, insulation, polarity, earthing or any other property of the installation.",
    ],
  },
  {
    text: "Figures are reported per recording. Readings from different circuits are never combined into one average, because a circuit is not described by an average taken across it and another one.",
  },
  {
    text: "Values are as recorded by the instrument at the point it was clamped, at the sample interval stated on each page. Anything in a file that could not be read is listed with the recording it came from rather than adjusted or filled in.",
  },
];

const HOW_TO_READ: [string, string][] = [
  [
    "Every sample",
    "Each chart shows every reading the instrument recorded. Nothing is grouped or averaged into intervals, so a peak of one second is on the page at full height.",
  ],
  [
    "Blue and red",
    "The line is blue at or below the stated rating and red above it, with the change drawn where the readings cross the rating rather than at the next sample. Stretches above the rating are also banded, so a single second is visible.",
  ],
  [
    "The figures",
    "The highest reading is ringed and labelled with its time. The average is the dashed line, taken across every reading in that recording including recorded zeros.",
  ],
  [
    "What was imported",
    "Each page states what the instrument's own summary said and what was actually imported from the file, and lists anything that could not be read.",
  ],
];

/* --- the document --------------------------------------------------------- */

/** Cover, summary and contents, then what the readings are. */
const FIRST_RECORDING = 4;

export async function buildAmpReport(data: AmpReport): Promise<Buffer> {
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

  // How many pages each recording runs to has to be known before the contents
  // is drawn: a file with a page of unreadable rows carries them with it, and
  // every page number after it would otherwise be out.
  // The entries arrive in printing order, so this only hangs a number on each
  // of them: "1." standing alone, or "a." under the section it is in.
  const numbered = numberRecordings(data.entries);
  const plans = numbered.map((row) => plan(doc, row.item));

  cover(doc, data);
  summary(doc, data, numbered, plans);
  about(doc, data);

  numbered.forEach((row, index) => {
    recordingPages(doc, data, row, plans[index]);
  });

  limitations(doc, data);

  // What took the readings, and the certificate that says it was in
  // calibration when it did — the same page the power analysis ends on, built
  // by the same code so the two cannot drift apart.
  const slots = equipmentPages(doc, data.instrument, (note) =>
    head(doc, data, "Equipment Used", note),
  );

  stampWideFeet(doc, data, { width: PAGE.width, height: PAGE.height, margin: MARGIN });
  doc.end();

  const pdf = await done;
  // The certificate's own pages go in last, into the gaps that were left and
  // bordered for them.
  const certificate = data.instrument?.certificate;
  return certificate ? stampCertificate(pdf, certificate, slots) : pdf;
}

/* --- the cover ------------------------------------------------------------ */

function cover(doc: Doc, data: AmpReport) {
  const readings = data.entries.reduce((total, entry) => total + entry.figures.count, 0);
  const rated = data.entries.filter((entry) => entry.rating !== null).length;
  const where = [data.boardName, data.location].filter(Boolean).join(", ");

  /* --- masthead ---------------------------------------------------------- */
  if (data.logo) doc.image(data.logo, MARGIN, 34, { fit: [158, 50] });
  const masthead = mastheadLines(doc, MARGIN + CONTENT - 250, 32, 250);

  const rule = Math.max(masthead + 8, 100);
  doc.rect(MARGIN, rule, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, rule - 1, 64, 2.6).fill(COLOURS.accent);

  /* --- left: what it is, and who for ------------------------------------- */
  const left = 430;
  let y = 132;

  doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(8.5);
  doc.text("CURRENT RECORDING", MARGIN, y, { width: left, characterSpacing: 2.2 });

  y += 18;
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(26);
  doc.text("Amp Reading Report", MARGIN, y, { width: left, lineGap: 2 });
  y += doc.heightOfString("Amp Reading Report", { width: left }) + 30;

  label(doc, "Prepared for", MARGIN, y);
  y += 15;
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(18);
  doc.text(data.clientName, MARGIN, y, { width: left });
  y += doc.heightOfString(data.clientName, { width: left }) + 5;
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLOURS.bar);
  doc.text(data.siteName, MARGIN, y, { width: left });
  y += 15;
  if (data.siteLocation && data.siteLocation !== data.siteName) {
    doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.inkSoft);
    doc.text(data.siteLocation, MARGIN, y, { width: left });
  }

  recordedBy(doc, data);

  /* --- right: what was recorded, and the facts --------------------------- */
  const x = MARGIN + left + 40;
  const width = CONTENT - left - 40;
  let at = 132;

  const listed = data.entries.slice(0, COVER_LIST);
  const spare = data.entries.length - listed.length;
  const cardHeight = 40 + listed.length * 13 + (spare > 0 ? 13 : 0) + 8;
  doc.rect(x, at, width, cardHeight).fill(COLOURS.soft);
  doc.rect(x, at, 3, cardHeight).fill(COLOURS.accent);
  label(doc, data.entries.length === 1 ? "Circuit recorded" : "Circuits recorded", x + 18, at + 13);

  let line = at + 30;
  for (const entry of listed) {
    doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(8.5);
    doc.text("•", x + 18, line + 1, { width: 8, lineBreak: false });
    doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(9.5);
    doc.text(safe(describeEntry(entry)), x + 29, line, {
      width: width - 47,
      height: 12,
      ellipsis: true,
      lineBreak: false,
    });
    line += 13;
  }
  if (spare > 0) {
    doc.fillColor(COLOURS.inkSoft).font("Helvetica-Oblique").fontSize(9);
    doc.text(`and ${spare} more, listed inside`, x + 29, line, { width: width - 47 });
  }
  at += cardHeight + 20;

  const facts: [string, string][] = [
    ["Readings taken", shortDate(data.takenOn)],
    ["Report date", shortDate(data.reportDate)],
    ["Site contact", data.contactName ?? data.clientName],
    ...(where ? ([["Recorded at", where]] as [string, string][]) : []),
    [
      "Recordings",
      `${data.entries.length} ${data.entries.length === 1 ? "recording" : "recordings"}, ${readings.toLocaleString("en-AU")} readings in all`,
    ],
    [
      "Device ratings",
      rated === data.entries.length
        ? "Entered for every recording"
        : rated === 0
          ? "None entered — measurements only"
          : `Entered for ${rated} of ${data.entries.length}`,
    ],
    ["Instrument", instrumentLine(data.instrument)],
  ];

  const labelWidth = 116;
  for (const [name, value] of facts) {
    doc.font("Helvetica").fontSize(9);
    const height = Math.max(24, doc.heightOfString(name, { width: labelWidth }) + 13);
    doc.rect(x, at, width, 0.6).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft);
    doc.text(name, x, at + 7, { width: labelWidth });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9.5);
    doc.text(safe(value), x + labelWidth + 8, at + 6.5, {
      width: width - labelWidth - 8,
      height: 12,
      ellipsis: true,
    });
    at += height;
  }
  doc.rect(x, at, width, 0.6).fill(COLOURS.hair);

  at += 14;
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      "This report records the current measured on the circuits listed above during the short periods stated " +
        "inside. It is a record of what was measured while the readings were being taken; it does not establish " +
        "maximum demand, and it does not confirm the adequacy of any cable or protective device. The limitations " +
        "at the back form part of it.",
    ),
    x,
    at,
    { width, lineGap: 1.6 },
  );

  doc.fillColor(COLOURS.ink).font("Helvetica");
}

/** How many circuits the cover card lists before it says "and N more". */
const COVER_LIST = 9;

/** Who took the readings, signed, at the foot of the cover's left column. */
function recordedBy(doc: Doc, data: AmpReport) {
  const y = PAGE.height - MARGIN - 170;

  label(doc, "Recorded by", MARGIN, y);
  signOffBlock(doc, data.preparedBy, MARGIN, y + 52, 430);
}

/** "A-Phase PIT JACKS — Red phase — 20 A circuit breaker" */
function describeEntry(entry: Entry): string {
  return [
    entry.name,
    entry.phase ? PHASE_LABELS[entry.phase] : null,
    entry.rating === null ? null : ratingLine(entry),
  ]
    .filter(Boolean)
    .join(" — ");
}

/**
 * What goes under a recording's name in the table.
 *
 * The phase first where one was given, because it is the thing that tells two
 * recordings of the same board apart; the file it came out of after it, which
 * is how the recording is traced back.
 */
function phaseLine(entry: Entry): string {
  return [entry.phase ? PHASE_LABELS[entry.phase].toUpperCase() : null, entry.fileName]
    .filter(Boolean)
    .join("  ·  ");
}

/** "20 A circuit breaker", or "20 A protective device" where it was not said. */
function ratingLine(entry: Entry): string {
  if (entry.rating === null) return "No rating entered";
  return `${trim(entry.rating)} A ${deviceWord(entry.device)}`;
}

/**
 * What to call the device in the middle of a sentence.
 *
 * "RCBO" keeps its capitals — they are initials, and "rcbo" in the middle of a
 * line reads like a typing error.
 */
function deviceWord(device: Device | null): string {
  if (device === "RCBO") return "RCBO";
  if (device === "BREAKER") return "circuit breaker";
  return "protective device";
}

function instrumentLine(instrument: Instrument | null): string {
  if (!instrument) return "—";
  const due = expiry(instrument.calibration);
  return safe(
    [
      instrument.name,
      instrument.modelNo,
      instrument.serialNo ? `S/N ${instrument.serialNo}` : null,
      due ? `calibration due ${shortDate(due.at)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

/* --- the summary and contents --------------------------------------------- */

function summary(doc: Doc, data: AmpReport, numbered: Numbered<Entry>[], plans: Plan[]) {
  doc.addPage();
  head(doc, data, "Summary of Recordings");

  const readings = data.entries.reduce((total, entry) => total + entry.figures.count, 0);
  const where = data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName;
  const opening = safe(
    `${data.entries.length} ${
      data.entries.length === 1 ? "circuit was" : "circuits were"
    } recorded at ${where} on ${longDate(data.takenOn)} for ${data.clientName}${
      data.boardName ? `, at ${data.boardName}` : ""
    }. ${readings.toLocaleString("en-AU")} ${
      readings === 1 ? "reading was" : "readings were"
    } imported in all.${
      data.purpose ? ` ${endStop(data.purpose)}` : ""
    } Each recording is of a separate circuit and is reported on its own: the figures below belong to the recording they sit on, and no average is taken across recordings.`,
  );

  let y = 104;
  doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
  doc.text(opening, MARGIN, y, { width: CONTENT, lineGap: 2.4 });
  y = doc.y + 20;

  y = table(doc, y, numbered);

  y += 10;
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      "“Average” is the mean of every reading in that recording, including any recorded zeros. " +
        "“Above” counts the readings higher than the stated rating of the device entered for that recording; " +
        "it is left blank where no rating was entered, and where none was entered no pass, fail or overload " +
        "conclusion is drawn.",
    ),
    MARGIN,
    y,
    { width: CONTENT, lineGap: 1.8 },
  );
  y = doc.y + 24;

  contents(doc, data, numbered, plans, y);
}

function endStop(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

/** The widths of the summary table, which add up to the page. */
const COLUMNS = [26, 214, 118, 68, 100, 92, 86, 70];

function table(doc: Doc, y: number, numbered: Numbered<Entry>[]): number {
  const titles = ["#", "Recording", "Device", "Samples", "Period", "Highest", "Average", "Above"];

  doc.rect(MARGIN, y, CONTENT, 20).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(7.5);
  let x = MARGIN;
  titles.forEach((title, index) => {
    const centred = index > 2;
    doc.text(title.toUpperCase(), centred ? x : x + 6, y + 7, {
      width: centred ? COLUMNS[index] : COLUMNS[index] - 10,
      align: centred ? "center" : "left",
      characterSpacing: 0.6,
      lineBreak: false,
    });
    x += COLUMNS[index];
  });
  y += 20;

  numbered.forEach((row, index) => {
    const entry = row.item;

    // A section is announced once, across the table, and its recordings are
    // lettered under it. The row carries no figures of its own: the figures
    // belong to the recordings, and no average is taken across them.
    if (row.opensGroup) {
      doc.rect(MARGIN, y, CONTENT, 19).fill(COLOURS.soft);
      doc.rect(MARGIN, y, 3, 19).fill(COLOURS.accent);
      doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9);
      doc.text(`${row.groupNumber}.  ${safe(row.group ?? "")}`, MARGIN + 12, y + 5, {
        width: CONTENT - 24,
        height: 11,
        ellipsis: true,
        lineBreak: false,
      });
      y += 19;
    }

    const height = 30;
    if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT, height).fill(COLOURS.soft);
    doc.rect(MARGIN, y + height, CONTENT, 0.5).fill(COLOURS.hair);

    const figures = entry.figures;
    const cells: [string, string | null][] = [
      [row.label.replace(/\.$/, ""), null],
      [entry.name, phaseLine(entry)],
      entry.rating === null
        ? ["—", "no rating entered"]
        : [`${trim(entry.rating)} A`, deviceWord(entry.device)],
      [figures.count.toLocaleString("en-AU"), null],
      [duration(figures.seconds), `${clock(figures.from)}–${clock(figures.to)}`],
      [`${trim(figures.max)} A`, clock(figures.maxAt)],
      [`${figures.average.toFixed(2)} A`, null],
      [
        entry.rating === null ? "—" : `${figures.above} of ${figures.count}`,
        entry.rating === null ? null : figures.above > 0 ? "above rating" : "none",
      ],
    ];

    // A lettered row's letter sits in from the margin, so a section reads as a
    // section rather than as a run of rows that happen to be next to each
    // other. Only the letter moves: the columns stay where they are, or the
    // figures would not line up down the table.
    const indent = row.group ? 8 : 0;
    let at = MARGIN;
    cells.forEach(([value, note], column) => {
      const centred = column > 2;
      const width = COLUMNS[column];
      const highlight = column === 7 && entry.rating !== null && figures.above > 0;
      doc.font("Helvetica-Bold").fontSize(column === 1 ? 9 : 8.5);
      doc.fillColor(highlight ? COLOURS.alert : COLOURS.ink);
      doc.text(safe(value), centred ? at : at + 6 + (column === 0 ? indent : 0), y + (note ? 5.5 : 10), {
        width: centred ? width : width - 10,
        align: centred ? "center" : "left",
        height: 11,
        ellipsis: true,
      });
      if (note) {
        doc.font("Helvetica").fontSize(7).fillColor(COLOURS.inkSoft);
        doc.text(safe(note), centred ? at : at + 6, y + 17.5, {
          width: centred ? width : width - 10,
          align: centred ? "center" : "left",
          height: 9,
          ellipsis: true,
        });
      }
      at += width;
    });
    y += height;
  });

  doc.fillColor(COLOURS.ink);
  return y;
}

function contents(
  doc: Doc,
  data: AmpReport,
  numbered: Numbered<Entry>[],
  plans: Plan[],
  y: number,
) {
  // A section opens on the page its first recording opens on, so a client
  // turning to "1. Pit Jacks Distribution Board" lands on the first of them.
  const entries: [string, number][] = [];
  let page = FIRST_RECORDING;
  numbered.forEach((row, index) => {
    if (row.opensGroup) entries.push([`${row.groupNumber}. ${row.group}`, page]);
    entries.push([
      row.group ? `     ${row.label} ${row.item.name}` : `${row.label} ${row.item.name}`,
      page,
    ]);
    page += plans[index].pages;
  });

  const rows: [string, number][] = [
    ["Summary of recordings", 2],
    ["About these readings", 3],
    ...entries,
    ["Limitations", page],
    ...(equipmentPageCount(data.instrument) > 0
      ? ([["Equipment used", page + 1]] as [string, number][])
      : []),
  ];

  label(doc, "What is in this report", MARGIN, y);
  y += 17;

  const columns = 3;
  const width = (CONTENT - 40 * (columns - 1)) / columns;
  const perColumn = Math.ceil(rows.length / columns);

  rows.forEach(([title, at], index) => {
    const x = MARGIN + Math.floor(index / perColumn) * (width + 40);
    const top = y + (index % perColumn) * 16;
    doc.rect(x, top + 13, width, 0.5).fill(COLOURS.hair);
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(safe(title), x, top + 2, { width: width - 26, height: 11, ellipsis: true });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text(String(at), x + width - 24, top + 2, { width: 24, align: "right" });
  });
  doc.fillColor(COLOURS.ink);
}

/* --- what the readings are ------------------------------------------------ */

function about(doc: Doc, data: AmpReport) {
  doc.addPage();
  head(doc, data, "About These Readings");

  const gap = 46;
  const column = (CONTENT - gap) / 2;

  label(doc, "What current is, and why it is measured", MARGIN, 104);
  const leftEnd = blocks(doc, MARGIN, 124, column, WHAT_CURRENT_IS);

  const x = MARGIN + column + gap;
  label(doc, "Readings above a device's rating", x, 104);
  const rightEnd = blocks(doc, x, 124, column, WHAT_ABOVE_MEANS);

  /* --- how to read a page of readings ------------------------------------ */
  const y = Math.min(Math.max(leftEnd, rightEnd) + 20, FLOOR - 92);
  label(doc, "How to read each recording", MARGIN, y);

  const width = (CONTENT - 22 * (HOW_TO_READ.length - 1)) / HOW_TO_READ.length;
  HOW_TO_READ.forEach(([title, body], index) => {
    const left = MARGIN + index * (width + 22);
    doc.rect(left, y + 19, width, 2.4).fill(COLOURS.accent);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.ink);
    doc.text(title, left, y + 30, { width, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(safe(body), left, y + 44, { width, lineGap: 1.7 });
  });

  doc.fillColor(COLOURS.ink);
}

/* --- a recording to a page ------------------------------------------------ */

/** The chart, and the two panels that read it, on a landscape page. */
const CHART = { x: MARGIN + 40, y: 168, width: CONTENT - 58 };
const PANEL = { gap: 30, left: 456 };

/** How many stretches above the rating a page lists before it summarises. */
const EXCURSION_ROWS = 4;

/**
 * How tall the chart is on a given recording's page.
 *
 * A recording that crossed its rating once needs one row under the chart; one
 * that crossed it four times needs four, and they come out of the chart rather
 * than off the bottom of the page. The floor keeps a chart a chart.
 */
function chartHeight(entry: Entry): number {
  const rows = Math.min(entry.figures.excursions.length, EXCURSION_ROWS);
  return Math.max(172, 226 - Math.max(0, rows - 1) * 22);
}

/** Where the panels under the chart begin, for a given recording. */
function panelTop(entry: Entry): number {
  return CHART.y + chartHeight(entry) + 44;
}

type Plan = { pages: number; notes: string[] };

/**
 * How many pages a recording runs to.
 *
 * One, plus however many the readings that could not be read need behind it.
 * A file that read cleanly — which is nearly all of them — is one page, and
 * the notes only ever push the page count when there is something to say.
 */
function plan(doc: Doc, entry: Entry): Plan {
  const notes = entry.reading.notes.slice(0, 200);
  if (notes.length === 0) return { pages: 1, notes };

  const column = (CONTENT - 40) / 2;
  const room = FLOOR - (MARGIN + 74);
  let pages = 1;
  let used = 0;
  let columnsLeft = 2;

  for (const note of notes) {
    const height = noteHeight(doc, note, column);
    if (used + height <= room) {
      used += height;
      continue;
    }
    columnsLeft -= 1;
    used = height;
    if (columnsLeft === 0) {
      pages += 1;
      columnsLeft = 2;
    }
  }

  return { pages: pages + 1, notes };
}

function noteHeight(doc: Doc, note: string, width: number): number {
  doc.font("Helvetica").fontSize(8);
  return doc.heightOfString(safe(note), { width: width - 14, lineGap: 1.6 }) + 7;
}

function recordingPages(doc: Doc, data: AmpReport, row: Numbered<Entry>, laid: Plan) {
  const entry = row.item;
  doc.addPage();
  head(
    doc,
    data,
    `${row.label} ${entry.name}`,
    [
      // The section first, so a page read on its own still says which board
      // its letter belongs to.
      row.group ? `${row.groupNumber}. ${row.group}` : null,
      entry.rating === null ? "No protective-device rating entered" : ratingLine(entry),
      `From ${entry.fileName}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    entry.phase,
  );

  /* --- the figures, before the chart that shows them --------------------- */
  const figures = entry.figures;
  tiles(doc, 90, [
    ["Samples", figures.count.toLocaleString("en-AU"), `every ${everySeconds(entry)}`],
    ["Recording", duration(figures.seconds), `${clock(figures.from)} to ${clock(figures.to)}`],
    ["Highest", `${trim(figures.max)} A`, `at ${clock(figures.maxAt)}`],
    [
      "Average",
      `${figures.average.toFixed(2)} A`,
      figures.zeros > 0
        ? `all ${figures.count}, incl. ${figures.zeros} zero`
        : `all ${figures.count} readings`,
    ],
    entry.rating === null
      ? ["Rating", "—", "none entered"]
      : ["Rating", `${trim(entry.rating)} A`, entry.device ? DEVICE_LABELS[entry.device] : "device"],
  ]);

  /* --- the chart --------------------------------------------------------- */
  drawAmpChart(doc, { ...CHART, height: chartHeight(entry) }, {
    samples: entry.reading.samples,
    from: figures.from,
    to: figures.to,
    maxAmps: ampScaleTop(figures.max, entry.rating),
    rating: entry.rating,
    ratingLabel: entry.rating === null ? undefined : ratingLine(entry).toUpperCase(),
    average: figures.average,
    peak: { amps: figures.max, at: figures.maxAt },
    excursions: figures.excursions,
  });

  /* --- what went above the rating, and what was imported ----------------- */
  threshold(doc, entry);
  checks(doc, entry);

  /* --- anything the file could not give ---------------------------------- */
  if (laid.notes.length > 0) notePages(doc, data, row, laid.notes);
}

/** "1 second", or the plain truth where the instrument varied. */
function everySeconds(entry: Entry): string {
  const seconds = entry.reading.intervalSeconds;
  if (seconds <= 0) return "interval varied";
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

/** The five figures the page is about, across the top of it. */
function tiles(doc: Doc, y: number, items: [string, string, string][]) {
  const gap = 12;
  const width = (CONTENT - gap * (items.length - 1)) / items.length;

  items.forEach(([name, value, note], index) => {
    const x = MARGIN + index * (width + gap);
    doc.rect(x, y, width, 56).fill(COLOURS.soft);
    doc.rect(x, y, width, 2.4).fill(COLOURS.accent);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
    doc.text(name.toUpperCase(), x + 10, y + 11, { width: width - 20, characterSpacing: 1 });
    doc.font("Helvetica-Bold").fontSize(15).fillColor(COLOURS.ink);
    doc.text(safe(value), x + 10, y + 23, { width: width - 20, height: 18, ellipsis: true });
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(note), x + 10, y + 42, { width: width - 20, height: 10, ellipsis: true });
  });
  doc.fillColor(COLOURS.ink);
}

const NO_RATING_NOTE =
  "The readings above are reported as measured. Without the stated current rating of the device protecting " +
  "this circuit there is nothing to compare them against, so no threshold is drawn on the chart and no " +
  "pass, fail or overload conclusion is drawn here.";

/** What ran above the rating, or why there is nothing to say about it. */
function threshold(doc: Doc, entry: Entry) {
  const y = panelTop(entry);
  const width = PANEL.left;
  const figures = entry.figures;

  if (entry.rating === null) {
    panelBar(doc, MARGIN, y, width, "No device rating was entered for this recording", COLOURS.bar);
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(NO_RATING_NOTE), MARGIN, y + 26, { width, lineGap: 1.8 });
    doc.fillColor(COLOURS.ink);
    return;
  }

  const rating = entry.rating;
  panelBar(
    doc,
    MARGIN,
    y,
    width,
    `Readings above ${trim(rating)} A`,
    figures.above > 0 ? COLOURS.alert : COLOURS.bar,
  );

  let at = y + 20;
  if (figures.excursions.length === 0) {
    doc.rect(MARGIN, at, width, 22).fill(COLOURS.soft);
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(
      safe(
        `No reading was above ${trim(rating)} A. The highest was ${trim(figures.max)} A at ${clock(figures.maxAt)}.`,
      ),
      MARGIN + 8,
      at + 6.5,
      { width: width - 16, height: 11, ellipsis: true },
    );
    doc.fillColor(COLOURS.ink);
    return;
  }

  const columns = [112, 84, 104, 72, width - 372];
  const titles = ["When", "Observed for", "Peak", "Samples", "How far above"];
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
  let x = MARGIN;
  titles.forEach((title, index) => {
    doc.text(title.toUpperCase(), x + 6, at + 4, {
      width: columns[index] - 8,
      characterSpacing: 0.8,
      lineBreak: false,
    });
    x += columns[index];
  });
  at += 16;

  for (const run of figures.excursions.slice(0, EXCURSION_ROWS)) {
    doc.rect(MARGIN, at, width, 0.5).fill(COLOURS.hair);
    const cells: [string, string | null][] = [
      [`${clock(run.from)} – ${clock(run.to)}`, null],
      [duration(run.seconds), "approx."],
      [`${trim(run.peak)} A`, `at ${clock(run.peakAt)}`],
      [`${run.samples} of ${figures.count}`, null],
      [
        `${trim(Math.round((run.peak - rating) * 100) / 100)} A over`,
        `${Math.round((run.peak / rating) * 100)}% of rating`,
      ],
    ];
    let left = MARGIN;
    cells.forEach(([value, note], index) => {
      doc.font(index === 2 ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      doc.fillColor(index === 2 ? COLOURS.alert : COLOURS.ink);
      doc.text(safe(value), left + 6, at + (note ? 3.5 : 6), {
        width: columns[index] - 10,
        height: 11,
        ellipsis: true,
      });
      if (note) {
        doc.font("Helvetica").fontSize(6.5).fillColor(COLOURS.inkSoft);
        doc.text(safe(note), left + 6, at + 13, {
          width: columns[index] - 10,
          height: 9,
          ellipsis: true,
        });
      }
      left += columns[index];
    });
    at += 22;
  }

  const spare = figures.excursions.length - EXCURSION_ROWS;
  if (spare > 0) {
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(
      `and ${spare} further ${spare === 1 ? "stretch" : "stretches"} above the rating, all shown on the chart.`,
      MARGIN + 6,
      at + 4,
      { width: width - 12, height: 11, ellipsis: true },
    );
    at += 16;
  }

  doc.rect(MARGIN, at, width, 0.5).fill(COLOURS.hair);
  doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(excursionNote(entry)), MARGIN, at + 6, { width, lineGap: 1.6 });
  doc.fillColor(COLOURS.ink);
}

/** The footnote under a list of stretches above the rating. */
function excursionNote(entry: Entry): string {
  const rating = trim(entry.rating ?? 0);
  return (
    `Durations are measured between the points at which the readings crossed ${rating} A and are approximate: ` +
    `the instrument sampled every ${everySeconds(entry)}, so what happened between two samples was not recorded. ` +
    "A reading above a device's stated rating is a measurement, not a finding — see “About these readings”."
  );
}

/**
 * The instrument's own summary of the recording, against what was imported.
 *
 * Both are printed whether they agree or not. Where they disagree the report
 * says so rather than picking one, because the difference is usually the
 * instrument counting something differently — an average over its non-zero
 * samples, say — and that is worth a reader knowing.
 */
function checks(doc: Doc, entry: Entry) {
  const x = MARGIN + PANEL.left + PANEL.gap;
  const width = CONTENT - PANEL.left - PANEL.gap;
  let y = panelTop(entry);

  label(doc, "Checked against the file", x, y);
  y += 17;

  const rows: Check[] = entry.reading.checks;
  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(
      safe(
        `${entry.figures.count.toLocaleString("en-AU")} readings were imported from this file, from ` +
          `${clock(entry.figures.from)} to ${clock(entry.figures.to)}. It carried no summary of its own for ` +
          "those figures to be checked against.",
      ),
      x,
      y,
      { width, lineGap: 1.6 },
    );
    y = doc.y + 8;
  } else {
    for (const row of rows) {
      doc.rect(x, y, width, 17).fill(row.agrees ? COLOURS.soft : "#fdeceb");
      doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
      doc.text(row.what, x + 7, y + 5, { width: width * 0.45, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(row.agrees ? COLOURS.ink : COLOURS.alert);
      doc.text(
        `${row.imported}${row.agrees ? "" : `  (file: ${row.declared})`}`,
        x + width * 0.45,
        y + 4.5,
        { width: width * 0.55 - 8, align: "right", height: 10, ellipsis: true },
      );
      y += 19;
    }

    const disagreed = rows.filter((row) => !row.agrees);
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(
      safe(
        disagreed.length === 0
          ? "Every figure the file states about itself matches what was imported from it."
          : `${disagreed.map((row) => row.what.toLowerCase()).join(", ")} differ${
              disagreed.length === 1 ? "s" : ""
            } from what the file states about itself. What is shown on this page is what was imported from the ` +
              "readings themselves, with the file's own figure beside it in brackets. Nothing has been adjusted " +
              "to make the two agree.",
      ),
      x,
      y + 4,
      { width, lineGap: 1.5 },
    );
    y = doc.y + 8;
  }

  /* --- how the file had to be read --------------------------------------- */
  for (const remark of entry.reading.remarks) {
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(remark), x, y, { width, lineGap: 1.5 });
    y = doc.y + 4;
  }

  if (entry.reading.notes.length > 0) {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.alert);
    doc.text(
      `${entry.reading.notes.length} ${
        entry.reading.notes.length === 1 ? "note" : "notes"
      } on readings that could not be read — overleaf.`,
      x,
      y + 2,
      { width, lineGap: 1.5 },
    );
  }

  doc.fillColor(COLOURS.ink);
}

/** Anything in the file that could not be read, said plainly, two columns. */
function notePages(doc: Doc, data: AmpReport, row: Numbered<Entry>, notes: string[]) {
  const entry = row.item;
  const column = (CONTENT - 40) / 2;
  let at = 0;
  let side = 0;
  let fresh = true;
  let y = 0;

  const start = () => {
    doc.addPage();
    head(
      doc,
      data,
      `${row.label} ${entry.name}`,
      "Readings that could not be read, and what was done about them",
      entry.phase,
    );
    y = MARGIN + 74;
    side = 0;
    fresh = false;
  };

  for (const note of notes) {
    if (fresh) start();
    const height = noteHeight(doc, note, column);
    if (y + height > FLOOR) {
      side += 1;
      y = MARGIN + 74;
      if (side > 1) {
        fresh = true;
        start();
      }
    }
    const x = MARGIN + side * (column + 40);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.alert);
    doc.text("•", x, y, { lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.ink);
    doc.text(safe(note), x + 14, y, { width: column - 14, lineGap: 1.6 });
    y = doc.y + 7;
    at += 1;
  }

  // Every note is on the page, or there were none to put there.
  if (at === 0) start();
  doc.fillColor(COLOURS.ink);
}

/* --- the limitations, and who recorded it --------------------------------- */

function limitations(doc: Doc, data: AmpReport) {
  doc.addPage();
  head(doc, data, "Limitations");

  const gap = 46;
  const column = (CONTENT - gap) / 2;

  const left = blocks(doc, MARGIN, 104, column, LIMITATIONS, 9.5);

  const x = MARGIN + column + gap;
  let y = 104;
  if (data.instrument) {
    label(doc, "Recorded with", x, y);
    y += 16;
    doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
    doc.text(instrumentLine(data.instrument), x, y, { width: column, lineGap: 1.8 });
    y = doc.y + 6;
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(
      expiry(data.instrument.calibration)
        ? "The instrument's calibration certificate is held on file and is available on request."
        : "No calibration certificate is recorded against this instrument.",
      x,
      y,
      { width: column, lineGap: 1.6 },
    );
    y = doc.y + 24;
  }

  label(doc, "What was recorded", x, y);
  y += 16;
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
  for (const entry of data.entries) {
    doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(8.5);
    doc.text("•", x, y + 1, { width: 8, lineBreak: false });
    doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(9);
    doc.text(safe(describeEntry(entry)), x + 12, y, {
      width: column - 12,
      height: 12,
      ellipsis: true,
      lineBreak: false,
    });
    y += 14;
  }

  /* --- signed ------------------------------------------------------------ */
  const at = Math.max(Math.max(left, y) + 30, PAGE.height - MARGIN - 150);
  label(doc, "Recorded by", MARGIN, at);
  signOffBlock(doc, data.preparedBy, MARGIN, at + 48, CONTENT - 300);

  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      `Report date ${shortDate(data.reportDate)}. Readings taken ${shortDate(data.takenOn)} at ${
        data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName
      }.`,
    ),
    MARGIN + 280,
    at + 70,
    { width: 300, lineGap: 1.8 },
  );

  doc.fillColor(COLOURS.ink);
}

/* --- page furniture ------------------------------------------------------- */

function head(doc: Doc, data: AmpReport, title: string, note?: string, phase?: Phase | null) {
  if (data.logo) doc.image(data.logo, MARGIN, 24, { fit: [118, 38] });

  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOURS.ink);
  doc.text(safe(title), MARGIN + 136, 26, { width: CONTENT - 136, height: 18, ellipsis: true });

  // The phase sits under the name rather than beside it: the name is what the
  // circuit is called and the phase is which conductor it was taken on, and a
  // reader looking for the second should not have to find it in a run of
  // details after the first.
  let x = MARGIN + 136;
  if (phase) {
    const text = PHASE_LABELS[phase].toUpperCase();
    doc.font("Helvetica-Bold").fontSize(7.5);
    const width = doc.widthOfString(text, { characterSpacing: 1.2 }) + 16;
    doc.roundedRect(x, 44, width, 14, 3).fill(COLOURS.band);
    doc.fillColor(COLOURS.bar);
    doc.text(text, x + 8, 47.5, { characterSpacing: 1.2, lineBreak: false });
    x += width + 10;
  }

  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text(
    safe([note, data.boardName, data.siteName, data.clientName].filter(Boolean).join("  ·  ")),
    x,
    47,
    { width: MARGIN + CONTENT - x, height: 11, ellipsis: true },
  );

  doc.rect(MARGIN, 72, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, 71, 54, 2.4).fill(COLOURS.accent);
  doc.fillColor(COLOURS.ink);
}

/** A panel's own heading bar, narrower than the page. */
function panelBar(doc: Doc, x: number, y: number, width: number, title: string, colour: string) {
  doc.rect(x, y, width, 19).fill(colour);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(9.5);
  doc.text(safe(title), x + 8, y + 5.5, { width: width - 16, height: 12, ellipsis: true });
  doc.fillColor(COLOURS.ink);
}

/* --- small things --------------------------------------------------------- */

/** A stack of paragraphs and bullet lists. Returns where it finished. */
function blocks(doc: Doc, x: number, y: number, width: number, items: Block[], size = 9): number {
  let at = y;
  for (const item of items) {
    const text = safe(item.text);
    doc.font("Helvetica").fontSize(size).fillColor(COLOURS.ink);
    doc.text(text, x, at, { width, lineGap: 2.2, align: "justify" });
    at += doc.heightOfString(text, { width, lineGap: 2.2 }) + (item.bullets ? 7 : 11);

    for (const bullet of item.bullets ?? []) {
      const body = safe(bullet);
      doc.font("Helvetica").fontSize(size).fillColor(COLOURS.accent);
      doc.text("•", x + 3, at, { lineBreak: false });
      doc.fillColor(COLOURS.ink);
      doc.text(body, x + 15, at, { width: width - 15, lineGap: 2.2 });
      at += doc.heightOfString(body, { width: width - 15, lineGap: 2.2 }) + 5;
    }
    if (item.bullets) at += 9;
  }
  return at;
}

/** A small letterspaced heading, the one marker of hierarchy on a page. */
function label(doc: Doc, text: string, x: number, y: number) {
  doc.fillColor(COLOURS.inkSoft).font("Helvetica-Bold").fontSize(8);
  doc.text(text.toUpperCase(), x, y, { characterSpacing: 1.6, lineBreak: false });
  doc.fillColor(COLOURS.ink);
}

type Doc = PDFKit.PDFDocument;
