import { readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import { COMPANY, THERMOGRAPHER } from "@/lib/company";
import { readUpload } from "@/lib/storage";
import { reportSignature } from "@/lib/signatures";
import { COLOURS, safe, shortDate } from "@/lib/report/theme";
import { type PageMeta } from "@/lib/report/furniture";
import { readCalibration, type Calibration } from "@/lib/report/calibration";
import {
  fitted,
  readCertificate,
  stampCertificate,
  type Box,
  type Certificate,
  type Slot,
} from "@/lib/report/certificate";
import {
  SERIES,
  SOLO_FILL_OPACITY,
  dailyPeaks,
  dayName,
  describeWindow,
  drawChart,
  legend,
  markDays,
  markPeak,
  round,
  scaleTop,
  when,
  type ChartBox,
  type DayPeak,
} from "@/lib/report/chart";
import {
  BRIEF_LABELS,
  isBrief,
  objective,
  type Brief,
} from "@/lib/power/brief";
import {
  describeFeed,
  describeLength,
  inWords,
  missingFrom,
  normaliseSupply,
  type Supply,
} from "@/lib/supply";
import {
  CHANNEL_LABELS,
  channelsIn,
  readRecording,
  summarise,
  weeks,
  type Channel,
  type Peak,
  type Recording,
  type Summary,
} from "@/lib/power/parse";

/**
 * The power analysis report.
 *
 * A logger sits on a board for a fortnight and writes the maximum current on
 * each phase and the neutral every few minutes. Put all of that on one chart
 * and it is a solid block; put a week on each landscape page and it is a
 * working document — the daily cycle is legible, the phases can be compared
 * against each other, and the week's highest reading is called out where it
 * happened.
 *
 * Landscape throughout, including the cover, because a week of readings is a
 * wide thing and squeezing it into portrait is what made the original
 * unreadable.
 */

const PAGE = { width: 841.89, height: 595.28 };
const MARGIN = 34;
const CONTENT = PAGE.width - MARGIN * 2;

/** The plot, inside the page. */
const PLOT: ChartBox = { x: MARGIN + 40, y: 104, width: CONTENT - 40 - 58, height: 340 };

/**
 * The page the charts start on.
 *
 * Cover, about the recording, the brief and the supply, the limitations. The
 * contents cites page numbers before any of them are drawn, so the four are
 * counted here rather than guessed in two places.
 */
const FIRST_CHART = 5;

export type PowerReport = PageMeta & {
  location: string | null;
  /** The board the logger was fitted to, named. */
  boardName: string;
  /** What feeds that board, where it has been recorded against it. */
  supply: Supply;
  /** What the feed comes from, already resolved to a name. */
  feed: string | null;
  brief: Brief;
  contactName: string | null;
  /** The instrument the readings were taken with, where one was named. */
  instrument: Instrument | null;
  reportDate: Date;
  recording: Recording;
  summary: Summary;
};

/* --- gathering ------------------------------------------------------------ */

/**
 * Either the report, or the reason there is not one yet.
 *
 * A power analysis is read against the board it was taken on, so a report is
 * only issued once that board is known and its details are complete. Saying
 * which pieces are short is the whole point: "that could not be built" sends
 * someone hunting, and a report that prints "not recorded" against the
 * protective device cannot answer the question it was commissioned for.
 */
export type PowerLoad =
  | { ok: true; report: PowerReport }
  | { ok: false; missing: true; reason: string }
  | { ok: false; missing: false; reason: string };

export async function loadPowerReport(id: string): Promise<PowerLoad> {
  const run = await prisma.powerAnalysis.findUnique({
    where: { id },
    include: {
      sourceFile: true,
      equipment: { select: { id: true, name: true, supply: true } },
      instrument: { include: { certFile: true, photoFile: true } },
      site: {
        include: {
          client: { select: { name: true } },
          equipment: {
            where: { kind: "SWITCHBOARD" },
            select: { id: true, name: true },
          },
        },
      },
    },
  });
  if (!run) return { ok: false, missing: false, reason: "That analysis could not be found." };
  if (!run.sourceFile) {
    return {
      ok: false,
      missing: true,
      reason: "No recording has been loaded for this analysis yet.",
    };
  }

  if (!run.equipment) {
    return {
      ok: false,
      missing: true,
      reason:
        "Say which switchboard the logger was fitted to. The current it recorded is read against that board's supply.",
    };
  }

  const supply = normaliseSupply(run.equipment.supply);
  const short = missingFrom(supply);
  if (short.length > 0) {
    return {
      ok: false,
      missing: true,
      reason: `${run.equipment.name} is missing ${inWords(short)}. Fill those in and the report will issue.`,
    };
  }

  if (!isBrief(run.brief)) {
    return {
      ok: false,
      missing: true,
      reason: "Choose what the recording was for: current headroom, or current draw.",
    };
  }

  let bytes: Buffer;
  try {
    bytes = await readUpload(run.sourceFile.storedName);
  } catch {
    return { ok: false, missing: false, reason: "That recording could not be read back." };
  }

  const recording = readRecording(bytes, run.sourceFile.originalName);
  const summary = summarise(recording);
  if (!summary) {
    return { ok: false, missing: false, reason: "No readings could be read out of that file." };
  }

  const feed = describeFeed(supply, run.site.equipment);

  return {
    ok: true,
    report: {
      clientName: safe(run.site.client.name),
      siteName: safe(run.site.name),
      siteLocation: run.site.location ? safe(run.site.location) : null,
      location: run.location ? safe(run.location) : null,
      boardName: safe(run.equipment.name),
      supply,
      feed: feed ? safe(feed) : null,
      brief: run.brief,
      contactName: run.contactName ? safe(run.contactName) : null,
      instrument: await readInstrument(run.instrument),
      reportDate: new Date(),
      recording,
      summary,
      logo: await brandBytes("logo.jpg"),
      signature: await reportSignature(),
    },
  };
}

/* --- the instrument the readings were taken with -------------------------- */

export type Instrument = {
  name: string;
  serialNo: string | null;
  modelNo: string | null;
  /** A photograph of it, already loaded. */
  photo: Buffer | null;
  /** Its calibration certificate, ready to be stamped into the report. */
  certificate: Certificate | null;
  /** True where a certificate was filed but could not be opened. */
  certificateUnreadable: boolean;
  /** What the certificate itself says, where it could be read. */
  calibration: Calibration;
};

type InstrumentRow = {
  name: string;
  serialNo: string | null;
  modelNo: string | null;
  certFile: { storedName: string } | null;
  photoFile: { storedName: string } | null;
} | null;

/**
 * The instrument, with its certificate and photograph read off disk.
 *
 * Neither file is allowed to take the report down with it. A missing photo
 * leaves the block without one; a certificate that will not open is reported
 * on the page rather than swallowed, because a report that silently drops the
 * evidence for its own numbers is worse than one that says the evidence is
 * missing.
 */
async function readInstrument(row: InstrumentRow): Promise<Instrument | null> {
  if (!row) return null;

  let photo: Buffer | null = null;
  if (row.photoFile) {
    photo = await readUpload(row.photoFile.storedName).catch(() => null);
  }

  let certificate: Certificate | null = null;
  let certificateUnreadable = false;
  let calibration: Calibration = {
    serialNo: null,
    modelNo: null,
    calibratedOn: null,
    expiresOn: null,
  };
  if (row.certFile) {
    const bytes = await readUpload(row.certFile.storedName).catch(() => null);
    certificate = bytes ? await readCertificate(bytes) : null;
    certificateUnreadable = certificate === null;
    if (bytes) calibration = await readCalibration(bytes);
  }

  // The name is whatever the instrument is called under Equipment, full stop.
  // That is the name the person picked it by, and a certificate's own wording
  // for the same meter is somebody else's cataloguing. The serial and model
  // numbers do fall back to the certificate, but only where they were left
  // blank: there they are facts about one object rather than a choice of name.
  return {
    name: safe(row.name),
    serialNo: pick(row.serialNo, calibration.serialNo),
    modelNo: pick(row.modelNo, calibration.modelNo),
    photo,
    certificate,
    certificateUnreadable,
    calibration,
  };
}

/** The typed answer where there is one, else the certificate's. */
function pick(typed: string | null, read: string | null): string | null {
  const value = typed?.trim() || read?.trim();
  return value ? safe(value) : null;
}

/* --- the fixed wording ---------------------------------------------------- */

/**
 * What the instrument is called throughout the report.
 *
 * One name in one place: it appears in five paragraphs and on the equipment
 * page, and five copies of a name is five things to miss when it changes.
 */
const ANALYSER = "MultiFunction Electrical Analyzer";

/**
 * What the report says about itself.
 *
 * Kept here rather than inline so the wording can be read as a whole, which is
 * the only way to keep four distinct things distinct: what the logger recorded,
 * the arithmetic difference between that and the protective device, the
 * maximum demand of the installation, and how much load may actually be added.
 * Those are four different quantities and the report never treats them as one.
 */

/** A heading, a paragraph and its bullets. A block with no bullets is prose. */
type Block = { text: string; bullets?: string[] };

/**
 * `WHAT_IT_IS`, with the logger's own sampling interval written into it.
 *
 * The interval is read out of the recording rather than described in the
 * abstract: a reader who wants to know how closely the installation was
 * watched should not have to work it out from the readings count and the
 * dates. A file whose interval could not be established falls back to saying
 * so in general terms rather than inventing a number.
 */
function whatItIs(intervalMinutes: number): Block[] {
  const every =
    intervalMinutes > 0
      ? `at ${intervalMinutes} minute intervals`
      : "at regular intervals";

  return [
  {
    text: `A ${ANALYSER} was installed to record the current drawn by each phase and the neutral while the installation operated under normal conditions during the monitoring period.`,
  },
  {
    text: `Current transformers were fitted to each monitored conductor and readings were recorded ${every}. This provides a record of the electrical loading that occurred while the ${ANALYSER} was installed.`,
  },
  {
    text: "The recorded data shows the actual current measured during the monitoring period, including:",
    bullets: [
      "the highest current recorded on each phase;",
      "the loading relationship between phases;",
      "the current recorded on the neutral; and",
      "the difference between the highest recorded phase current and the rating of the upstream protective device.",
    ],
  },
  {
    text: "These results provide an indication of the electrical loading present during the monitoring period. They do not, by themselves, confirm the maximum demand of the installation or the amount of additional load that may be connected.",
  },
  {
    text: `All current values shown in this report are derived from the recorded ${ANALYSER} data. Where chart data is grouped into display intervals, the highest recorded value within each interval is shown rather than an average value. This allows short-duration peaks recorded within the interval to remain visible in the report.`,
  },
  ];
}

/** What the headroom figure is, and what it is not. */
const HEADROOM_MEANS: Block[] = [
  {
    text: "The recorded current headroom is the arithmetic difference between the rating of the protective device and the highest phase current measured during the monitoring period.",
  },
  {
    text: "This figure represents observed headroom under the conditions present while the recording was undertaken. It must not be interpreted as confirmation that an equivalent amount of additional continuous or connected load can be installed.",
  },
  {
    text: "Determining the suitability of the installation for additional load requires consideration of maximum demand, the characteristics of the proposed load, diversity, duty cycle, supply capacity, conductor capacity, protective-device requirements and other relevant installation conditions.",
  },
];

const LIMITATIONS: Block[] = [
  {
    text: "The results in this report represent the electrical loading measured during the stated monitoring period and under the operating conditions present at that time.",
  },
  {
    text: "The recording does not necessarily represent the highest demand that may occur under all operating conditions. Factors that may affect electrical demand include:",
    bullets: [
      "changes in equipment use or operating hours;",
      "equipment that did not operate during the monitoring period;",
      "intermittent or cyclic loads;",
      "changes in occupancy or operational activity;",
      "future equipment or alterations;",
      "ambient and environmental conditions; and",
      "seasonal variations throughout the year.",
    ],
  },
  {
    text: "The time and season of the year have not been normalised or adjusted for in this report. Accordingly, electrical demand at other times of the year may be higher or lower than the demand recorded during this monitoring period.",
  },
  {
    text: `The recorded results should therefore be considered a snapshot of the installation's electrical demand under the conditions that existed while the ${ANALYSER} was installed.`,
  },
];

const MAXIMUM_DEMAND: Block[] = [
  {
    text: "AS/NZS 3000 provides recognised methods for determining maximum demand. Depending on the installation and circumstances, maximum demand may be determined by:",
    bullets: [
      "Calculation \u2014 determination using the applicable load information, demand factors and calculation methods.",
      "Assessment \u2014 determination based on the nature of the installation, operating characteristics, duty cycles and other relevant information.",
      "Measurement \u2014 determination from measured electrical demand where the measurement method and operating conditions are appropriate.",
      "Limitation \u2014 determination by an applicable current-limiting means, such as the rating or setting of a protective device, where permitted.",
    ],
  },
  {
    text: "This report provides measured electrical current data for the stated monitoring period. The recorded data may be used as part of an assessment of the installation; however, this report should not be interpreted as a complete maximum-demand calculation or as automatic approval for the connection of additional load.",
  },
];

const HOW_TO_READ: [string, string][] = [
  [
    "Consistent current scale",
    "A consistent current scale is used throughout the applicable charts to allow the relative loading of each monitored conductor and recording period to be compared easily.",
  ],
  [
    "Peak values",
    "Where readings are grouped for chart presentation, the highest recorded current within each display interval is shown rather than the average current. This retains recorded short-duration peaks when presenting a longer monitoring period.",
  ],
  [
    "Highlighted readings",
    `Highlighted or ringed points identify recorded ${ANALYSER} values and show the current and time associated with the selected peak.`,
  ],
  [
    "Monitoring period",
    "The charts represent the electrical demand measured during the stated monitoring period only. Operating conditions, electrical demand and seasonal loading outside this period may differ. The recorded results are not, by themselves, a complete design calculation of maximum demand.",
  ],
];

/* --- laying out a run of those blocks ------------------------------------- */

/**
 * A stack of paragraphs and bullet lists, measured as it goes.
 *
 * Returns where it finished, so whatever follows can start below it rather
 * than at a guessed offset. The bullets are drawn as a hanging indent so a
 * wrapped line lines up under the text rather than under the mark.
 */
function blocks(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  items: Block[],
  size = 9,
): number {
  for (const item of items) {
    const text = safe(item.text);
    doc.font("Helvetica").fontSize(size).fillColor(COLOURS.ink);
    doc.text(text, x, y, { width, lineGap: 2.2, align: "justify" });
    y += doc.heightOfString(text, { width, lineGap: 2.2 }) + (item.bullets ? 7 : 10);

    for (const bullet of item.bullets ?? []) {
      const body = safe(bullet);
      doc.font("Helvetica").fontSize(size).fillColor(COLOURS.inkSoft);
      doc.text("\u2022", x + 4, y, { lineBreak: false });
      doc.fillColor(COLOURS.ink);
      doc.text(body, x + 16, y, { width: width - 16, lineGap: 2.2 });
      y += doc.heightOfString(body, { width: width - 16, lineGap: 2.2 }) + 4;
    }
    if (item.bullets) y += 8;
  }
  return y;
}

/* --- the document --------------------------------------------------------- */

/* --- the document --------------------------------------------------------- */

export async function buildPowerReport(data: PowerReport): Promise<Buffer> {
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

  const channels = channelsIn(data.recording);
  const pages = weeks(data.recording.samples);
  // One scale across every page, so the second week is read against the first
  // rather than against itself — and so the four single-conductor pages are
  // read against each other and against the combined one.
  const top = scaleTop(
    Math.max(...Object.values(data.summary.peaks).map((peak) => peak.amps), 1),
  );

  cover(doc, data);
  explain(doc, data, channels, pages.length);
  briefPage(doc, data, channels);
  limitsPage(doc, data);

  pages.forEach((week, index) => {
    doc.addPage();
    weekPage(doc, data, week, index + 1, pages.length, channels, top);
  });

  // Then each conductor on its own, a week to a page, with the highest
  // reading of every day marked. Grouped by conductor rather than by week, so
  // one phase can be followed from the first day to the last without a page of
  // some other phase in between.
  for (const channel of channels) {
    pages.forEach((week, index) => {
      doc.addPage();
      channelPage(doc, data, week, index + 1, pages.length, channel, top);
    });
  }

  const slots = equipmentPages(doc, data);

  stampPages(doc, data);
  doc.end();

  const pdf = await done;
  // The certificate's own pages go in last, into the gaps that were left and
  // bordered for them.
  const certificate = data.instrument?.certificate;
  return certificate ? stampCertificate(pdf, certificate, slots, PAGE.height) : pdf;
}

/* --- the equipment the readings were taken with --------------------------- */

/** The body of a page, between the heading rule and the page foot. */
const BODY = { top: 104, height: 436 };

/**
 * The instrument block on the first equipment page.
 *
 * Kept narrow on purpose. A portrait certificate on a landscape page is
 * limited by the height of the page, not its width, so every point this block
 * does not take is a point of width the certificate can have — and at two
 * pages across, each one of those points is worth about one and a half points
 * of certificate height.
 */
const BLOCK = { photo: 96, gap: 14, details: 140, alone: 200, gutter: 22 };

/**
 * How wide the instrument block is, which is what the certificate gets the
 * rest of. Without a photograph the details take the column on their own and
 * are given a little more of it, rather than sitting in a narrow strip beside
 * the space where a photograph would have been.
 */
function blockWidth(instrument: Instrument): number {
  return instrument.photo ? BLOCK.photo + BLOCK.gap + BLOCK.details : BLOCK.alone;
}

/** How many certificate pages go on a page, with and without the block. */
const FIRST_PAGE = 2;
const LATER_PAGE = 3;

/** A certificate page is set in from its border, and the border from its gap. */
const BORDER_GAP = 5;
const BORDER_WIDTH = 1.4;

/**
 * The equipment page, and however many more the certificate needs.
 *
 * Returns the gaps the certificate's own pages are stamped into afterwards.
 * They are drawn here, borders and all, because the border has to sit around
 * the page at whatever size that page ends up, and only this function knows
 * what size that is.
 */
function equipmentPages(doc: Doc, data: PowerReport): Slot[] {
  const instrument = data.instrument;
  if (!instrument) return [];

  const slots: Slot[] = [];
  const sizes = instrument.certificate?.sizes ?? [];

  doc.addPage();
  heading(doc, data, "Equipment Used");
  instrumentBlock(doc, instrument);

  const left = MARGIN + blockWidth(instrument) + BLOCK.gutter;
  layCertificates(doc, sizes.slice(0, FIRST_PAGE), 0, {
    x: left,
    y: BODY.top,
    width: MARGIN + CONTENT - left,
    height: BODY.height,
  }, doc.bufferedPageRange().count - 1, sizes.length, slots);

  // Anything the first page could not take, three across on a page of its own.
  for (let from = FIRST_PAGE; from < sizes.length; from += LATER_PAGE) {
    doc.addPage();
    heading(doc, data, "Equipment Used", "Calibration certificate, continued");
    layCertificates(doc, sizes.slice(from, from + LATER_PAGE), from, {
      x: MARGIN,
      y: BODY.top,
      width: CONTENT,
      height: BODY.height,
    }, doc.bufferedPageRange().count - 1, sizes.length, slots);
  }

  return slots;
}

/** How many pages the equipment section will run to. */
function equipmentPageCount(data: PowerReport): number {
  if (!data.instrument) return 0;
  const sizes = data.instrument.certificate?.sizes.length ?? 0;
  return 1 + Math.ceil(Math.max(0, sizes - FIRST_PAGE) / LATER_PAGE);
}

/**
 * The instrument itself: its photograph, and what it is, beside it.
 *
 * The photograph is small on purpose. It is there so a reader can see the box
 * the readings came out of, not to be looked at, and the space it does not
 * take is space the certificate does.
 */
function instrumentBlock(doc: Doc, instrument: Instrument) {
  const column = blockWidth(instrument);
  let x = MARGIN;
  let width = column;

  if (instrument.photo) {
    try {
      doc.image(instrument.photo, MARGIN, BODY.top, { fit: [BLOCK.photo, 88] });
      x = MARGIN + BLOCK.photo + BLOCK.gap;
      width = BLOCK.details;
    } catch {
      // An image the renderer will not take is not worth a failed report.
    }
  }

  let y = BODY.top;
  const rows: [string, string | null][] = [
    ["Equipment name", instrument.name],
    ["Serial no", instrument.serialNo],
    ["Model no", instrument.modelNo],
  ];

  for (const [name, value] of rows) {
    label(doc, name, x, y);
    y += 13;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOURS.ink);
    doc.text(safe(value ?? "\u2014"), x, y, { width });
    y += doc.heightOfString(safe(value ?? "\u2014"), { width }) + 12;
  }

  const note = instrument.certificateUnreadable
    ? "A calibration certificate is on file for this instrument but could not be read, so it has not been reproduced here."
    : instrument.certificate
      ? "The calibration certificate is reproduced on this page exactly as it was issued. Nothing has been retyped or redrawn."
      : "No calibration certificate has been filed against this instrument.";

  const below = Math.max(y, BODY.top + 100) + 8;
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(note), MARGIN, below, { width: column, lineGap: 1.8 });
  doc.fillColor(COLOURS.ink);
}

