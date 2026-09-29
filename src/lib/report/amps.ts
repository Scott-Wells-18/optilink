import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { personName } from "@/lib/contacts";
import { COMPANY, THERMOGRAPHER } from "@/lib/company";
import { reportSignature } from "@/lib/signatures";
import { readAmpRecording, clock, trim, type AmpReading, type Check } from "@/lib/amps/parse";
import {
  DEVICE_LABELS,
  duration,
  summariseAmps,
  type Device,
  type Figures,
} from "@/lib/amps/summary";
import { readInstrument, type Instrument } from "@/lib/report/instrument";
import { expiry } from "@/lib/report/calibration";
import {
  bar,
  coverPage,
  footer,
  newDocument,
  sectionBar,
  stampPageNumbers,
  type Doc,
  type PageMeta,
} from "@/lib/report/furniture";
import { ampScaleTop, drawAmpChart } from "@/lib/report/ampChart";
import { COLOURS, CONTENT, MARGIN, PAGE, longDate, safe, shortDate } from "@/lib/report/theme";

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
 */

export type Entry = {
  id: string;
  /** "A-Phase PIT JACKS". */
  name: string;
  rating: number | null;
  device: Device | null;
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
      rating: row.rating ?? null,
      device: (row.device as Device | null) ?? null,
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
      entries,
      logo: await brandBytes("logo.jpg"),
      signature: await reportSignature(),
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
    text: "Where an RCBO or RCD is named, the rating shown in this report is its stated current rating in amperes. That is a different thing from its residual-current rating, which is measured in milliamperes and is the earth-leakage current it trips on. The two must not be confused, and nothing in this report measures earth leakage.",
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

/* --- the document --------------------------------------------------------- */

/** Cover, summary and contents, then what the readings are. */
const FIRST_RECORDING = 4;

export async function buildAmpReport(data: AmpReport): Promise<Buffer> {
  const { doc, done } = newDocument();

  // How many pages each recording runs to has to be known before the contents
  // is drawn: a file with a page of unreadable rows carries them with it, and
  // every page number after it would otherwise be out.
  const plans = data.entries.map((entry) => plan(doc, entry));

  cover(doc, data);
  summary(doc, data, plans);
  about(doc, data);

  data.entries.forEach((entry, index) => {
    recordingPages(doc, data, entry, index, plans[index]);
  });

  limitations(doc, data);

  stampPageNumbers(doc, 0);
  doc.end();
  return done;
}

/* --- the cover ------------------------------------------------------------ */

function cover(doc: Doc, data: AmpReport) {
  const readings = data.entries.reduce((total, entry) => total + entry.figures.count, 0);
  const rated = data.entries.filter((entry) => entry.rating !== null).length;
  const where = [data.boardName, data.location].filter(Boolean).join(", ");

  coverPage(doc, data, {
    title: "Amp Reading Report",
    eyebrow: "Current recording",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: "Readings taken",
    date: data.takenOn,
    scopeLabel: data.entries.length === 1 ? "Circuit recorded" : "Circuits recorded",
    scope: data.entries.map(describeEntry).join("; "),
    scopeList: data.entries.map(describeEntry),
    rows: [
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
      ["Recorded by", `${THERMOGRAPHER.name} · ${COMPANY.name} · Lic ${COMPANY.licence}`],
    ],
    note:
      "This report records the current measured on the circuits listed above during the short periods stated inside. " +
      "It is issued to the addressee named above. It is a record of what was measured while the readings were being " +
      "taken; it does not establish maximum demand, and it does not confirm the adequacy of any cable or protective " +
      "device. The limitations at the back form part of it.",
    marks: [],
  });
}

/** "A-Phase PIT JACKS — 20 A circuit breaker" */
function describeEntry(entry: Entry): string {
  return entry.rating === null
    ? entry.name
    : `${entry.name} — ${ratingLine(entry)}`;
}

/** "20 A circuit breaker", or "20 A protective device" where it was not said. */
function ratingLine(entry: Entry): string {
  if (entry.rating === null) return "No rating entered";
  return `${trim(entry.rating)} A ${deviceWord(entry.device)}`;
}

/**
 * What to call the device in the middle of a sentence.
 *
 * "RCBO/RCD" keeps its capitals — they are initials, and "rcbo / rcd" in the
 * middle of a line reads like a typing error.
 */
function deviceWord(device: Device | null): string {
  if (device === "RCBO") return "RCBO/RCD";
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

function summary(doc: Doc, data: AmpReport, plans: Plan[]) {
  doc.addPage();
  sectionBar(doc, "Summary of Recordings", MARGIN);

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

  let y = MARGIN + 30;
  doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
  doc.text(opening, MARGIN, y, { width: CONTENT, lineGap: 2.4 });
  y = doc.y + 18;

  /* --- one row per recording --------------------------------------------- */
  const columns = [18, 126, 74, 52, 66, 60, 60, 55];
  const titles = ["#", "Recording", "Device", "Samples", "Period", "Highest", "Average", "Above"];
  y = table(doc, y, titles, columns, data);

  y += 10;
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  const note = safe(
    "“Average” is the mean of every reading in that recording, including any recorded zeros. " +
      "“Above” counts the readings higher than the stated rating of the device entered for that recording; " +
      "it is left blank where no rating was entered, and where none was entered no pass, fail or overload " +
      "conclusion is drawn.",
  );
  doc.text(note, MARGIN, y, { width: CONTENT, lineGap: 1.8 });
  y = doc.y + 22;

  /* --- what is in the report --------------------------------------------- */
  contents(doc, data, plans, y);
  footer(doc, data);
}

function endStop(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function table(doc: Doc, y: number, titles: string[], columns: number[], data: AmpReport): number {
  doc.rect(MARGIN, y, CONTENT, 20).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(7.5);
  let x = MARGIN;
  titles.forEach((title, index) => {
    const centred = index > 2;
    doc.text(title.toUpperCase(), centred ? x : x + 6, y + 7, {
      width: centred ? columns[index] : columns[index] - 10,
      align: centred ? "center" : "left",
      characterSpacing: 0.6,
      lineBreak: false,
    });
    x += columns[index];
  });
  y += 20;

  data.entries.forEach((entry, index) => {
    const height = 30;
    if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT, height).fill(COLOURS.soft);
    doc.rect(MARGIN, y + height, CONTENT, 0.5).fill(COLOURS.hair);

    const figures = entry.figures;
    const cells: [string, string | null][] = [
      [String(index + 1), null],
      [entry.name, entry.fileName],
      entry.rating === null
        ? ["\u2014", "no rating entered"]
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

    let at = MARGIN;
    cells.forEach(([value, note], column) => {
      const centred = column > 2;
      const width = columns[column];
      const highlight = column === 7 && entry.rating !== null && figures.above > 0;
      doc.font("Helvetica-Bold").fontSize(column === 1 ? 9 : 8.5);
      doc.fillColor(highlight ? COLOURS.alert : COLOURS.ink);
      doc.text(safe(value), centred ? at : at + 6, y + (note ? 5.5 : 10), {
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

function contents(doc: Doc, data: AmpReport, plans: Plan[], y: number) {
  const entries: [string, number][] = [];
  let page = FIRST_RECORDING;
  data.entries.forEach((entry, index) => {
    entries.push([`${index + 1}. ${entry.name}`, page]);
    page += plans[index].pages;
  });

  const rows: [string, number][] = [
    ["Summary of recordings", 2],
    ["About these readings", 3],
    ...entries,
    ["Limitations", page],
  ];

  label(doc, "What is in this report", MARGIN, y);
  y += 17;

  const columns = 2;
  const width = (CONTENT - 36) / columns;
  const perColumn = Math.ceil(rows.length / columns);

  rows.forEach(([title, at], index) => {
    const x = MARGIN + Math.floor(index / perColumn) * (width + 36);
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
  sectionBar(doc, "About These Readings", MARGIN);

  const gap = 34;
  const column = (CONTENT - gap) / 2;

  label(doc, "What current is, and why it is measured", MARGIN, MARGIN + 34);
  blocks(doc, MARGIN, MARGIN + 54, column, WHAT_CURRENT_IS);

  const x = MARGIN + column + gap;
  label(doc, "Readings above a device's rating", x, MARGIN + 34);
  const right = blocks(doc, x, MARGIN + 54, column, WHAT_ABOVE_MEANS);

  /* --- how to read a page of readings ------------------------------------ */
  const y = Math.max(right, doc.y) + 14;
  label(doc, "How to read each recording", MARGIN, y);
  const notes: [string, string][] = [
    ["Every sample", "Each chart shows every reading the instrument recorded. Nothing is grouped or averaged into intervals, so a peak of one second is on the page at full height."],
    ["Blue and red", "The line is blue at or below the stated rating and red above it, with the change drawn where the readings cross the rating rather than at the next sample. Stretches above the rating are also banded, so a single second is visible."],
    ["The figures", "The highest reading is ringed and labelled with its time. The average is the dashed line, taken across every reading in that recording including recorded zeros."],
    ["What was imported", "Each page states what the instrument's own summary said and what was actually imported from the file, and lists anything that could not be read."],
  ];

  const width = (CONTENT - 22 * (notes.length - 1)) / notes.length;
  notes.forEach(([title, body], index) => {
    const left = MARGIN + index * (width + 22);
    doc.rect(left, y + 19, width, 2.4).fill(COLOURS.accent);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.ink);
    doc.text(title, left, y + 30, { width, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(safe(body), left, y + 44, { width, lineGap: 1.7 });
  });

  doc.fillColor(COLOURS.ink);
  footer(doc, data);
}

/* --- a recording to a page ------------------------------------------------ */

/** Where the body of a recording's page begins and ends. */
const BODY = { top: MARGIN + 82, bottom: PAGE.height - 86 };
const CHART = { x: MARGIN + 36, y: MARGIN + 132, width: CONTENT - 46, height: 260 };

type Plan = { pages: number; inline: string[]; overflow: string[] };

/**
 * How much of a recording's account fits on its own page.
 *
 * Measured rather than guessed, so the contents can cite the page the next
 * recording actually lands on. A file that read cleanly — which is nearly all
 * of them — is one page.
 */
function plan(doc: Doc, entry: Entry): Plan {
  const notes = entry.reading.notes.slice(0, 200);
  // The panel and the checks are measured rather than allowed for, because a
  // stretch above the rating, a file with no summary and a file with four
  // figures in it all take different amounts of the page.
  const top = checksBottom(doc, entry) + 18;
  const room = BODY.bottom - top;

  const fitted: string[] = [];
  let used = 0;
  for (const note of notes) {
    const height = noteHeight(doc, note);
    if (used + height > room) break;
    fitted.push(note);
    used += height;
  }

  const overflow = notes.slice(fitted.length);
  let pages = 1;
  let left = 0;
  for (const note of overflow) {
    const height = noteHeight(doc, note);
    if (left === 0 || left + height > BODY.bottom - BODY.top) {
      pages += 1;
      left = height;
      continue;
    }
    left += height;
  }

  return { pages, inline: fitted, overflow };
}

function noteHeight(doc: Doc, note: string): number {
  doc.font("Helvetica").fontSize(8);
  return doc.heightOfString(safe(note), { width: CONTENT - 14, lineGap: 1.6 }) + 6;
}

const EXCURSION_ROWS = 8;

/* --- how tall each block of a recording's page turns out ------------------ */

/** Where the threshold panel starts: under the chart and its time axis. */
const PANEL_TOP = CHART.y + CHART.height + 46;

const NO_RATING_NOTE =
  "The readings above are reported as measured. Without the stated current rating of the device protecting " +
  "this circuit there is nothing to compare them against, so no threshold is drawn on the chart and no " +
  "pass, fail or overload conclusion is drawn here.";

/** The footnote under a list of stretches above the rating. */
function excursionNote(entry: Entry): string {
  const rating = trim(entry.rating ?? 0);
  return (
    `Durations are measured between the points at which the readings crossed ${rating} A and are approximate: ` +
    `the instrument sampled every ${everySeconds(entry)}, so what happened between two samples was not recorded. ` +
    "A reading above a device's stated rating is a measurement, not a finding — see “About these readings”."
  );
}

function noSummaryNote(entry: Entry): string {
  return (
    `${entry.figures.count.toLocaleString("en-AU")} readings were imported from ${entry.fileName}, from ` +
    `${clock(entry.figures.from)} to ${clock(entry.figures.to)}. The file carried no summary of its own for ` +
    "those figures to be checked against."
  );
}

function checkNote(entry: Entry): string {
  const disagreed = entry.reading.checks.filter((row) => !row.agrees);
  if (disagreed.length === 0) {
    return "Every figure the file states about itself matches what was imported from it.";
  }
  return (
    `${disagreed.map((row) => row.what.toLowerCase()).join(", ")} differ${
      disagreed.length === 1 ? "s" : ""
    } from what the file states about itself. What is shown above, on the chart and in the figures is what was ` +
    "imported from the readings themselves; the file's own figure is given beside it in brackets. Nothing has " +
    "been adjusted to make the two agree."
  );
}

function height(doc: Doc, text: string, size: number, width: number, gap: number): number {
  doc.font("Helvetica").fontSize(size);
  return doc.heightOfString(safe(text), { width, lineGap: gap });
}

/** How much of the page the threshold panel takes. */
function panelHeight(doc: Doc, entry: Entry): number {
  if (entry.rating === null) return 26 + height(doc, NO_RATING_NOTE, 8.5, CONTENT, 1.8) + 12;
  if (entry.figures.excursions.length === 0) return 20 + 22 + 12;

  const rows = Math.min(entry.figures.excursions.length, EXCURSION_ROWS);
  const spare = entry.figures.excursions.length - rows;
  return (
    20 +
    16 +
    rows * 22 +
    (spare > 0 ? 16 : 0) +
    6 +
    height(doc, excursionNote(entry), 7.5, CONTENT, 1.6) +
    12
  );
}

/** And the block that says what was imported against what the file claimed. */
function checksHeight(doc: Doc, entry: Entry): number {
  if (entry.reading.checks.length === 0) {
    return 16 + height(doc, noSummaryNote(entry), 8, CONTENT, 1.6) + 12;
  }
  return 16 + 40 + height(doc, checkNote(entry), 7.5, CONTENT, 1.6) + 12;
}

function checksBottom(doc: Doc, entry: Entry): number {
  return PANEL_TOP + panelHeight(doc, entry) + 18 + checksHeight(doc, entry);
}

function recordingPages(doc: Doc, data: AmpReport, entry: Entry, index: number, laid: Plan) {
  doc.addPage();
  sectionBar(doc, `${index + 1}. ${entry.name}`, MARGIN);

  /* --- what it is -------------------------------------------------------- */
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      [
        entry.rating === null ? "No protective-device rating entered" : ratingLine(entry),
        data.boardName,
        `From ${entry.fileName}`,
      ]
        .filter(Boolean)
        .join("  ·  "),
    ),
    MARGIN,
    MARGIN + 28,
    { width: CONTENT, height: 12, ellipsis: true },
  );

  /* --- the figures, before the chart that shows them --------------------- */
  const figures = entry.figures;
  tiles(doc, MARGIN + 46, [
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
  drawAmpChart(doc, CHART, {
    samples: entry.reading.samples,
    from: figures.from,
    to: figures.to,
    maxAmps: ampScaleTop(figures.max, entry.rating),
    rating: entry.rating,
    ratingLabel: entry.rating === null ? undefined : `${ratingLine(entry).toUpperCase()}`,
    average: figures.average,
    peak: { amps: figures.max, at: figures.maxAt },
    excursions: figures.excursions,
  });

  /* --- what went above the rating ---------------------------------------- */
  threshold(doc, entry);

  /* --- what was imported, and what was not ------------------------------- */
  let y = PANEL_TOP + panelHeight(doc, entry) + 18;
  y = checks(doc, entry, y);
  if (laid.inline.length > 0) y = noteList(doc, laid.inline, y, laid.overflow.length > 0);

  footer(doc, data);

  /* --- anything the page could not hold ---------------------------------- */
  let rest = laid.overflow;
  while (rest.length > 0) {
    doc.addPage();
    sectionBar(doc, `${index + 1}. ${entry.name}`, MARGIN);
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text("Readings that could not be read, continued", MARGIN, MARGIN + 28, {
      width: CONTENT,
    });

    let at = BODY.top;
    const fitted: string[] = [];
    for (const note of rest) {
      const height = noteHeight(doc, note);
      if (at + height > BODY.bottom) break;
      fitted.push(note);
      at += height;
    }
    noteList(doc, fitted, BODY.top - 24, rest.length > fitted.length, true);
    rest = rest.slice(Math.max(1, fitted.length));
    footer(doc, data);
  }
}

/** "every 1 s", or the plain truth where the instrument varied. */
function everySeconds(entry: Entry): string {
  const seconds = entry.reading.intervalSeconds;
  if (seconds <= 0) return "interval varied";
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

/** The five figures the page is about, across the top of it. */
function tiles(doc: Doc, y: number, items: [string, string, string][]) {
  const gap = 10;
  const width = (CONTENT - gap * (items.length - 1)) / items.length;

  items.forEach(([name, value, note], index) => {
    const x = MARGIN + index * (width + gap);
    doc.rect(x, y, width, 56).fill(COLOURS.soft);
    doc.rect(x, y, width, 2.4).fill(COLOURS.accent);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
    doc.text(name.toUpperCase(), x + 9, y + 11, { width: width - 18, characterSpacing: 1 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOURS.ink);
    doc.text(safe(value), x + 9, y + 23, { width: width - 18, height: 17, ellipsis: true });
    doc.font("Helvetica").fontSize(7).fillColor(COLOURS.inkSoft);
    doc.text(safe(note), x + 9, y + 41, { width: width - 18, height: 10, ellipsis: true });
  });
  doc.fillColor(COLOURS.ink);
}

/** What ran above the rating, or why there is nothing to say about it. */
function threshold(doc: Doc, entry: Entry) {
  const y = PANEL_TOP;
  const figures = entry.figures;

  if (entry.rating === null) {
    bar(doc, MARGIN, y, CONTENT, "No device rating was entered for this recording");
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(NO_RATING_NOTE), MARGIN, y + 26, { width: CONTENT, lineGap: 1.8 });
    doc.fillColor(COLOURS.ink);
    return;
  }

  const rating = entry.rating;
  bar(
    doc,
    MARGIN,
    y,
    CONTENT,
    `Readings above ${trim(rating)} A`,
    "left",
    figures.above > 0 ? COLOURS.alert : COLOURS.bar,
  );

  let at = y + 20;
  if (figures.excursions.length === 0) {
    doc.rect(MARGIN, at, CONTENT, 22).fill(COLOURS.soft);
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(
      safe(
        `No reading in this recording was above ${trim(rating)} A. The highest was ${trim(figures.max)} A at ${clock(figures.maxAt)}.`,
      ),
      MARGIN + 8,
      at + 6.5,
      { width: CONTENT - 16, height: 11, ellipsis: true },
    );
    doc.fillColor(COLOURS.ink);
    return;
  }

  const columns = [130, 96, 90, 90, CONTENT - 406];
  const titles = ["When", "Observed for", "Peak", "Samples above", "How far above"];
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
  let x = MARGIN;
  titles.forEach((title, index) => {
    doc.text(title.toUpperCase(), x + 6, at + 4, {
      width: columns[index] - 8,
      characterSpacing: 0.8,
    });
    x += columns[index];
  });
  at += 16;

  for (const run of figures.excursions.slice(0, EXCURSION_ROWS)) {
    doc.rect(MARGIN, at, CONTENT, 0.5).fill(COLOURS.hair);
    const cells = [
      `${clock(run.from)} – ${clock(run.to)}`,
      `${duration(run.seconds)} (approx.)`,
      `${trim(run.peak)} A at ${clock(run.peakAt)}`,
      `${run.samples} of ${figures.count}`,
      `${trim(Math.round((run.peak - rating) * 100) / 100)} A over, ${Math.round((run.peak / rating) * 100)}% of rating`,
    ];
    let left = MARGIN;
    cells.forEach((value, index) => {
      doc.font(index === 2 ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      doc.fillColor(index === 2 ? COLOURS.alert : COLOURS.ink);
      doc.text(safe(value), left + 6, at + 6, {
        width: columns[index] - 10,
        height: 11,
        ellipsis: true,
      });
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
      { width: CONTENT - 12, height: 11, ellipsis: true },
    );
    at += 16;
  }

  doc.rect(MARGIN, at, CONTENT, 0.5).fill(COLOURS.hair);
  doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(excursionNote(entry)), MARGIN, at + 6, { width: CONTENT, lineGap: 1.6 });
  doc.fillColor(COLOURS.ink);
}

/**
 * The instrument's own summary of the recording, against what was imported.
 *
 * Both are printed whether they agree or not. Where they disagree the report
 * says so rather than picking one, because the difference is usually the
 * instrument counting something differently — an average over its non-zero
 * samples, say — and that is worth a reader knowing.
 */
function checks(doc: Doc, entry: Entry, y: number): number {
  const rows: Check[] = entry.reading.checks;
  label(doc, "Checked against the file", MARGIN, y);
  y += 16;

  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(safe(noSummaryNote(entry)), MARGIN, y, { width: CONTENT, lineGap: 1.6 });
    doc.fillColor(COLOURS.ink);
    return doc.y + 12;
  }

  const width = (CONTENT - 8 * (rows.length - 1)) / rows.length;
  rows.forEach((row, index) => {
    const x = MARGIN + index * (width + 8);
    doc.rect(x, y, width, 34).fill(row.agrees ? COLOURS.soft : "#fdeceb");
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(COLOURS.inkSoft);
    doc.text(row.what.toUpperCase(), x + 7, y + 6, { width: width - 14, characterSpacing: 0.8 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(row.agrees ? COLOURS.ink : COLOURS.alert);
    doc.text(
      `${row.imported}${row.agrees ? "" : `  (file: ${row.declared})`}`,
      x + 7,
      y + 18,
      { width: width - 14, height: 11, ellipsis: true },
    );
  });
  y += 40;

  doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(checkNote(entry)), MARGIN, y, { width: CONTENT, lineGap: 1.6 });
  doc.fillColor(COLOURS.ink);
  return doc.y + 12;
}

/** Anything in the file that could not be read, said plainly. */
function noteList(
  doc: Doc,
  notes: string[],
  y: number,
  more: boolean,
  bare = false,
): number {
  let at = y;
  if (!bare) {
    label(doc, "Readings that could not be read", MARGIN, at);
    at += 18;
  } else {
    at += 24;
  }

  for (const note of notes) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.alert);
    doc.text("•", MARGIN, at, { lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.ink);
    doc.text(safe(note), MARGIN + 14, at, { width: CONTENT - 14, lineGap: 1.6 });
    at = doc.y + 6;
  }

  if (more) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text("Continued overleaf.", MARGIN + 14, at, { width: CONTENT - 14 });
    at = doc.y + 6;
  }

  doc.fillColor(COLOURS.ink);
  return at;
}

/* --- the limitations, and who recorded it --------------------------------- */

function limitations(doc: Doc, data: AmpReport) {
  doc.addPage();
  sectionBar(doc, "Limitations", MARGIN);

  let y = blocks(doc, MARGIN, MARGIN + 36, CONTENT, LIMITATIONS, 9.5);

  if (data.instrument) {
    y += 8;
    label(doc, "Recorded with", MARGIN, y);
    y += 16;
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(instrumentLine(data.instrument), MARGIN, y, { width: CONTENT, lineGap: 1.8 });
    y = doc.y + 6;
    const due = expiry(data.instrument.calibration);
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(
      due
        ? `The instrument's calibration certificate is held on file and is available on request.`
        : `No calibration certificate is recorded against this instrument.`,
      MARGIN,
      y,
      { width: CONTENT },
    );
    y = doc.y;
  }

  /* --- signed ------------------------------------------------------------ */
  const at = Math.max(y + 40, PAGE.height - 250);
  label(doc, "Recorded by", MARGIN, at);
  if (data.signature) doc.image(data.signature, MARGIN + 6, at + 18, { fit: [170, 46] });
  doc.rect(MARGIN, at + 66, 220, 0.8).fill(COLOURS.inkSoft);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(THERMOGRAPHER.name, MARGIN, at + 74, { lineBreak: false });
  doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.inkSoft);
  doc.text(COMPANY.name, MARGIN, at + 91, { lineBreak: false });
  doc.text(
    `Contractor Licence ${COMPANY.licence}  ·  Qualified Supervisor ${COMPANY.supervisor}`,
    MARGIN,
    at + 105,
    { lineBreak: false },
  );

  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      `Report date ${shortDate(data.reportDate)}. Readings taken ${shortDate(data.takenOn)} at ${
        data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName
      }.`,
    ),
    MARGIN + 260,
    at + 74,
    { width: CONTENT - 260, lineGap: 1.8 },
  );

  doc.fillColor(COLOURS.ink);
  footer(doc, data);
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