/**
 * Certificate pages across a region, each as large as it will go.
 *
 * Every page gets the same share of the width whatever shape it is, so a
 * certificate whose second page is landscape does not shove the first one over
 * — and each is fitted inside its share rather than stretched to fill it.
 *
 * The blue rule is set out from the page edge rather than drawn on it, so the
 * certificate's own border, where it has one, stays its own.
 */
function layCertificates(
  doc: Doc,
  sizes: { width: number; height: number }[],
  offset: number,
  region: Box,
  page: number,
  total: number,
  slots: Slot[],
) {
  if (sizes.length === 0) return;

  const gap = 18;
  const inset = BORDER_GAP + BORDER_WIDTH + 2;
  const share = (region.width - gap * (sizes.length - 1)) / sizes.length;

  sizes.forEach((size, index) => {
    const space: Box = {
      x: region.x + index * (share + gap) + inset,
      y: region.y + inset,
      width: share - inset * 2,
      height: region.height - inset * 2,
    };
    const box = fitted(space, size);

    // A hairline on the page edge gives a white certificate a definite edge;
    // the blue rule sits outside it.
    doc.lineWidth(0.5).strokeColor(COLOURS.hair);
    doc.rect(box.x, box.y, box.width, box.height).stroke();
    doc.lineWidth(BORDER_WIDTH).strokeColor(COLOURS.accent);
    doc.rect(
      box.x - BORDER_GAP,
      box.y - BORDER_GAP,
      box.width + BORDER_GAP * 2,
      box.height + BORDER_GAP * 2,
    ).stroke();
    doc.lineWidth(1).strokeColor("#000000");

    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
    doc.text(
      `PAGE ${offset + index + 1} OF ${total}`,
      box.x - BORDER_GAP,
      box.y + box.height + BORDER_GAP + 5,
      { width: box.width + BORDER_GAP * 2, align: "center", characterSpacing: 1.1 },
    );
    doc.fillColor(COLOURS.ink);

    slots.push({ ...box, page, source: offset + index });
  });
}


/**
 * The cover.
 *
 * Same design language as the other three reports — masthead, the kind of
 * report, its title, who it is for, what it covered, the facts, a foot bar
 * carrying the licences — but arranged in two columns, because that stack is
 * taller than a landscape page and the width is there to be used.
 */
function cover(doc: Doc, data: PowerReport) {
  const { summary } = data;
  const days = Math.max(1, Math.round((summary.to - summary.from) / 86_400_000));
  const highest = summary.highest;

  /* --- masthead ---------------------------------------------------------- */
  if (data.logo) doc.image(data.logo, MARGIN, 34, { fit: [158, 50] });
  const trading = [
    COMPANY.addressLine1,
    COMPANY.addressLine2,
    COMPANY.phone,
    COMPANY.email,
  ];
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  trading.forEach((line, index) => {
    doc.text(line, MARGIN + CONTENT - 220, 36 + index * 11.5, { width: 220, align: "right" });
  });

  doc.rect(MARGIN, 100, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, 99, 64, 2.6).fill(COLOURS.accent);

  /* --- left: what it is, and who for ------------------------------------- */
  const left = 430;
  let y = 132;

  doc.fillColor(COLOURS.accent).font("Helvetica-Bold").fontSize(8.5);
  doc.text("CURRENT RECORDING", MARGIN, y, { width: left, characterSpacing: 2.2 });

  y += 18;
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(26);
  doc.text("Power Analysis Report", MARGIN, y, { width: left, lineGap: 2 });
  y += doc.heightOfString("Power Analysis Report", { width: left }) + 30;

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

  const scope = safe(
    `${data.boardName}${data.supply.area ? `, ${data.supply.area}` : ""}${data.feed ? `, fed from ${midSentence(data.feed)}` : ""} — three phases and neutral, logged every ${
      summary.intervalMinutes || 5
    } minutes over ${days} ${days === 1 ? "day" : "days"}`,
  );
  doc.font("Helvetica").fontSize(10.5);
  const scopeHeight = doc.heightOfString(scope, { width: width - 36, lineGap: 1.5 }) + 44;
  doc.rect(x, at, width, scopeHeight).fill(COLOURS.soft);
  doc.rect(x, at, 3, scopeHeight).fill(COLOURS.accent);
  label(doc, "What was recorded", x + 18, at + 13);
  doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(10.5);
  doc.text(scope, x + 18, at + 28, { width: width - 36, lineGap: 1.5 });
  at += scopeHeight + 22;

  const instrument = data.instrument;
  const facts: [string, string][] = [
    ["Brief", BRIEF_LABELS[data.brief]],
    ["Recording Started", shortDate(new Date(summary.from))],
    ["Recording Period", `${when(summary.from)} to ${when(summary.to)}`],
    ["Readings", `${summary.count.toLocaleString("en-AU")} per channel`],
    [
      "Highest Current",
      highest
        ? `${round(highest.amps)} A on ${CHANNEL_LABELS[highest.channel]}, ${when(highest.at)}`
        : "\u2014",
    ],
    ["Report Date", shortDate(data.reportDate)],
    // What took the readings, and whether its calibration still stands. The
    // dates are read off the certificate itself rather than typed anywhere,
    // so they cannot drift out of step with the document behind them.
    ...(instrument
      ? ([
          ["Equipment Name", instrument.name],
          ["Model No", instrument.modelNo ?? "\u2014"],
          ["Serial No", instrument.serialNo ?? "\u2014"],
          ["Calibration Date \u2013 Expiry Date", calibrationSpan(instrument)],
        ] as [string, string][])
      : []),
  ];

  // The label column is measured rather than assumed: "Calibration Date \u2013
  // Expiry Date" runs to two lines where the rest run to one, and a fixed row
  // height would clip it.
  const labelWidth = 124;
  for (const [name, value] of facts) {
    doc.font("Helvetica").fontSize(9);
    const rows = doc.heightOfString(name, { width: labelWidth });
    const height = Math.max(24, rows + 13);

    doc.rect(x, at, width, 0.6).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft);
    doc.text(name, x, at + 7, { width: labelWidth });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9.5);
    doc.text(value, x + labelWidth + 8, at + 6.5, {
      width: width - labelWidth - 8,
      height: 12,
      ellipsis: true,
    });
    at += height;
  }
  doc.rect(x, at, width, 0.6).fill(COLOURS.hair);

  /* --- the foot ---------------------------------------------------------- */
  const footY = PAGE.height - MARGIN - 32;

  doc.rect(MARGIN, footY, CONTENT, 32).fill(COLOURS.bar);
  doc.fillColor(COLOURS.onBar).font("Helvetica-Bold").fontSize(9);
  doc.text(COMPANY.name, MARGIN + 14, footY + 11.5, { width: 120 });
  doc.font("Helvetica").fontSize(8.5);
  doc.text(
    `ABN ${COMPANY.abn}   \u00b7   Contractor Licence ${COMPANY.licence}   \u00b7   Qualified Supervisor ${COMPANY.supervisor}`,
    MARGIN + 14,
    footY + 12,
    { width: CONTENT - 28, align: "right" },
  );
  doc.fillColor(COLOURS.ink).font("Helvetica");
}

/**
 * Who recorded it, signed.
 *
 * Sat low on the cover rather than in the facts table beside it: a signature
 * is not a fact about the recording, it is the person putting their name to
 * it, and on the other three reports it lives in the same place at the foot of
 * the left-hand column. The signature sits on the rule the way a pen lands on
 * a form, and the licence numbers go under the name.
 */
function recordedBy(doc: Doc, data: PowerReport) {
  const y = PAGE.height - MARGIN - 170;

  label(doc, "Recorded by", MARGIN, y);

  if (data.signature) {
    doc.image(data.signature, MARGIN + 6, y + 18, { fit: [170, 46] });
  }
  doc.rect(MARGIN, y + 66, 220, 0.8).fill(COLOURS.inkSoft);

  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(THERMOGRAPHER.name, MARGIN, y + 74, { lineBreak: false });
  doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.inkSoft);
  doc.text(COMPANY.name, MARGIN, y + 91, { lineBreak: false });
  doc.text(
    `Contractor Licence ${COMPANY.licence}  \u00b7  Qualified Supervisor ${COMPANY.supervisor}`,
    MARGIN,
    y + 105,
    { lineBreak: false },
  );
  doc.fillColor(COLOURS.ink);
}

/**
 * A phrase written for the head of a line, used in the middle of one.
 *
 * The feed reads "The street supply" in its own row of the supply table and
 * "fed from The street supply" in a sentence, which is a capital in the wrong
 * place. A board's own name keeps its capitals, because "DB1" and "Main
 * Switchboard" are names rather than sentence openings.
 */
function midSentence(text: string): string {
  return /^The\s/.test(text) ? `the${text.slice(3)}` : text;
}

/**
 * "12/03/2026 \u2013 12/03/2027", from whatever the certificate said.
 *
 * Either date alone still goes on: a certificate that gives only the day it
 * was issued is worth saying so, and one that gives only the day it lapses is
 * worth saying loudly. Neither, and the row says the certificate did not give
 * them rather than leaving a reader to assume it was never calibrated.
 */
function calibrationSpan(instrument: Instrument): string {
  const { calibratedOn, expiresOn } = instrument.calibration;
  if (calibratedOn && expiresOn) {
    return `${shortDate(calibratedOn)} \u2013 ${shortDate(expiresOn)}`;
  }
  if (calibratedOn) return `Calibrated ${shortDate(calibratedOn)}`;
  if (expiresOn) return `Expires ${shortDate(expiresOn)}`;
  return instrument.certificate ? "Not stated on the certificate" : "\u2014";
}

/** A small letterspaced heading, the one marker of hierarchy on the cover. */
function label(doc: Doc, text: string, x: number, y: number) {
  doc.fillColor(COLOURS.inkSoft).font("Helvetica-Bold").fontSize(8);
  doc.text(text.toUpperCase(), x, y, { characterSpacing: 1.8, lineBreak: false });
  doc.fillColor(COLOURS.ink);
}

/** What a power analysis is, and what this one found. */
function explain(doc: Doc, data: PowerReport, channels: Channel[], weekCount: number) {
  doc.addPage();
  heading(doc, data, "About This Recording");

  /* --- left: what was recorded, and what it does and does not show ------- */
  const column = 380;
  const y = blocks(doc, MARGIN, 104, column, whatItIs(data.summary.intervalMinutes), 9);

  /* --- right: what this one found ---------------------------------------- */
  const x = MARGIN + column + 44;
  const width = CONTENT - column - 44;
  let at = 104;

  label(doc, "Highest current recorded", x, at);
  at += 18;

  const widths = [96, 74, width - 170];
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
  ["Conductor", "Highest", "When"].forEach((title, index) => {
    doc.text(title.toUpperCase(), x + offset(widths, index), at, {
      width: widths[index] - 10,
      characterSpacing: 1,
    });
  });
  at += 13;

  for (const channel of channels) {
    const peak = data.summary.peaks[channel];
    doc.rect(x, at, width, 0.6).fill(COLOURS.hair);
    doc.rect(x, at + 12, 14, 2.6).fill(SERIES[channel]);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.ink);
    doc.text(CHANNEL_LABELS[channel], x + 20, at + 8, { lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(conductor(channel), x + 20 + doc.widthOfString(CHANNEL_LABELS[channel]) + 6, at + 9, {
      lineBreak: false,
    });

    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOURS.ink);
    doc.text(peak ? `${round(peak.amps)} A` : "\u2014", x + offset(widths, 1), at + 6.5, {
      width: widths[1] - 10,
    });
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text(peak ? when(peak.at) : "\u2014", x + offset(widths, 2), at + 8, {
      width: widths[2],
    });
    doc.fillColor(COLOURS.ink);
    at += 30;
  }
  doc.rect(x, at, width, 0.6).fill(COLOURS.hair);

  at += 12;
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  const how = safe(
    `${data.summary.count.toLocaleString("en-AU")} readings on each conductor, every ${
      data.summary.intervalMinutes || 5
    } minutes, from ${when(data.summary.from)} to ${when(data.summary.to)}.${
      data.summary.skipped > 0
        ? ` ${data.summary.skipped} rows carried no readable timestamp and were left out.`
        : ""
    }`,
  );
  doc.text(how, x, at, { width, lineGap: 1.6 });

  contents(
    doc,
    Math.max(y, at + doc.heightOfString(how, { width, lineGap: 1.6 })) + 26,
    channels,
    weekCount,
    equipmentPageCount(data),
  );
  doc.fillColor(COLOURS.ink);
}

function offset(widths: number[], index: number): number {
  return widths.slice(0, index).reduce((total, width) => total + width, 0);
}

/* --- why it was recorded, and what feeds the board ------------------------ */

function briefPage(doc: Doc, data: PowerReport, channels: Channel[]) {
  doc.addPage();
  heading(doc, data, "The Brief and the Supply");

  const column = 430;
  let y = 104;

  /* --- left: what was asked for ------------------------------------------ */
  label(doc, "Objective", MARGIN, y);
  y += 16;

  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOURS.bar);
  doc.text(BRIEF_LABELS[data.brief], MARGIN, y, { width: column });
  y += 20;

  y = blocks(
    doc,
    MARGIN,
    y,
    column,
    objective({
      brief: data.brief,
      board: data.boardName,
      area: data.supply.area,
      client: data.clientName,
      site: data.siteName,
      contact: data.contactName,
    }).map((text) => ({ text })),
    9.5,
  );

  const spare = headroom(data, channels);
  if (spare) {
    y = headroomPanel(doc, MARGIN, y + 6, column, spare);
    // What the figure above is not, directly under the figure, because a
    // reader who stops at the number is the reader this wording is for.
    y = blocks(doc, MARGIN, y + 16, column, HEADROOM_MEANS, 8.5);
  }

  /* --- right: what feeds it ---------------------------------------------- */
  const x = MARGIN + column + 40;
  const width = CONTENT - column - 40;
  let at = 104;

  label(doc, "Supply to the board", x, at);
  at += 18;

  const rows: [string, string | null][] = [
    ["Board recorded", data.boardName],
    ["Area", data.supply.area],
    ["Fed from", data.feed],
    ["Length of run", describeLength(data.supply)],
    ["Protective device", data.supply.protectiveDevice],
    ["Mains, active", data.supply.activeCable],
    ["Mains, neutral", data.supply.neutralCable],
    ["Requested by", data.contactName],
  ];

  for (const [name, value] of rows) {
    doc.rect(x, at, width, 0.6).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9);
    doc.text(name, x, at + 8, { width: 112, height: 11, lineBreak: false });
    doc.fillColor(value ? COLOURS.ink : COLOURS.inkSoft);
    doc.font(value ? "Helvetica-Bold" : "Helvetica-Oblique").fontSize(9.5);
    doc.text(safe(value ?? "not recorded"), x + 118, at + 7.5, {
      width: width - 118,
      height: 24,
      ellipsis: true,
    });
    at += 26;
  }
  doc.rect(x, at, width, 0.6).fill(COLOURS.hair);

  doc.fillColor(COLOURS.ink);
}

/**
 * The headroom figure, and what it does not mean.
 *
 * Four labelled lines rather than a sentence. "88 A of the 160 A, 45% used"
 * reads as though the other 55% is there for the taking, which is the one
 * thing this figure does not say: it is the difference between one measured
 * current and one device rating, under the conditions that happened to be
 * present. The wording below it says so at length, because a client reading
 * only the number is exactly the reader this panel has to protect.
 */
function headroomPanel(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  spare: { rating: number; peak: number; spare: number; used: number },
): number {
  const lines: [string, string][] = [
    ["Highest recorded phase current", `${round(spare.peak)} A`],
    ["Protective-device rating", `${round(spare.rating)} A`],
    ["Recorded current headroom", `${round(spare.spare)} A`],
    ["Highest recorded current as a proportion of protective-device rating", `${spare.used}%`],
  ];

  doc.font("Helvetica").fontSize(8.5);
  const inner = width - 36;
  const rows = lines.reduce(
    (total, [name]) =>
      total + Math.max(15, doc.heightOfString(name, { width: inner - 70 }) + 5),
    0,
  );
  const height = 30 + rows + 12;

  doc.rect(x, y, width, height).fill(COLOURS.soft);
  doc.rect(x, y, 3, height).fill(COLOURS.accent);
  label(doc, "Recorded current headroom", x + 18, y + 13);

  let at = y + 30;
  lines.forEach(([name, value], index) => {
    const rowHeight = Math.max(15, doc.heightOfString(name, { width: inner - 70 }) + 5);
    // The headroom itself is the line people quote, so it is the one that
    // carries weight; the other three are the working behind it.
    const strong = index === 2;
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    doc.fillColor(strong ? COLOURS.ink : COLOURS.inkSoft);
    doc.text(safe(name), x + 18, at, { width: inner - 70 });
    doc.font("Helvetica-Bold").fontSize(strong ? 12 : 10).fillColor(COLOURS.ink);
    doc.text(value, x + 18 + inner - 66, at - (strong ? 2.5 : 1), {
      width: 66,
      align: "right",
      lineBreak: false,
    });
    at += rowHeight;
  });

  doc.fillColor(COLOURS.ink);
  return y + height;
}

/**
 * The page that keeps the numbers honest.
 *
 * What the recording cannot say, and how maximum demand is actually
 * determined. It is a page of its own because it is a page of reading, and
 * squeezing it under the supply table would either shrink it below a size a
 * client would read or push the charts off their own scale.
 */
function limitsPage(doc: Doc, data: PowerReport) {
  doc.addPage();
  heading(doc, data, "Limitations and Maximum Demand");

  const gap = 44;
  const column = (CONTENT - gap) / 2;

  label(doc, "Recording conditions and limitations", MARGIN, 104);
  const left = blocks(doc, MARGIN, 124, column, LIMITATIONS, 9);

  const x = MARGIN + column + gap;
  label(doc, "Determination of maximum demand", x, 104);
  const right = blocks(doc, x, 124, column, MAXIMUM_DEMAND, 9);

  howToRead(doc, Math.max(left, right) + 18);
  doc.fillColor(COLOURS.ink);
}

/**
 * What a reader needs to know before the first chart.
 *
 * Four short notes rather than a paragraph, because they are four separate
 * facts and a reader looking for one of them should not have to read the
 * other three.
 */
function howToRead(doc: Doc, y: number) {
  label(doc, "How to read the charts", MARGIN, y);
  y += 19;

  const gap = 22;
  const width = (CONTENT - gap * (HOW_TO_READ.length - 1)) / HOW_TO_READ.length;

  HOW_TO_READ.forEach(([title, body], index) => {
    const x = MARGIN + index * (width + gap);
    doc.rect(x, y, width, 2.4).fill(COLOURS.accent);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
    doc.text(title, x, y + 11, { width, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(body), x, y + 26, { width, lineGap: 1.8 });
  });

  doc.fillColor(COLOURS.ink);
}

/**
 * What is in the rest of the report, and on which page.
 *
 * The numbers are worked out rather than measured, because the order of the
 * pages is fixed: the covers, the notes, a chart per week with everything on
 * it, then each conductor on its own a week at a time.
 */
function contents(
  doc: Doc,
  y: number,
  channels: Channel[],
  weekCount: number,
  equipmentPages: number,
) {
  const week = (number: number) =>
    weekCount > 1 ? `Week ${number} of ${weekCount}` : "The recording";

  const entries: [string, number][] = [
    ["About This Recording", 2],
    ["The Brief and the Supply", 3],
    ["Limitations and Maximum Demand", 4],
    ...Array.from({ length: weekCount }, (_, index): [string, number] => [
      `All conductors \u2014 ${week(index + 1)}`,
      FIRST_CHART + index,
    ]),
    ...channels.flatMap((channel, place) =>
      Array.from({ length: weekCount }, (_, index): [string, number] => [
        `${CHANNEL_LABELS[channel]}, ${conductor(channel)} \u2014 ${week(index + 1)}`,
        FIRST_CHART + weekCount + place * weekCount + index,
      ]),
    ),
    ...(equipmentPages > 0
      ? ([["Equipment Used", FIRST_CHART + weekCount * (channels.length + 1)]] as [
          string,
          number,
        ][])
      : []),
  ];

  label(doc, "What is in this report", MARGIN, y);
  y += 17;

  const columns = 3;
  const width = (CONTENT - 40 * (columns - 1)) / columns;
  const rows = Math.ceil(entries.length / columns);

  entries.forEach(([title, page], index) => {
    const x = MARGIN + Math.floor(index / rows) * (width + 40);
    const at = y + (index % rows) * 15;

    doc.rect(x, at + 12.5, width, 0.5).fill(COLOURS.hair);
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.ink);
    doc.text(safe(title), x, at + 2, { width: width - 26, height: 11, ellipsis: true });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(String(page), x + width - 24, at + 2, { width: 24, align: "right" });
  });
}

/**
 * What is left, where the board's protection has been recorded.
 *
 * The rating is read out of whatever was written against the board — "100 A
 * HRC fuse", "63A MCB" — because that is how it is written down on site. No
 * figure, no panel: an invented rating is worse than a blank one.
 */
function headroom(
  data: PowerReport,
  channels: Channel[],
): { rating: number; peak: number; spare: number; used: number } | null {
  if (data.brief !== "HEADROOM") return null;

  const match = /(\d+(?:\.\d+)?)\s*a\b/i.exec(data.supply.protectiveDevice ?? "");
  if (!match) return null;
  const rating = Number(match[1]);
  if (!Number.isFinite(rating) || rating <= 0) return null;

  const phases = channels.filter((channel) => channel !== "n");
  const peak = Math.max(
    ...phases.map((channel) => data.summary.peaks[channel]?.amps ?? 0),
    0,
  );
  if (peak <= 0) return null;

  return {
    rating,
    peak,
    spare: Math.round((rating - peak) * 10) / 10,
    used: Math.round((peak / rating) * 100),
  };
}

/* --- a week to a page ----------------------------------------------------- */

function weekPage(
  doc: Doc,
  data: PowerReport,
  week: { from: number; to: number; samples: typeof data.recording.samples; partial: boolean },
  number: number,
  total: number,
  channels: Channel[],
  top: number,
) {
  const days = Math.max(1, Math.round((week.to - week.from) / 86_400_000));
  heading(
    doc,
    data,
    total > 1 ? `Week ${number} of ${total}` : "The recording",
    `${when(week.from).slice(0, 5)} to ${when(week.to - 1).slice(0, 5)}${
      week.partial ? `  (${days} ${days === 1 ? "day" : "days"})` : ""
    }`,
  );

  const spec = {
    from: week.from,
    to: week.to,
    maxAmps: top,
    samples: week.samples,
    channels,
    // Every third day across a full week, as asked; closer together on a
    // page that holds fewer days, where every third would be one label.
    labelEveryDays: days >= 6 ? 3 : days >= 3 ? 2 : 1,
  };

  drawChart(doc, PLOT, spec);

  // The week's own highest reading, marked where it happened — off the raw
  // readings, so the figure and the moment are the logger's own.
  const peak = highestIn(week.samples, channels);
  if (peak) markPeak(doc, PLOT, spec, peak);

  let y = PLOT.y + PLOT.height + 26;
  doc.font("Helvetica").fontSize(7).fillColor(COLOURS.inkSoft);
  doc.text(
    `Each line is the highest reading in every ${describeWindow(spec)} window. Peaks are the instrument's own, untouched.`,
    PLOT.x + PLOT.width - 300,
    y - 1,
    { width: 300, align: "right", lineBreak: false },
  );
  doc.fillColor(COLOURS.ink);
  legend(
    doc,
    PLOT.x,
    y,
    channels,
    channels.map((channel) => (channel === "n" ? "neutral" : `phase ${channel.slice(1)}`)),
  );

  /* --- the week's peaks, written out ------------------------------------ */
  y += 22;
  doc.rect(MARGIN, y, CONTENT, 18).fill(COLOURS.soft);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.inkSoft);
  doc.text("HIGHEST THIS WEEK", MARGIN + 10, y + 5.5, { characterSpacing: 1.1, lineBreak: false });

  let x = MARGIN + 150;
  for (const channel of channels) {
    const best = highestIn(week.samples, [channel]);
    doc.rect(x, y + 7.5, 12, 2.4).fill(SERIES[channel]);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.ink);
    doc.text(CHANNEL_LABELS[channel], x + 17, y + 5, { lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    const text = best ? `${round(best.amps)} A  ·  ${when(best.at)}` : "no readings";
    doc.text(text, x + 17 + doc.widthOfString(CHANNEL_LABELS[channel]) + 7, y + 5, {
      lineBreak: false,
    });
    x += 17 + doc.widthOfString(CHANNEL_LABELS[channel]) + 7 + doc.widthOfString(text) + 26;
  }
  doc.fillColor(COLOURS.ink);
}

/* --- one conductor, a week to a page -------------------------------------- */

/**
 * A single phase or the neutral, on its own.
 *
 * The overlapping chart answers how the conductors compare; this one answers
 * what one of them did, which is a different question and needs the page to
 * itself. Every day's highest reading is marked where it happened, so the
 * shape of a working week is readable at a glance — the days the site ran
 * hard, the days it did not, and the one day that carried the most.
 *
 * The scale is the same as every other page in the report, so a light phase
 * looks light rather than being stretched to fill the plot.
 */
function channelPage(
  doc: Doc,
  data: PowerReport,
  week: { from: number; to: number; samples: typeof data.recording.samples; partial: boolean },
  number: number,
  total: number,
  channel: Channel,
  top: number,
) {
  const days = Math.max(1, Math.round((week.to - week.from) / 86_400_000));
  const span = `${when(week.from).slice(0, 5)} to ${when(week.to - 1).slice(0, 5)}`;
  heading(
    doc,
    data,
    `${CHANNEL_LABELS[channel]} — ${conductor(channel)}`,
    total > 1 ? `Week ${number} of ${total}  ·  ${span}` : span,
  );

  // A rule in the conductor's own colour under the title, so a reader flicking
  // through knows which one they are on before reading the heading.
  doc.rect(MARGIN, 71, 54, 2.4).fill(SERIES[channel]);

  const spec = {
    from: week.from,
    to: week.to,
    maxAmps: top,
    samples: week.samples,
    channels: [channel],
    labelEveryDays: days >= 6 ? 3 : days >= 3 ? 2 : 1,
    fillOpacity: SOLO_FILL_OPACITY,
  };

  drawChart(doc, PLOT, spec);

  const peaks = dailyPeaks(week.samples, channel, week.from, week.to);
  markDays(doc, PLOT, spec, channel, peaks);

  let y = PLOT.y + PLOT.height + 26;
  doc.font("Helvetica").fontSize(7).fillColor(COLOURS.inkSoft);
  doc.text(
    `The line is the highest reading in every ${describeWindow(spec)} window. Each day's own highest reading is ringed at the moment it was taken.`,
    PLOT.x + PLOT.width - 360,
    y - 1,
    { width: 360, align: "right", lineBreak: false },
  );

  doc.rect(PLOT.x, y - 2, 16, 8).fill(SERIES[channel]);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.ink);
  doc.text(CHANNEL_LABELS[channel], PLOT.x + 21, y - 1.5, { lineBreak: false });
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(data.recording.headings[channel] ?? conductor(channel)),
    PLOT.x + 21 + doc.widthOfString(CHANNEL_LABELS[channel]) + 7,
    y - 1,
    { lineBreak: false },
  );

  /* --- the days, written out --------------------------------------------- */
  y += 20;
  dayStrip(doc, y, peaks, channel);
}

/**
 * Each day's peak as a row of tiles across the foot of the page.
 *
 * The chart carries the shape; this carries the figures, so the numbers can be
 * read off without measuring anything against a gridline. The day that
 * carried the week's highest is filled, and a day the logger missed keeps its
 * tile and says so rather than disappearing and shortening the week.
 */
function dayStrip(doc: Doc, y: number, peaks: DayPeak[], channel: Channel) {
  if (peaks.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text("No readings were taken on this conductor during this period.", MARGIN, y, {
      width: CONTENT,
    });
    doc.fillColor(COLOURS.ink);
    return;
  }

  const gap = 8;
  const width = (CONTENT - gap * (peaks.length - 1)) / peaks.length;
  const height = 50;
  const best = peaks.reduce((held, peak) => (peak.amps > held.amps ? peak : held), peaks[0]);

  peaks.forEach((peak, index) => {
    const x = MARGIN + index * (width + gap);
    const top = peak === best;

    doc
      .roundedRect(x, y, width, height, 4)
      .fillAndStroke(top ? COLOURS.soft : "#ffffff", top ? SERIES[channel] : COLOURS.hair);
    doc.rect(x + 1, y + 1, 3, height - 2).fill(SERIES[channel]);

    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(dayName(peak.day).toUpperCase(), x + 12, y + 9, {
      width: width - 20,
      characterSpacing: 0.9,
      lineBreak: false,
    });

    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOURS.ink);
    doc.text(`${round(peak.amps)} A`, x + 12, y + 22, { width: width - 20, lineBreak: false });

    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(`at ${when(peak.at).slice(6)}`, x + 12, y + 38, {
      width: width - 20,
      lineBreak: false,
    });
  });

  doc.fillColor(COLOURS.ink);
}

/** "phase 1" / "the neutral", for a page that is about one of them. */
function conductor(channel: Channel): string {
  return channel === "n" ? "the neutral" : `phase ${channel.slice(1)}`;
}

function highestIn(
  samples: PowerReport["recording"]["samples"],
  channels: Channel[],
): Peak | null {
  let best: Peak | null = null;
  for (const sample of samples) {
    for (const channel of channels) {
      const amps = sample[channel];
      if (amps === null) continue;
      if (!best || amps > best.amps) best = { channel, amps, at: sample.at };
    }
  }
  return best;
}

/* --- page furniture ------------------------------------------------------- */

function heading(doc: Doc, data: PowerReport, title: string, note?: string) {
  if (data.logo) doc.image(data.logo, MARGIN, 24, { fit: [118, 38] });

  doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOURS.ink);
  doc.text(safe(title), MARGIN + 136, 28, { width: CONTENT - 136 });
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text(
    safe([note, data.boardName, data.siteName, data.clientName].filter(Boolean).join("  ·  ")),
    MARGIN + 136,
    46,
    { width: CONTENT - 136, height: 11, ellipsis: true },
  );

  doc.rect(MARGIN, 72, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, 71, 54, 2.4).fill(COLOURS.accent);
  doc.fillColor(COLOURS.ink);
}

function stampPages(doc: Doc, data: PowerReport) {
  const range = doc.bufferedPageRange();
  // From page two: the cover has its own foot bar carrying the same details.
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = PAGE.height - 26;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(
      safe(`${data.clientName}  ·  ${data.siteName}`),
      MARGIN,
      y,
      { width: CONTENT - 140 },
    );
    doc.text(`Page ${index + 1} of ${range.count}`, MARGIN + CONTENT - 140, y, {
      width: 140,
      align: "right",
    });
    doc.text(
      `${COMPANY.name} · Lic ${COMPANY.licence} · Supervisor ${COMPANY.supervisor}`,
      MARGIN,
      y + 10,
      { width: CONTENT },
    );

    doc.page.margins.bottom = bottom;
  }
}

async function brandBytes(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}

type Doc = PDFKit.PDFDocument;
