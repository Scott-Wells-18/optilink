import { readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import { COMPANY } from "@/lib/company";
import { readUpload } from "@/lib/storage";
import { reportSignature } from "@/lib/signatures";
import { COLOURS, safe, shortDate } from "@/lib/report/theme";
import { type PageMeta } from "@/lib/report/furniture";
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
  isBlank,
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

export type PowerReport = PageMeta & {
  location: string | null;
  /** The board the logger was fitted to, named. */
  boardName: string;
  /** What feeds that board, where it has been recorded against it. */
  supply: Supply;
  /** What the feed comes from, already resolved to a name. */
  feed: string | null;
  brief: Brief | null;
  contactName: string | null;
  reportDate: Date;
  recording: Recording;
  summary: Summary;
};

/* --- gathering ------------------------------------------------------------ */

export async function loadPowerReport(id: string): Promise<PowerReport | null> {
  const run = await prisma.powerAnalysis.findUnique({
    where: { id },
    include: {
      sourceFile: true,
      equipment: { select: { id: true, name: true, supply: true } },
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
  if (!run?.sourceFile) return null;

  let bytes: Buffer;
  try {
    bytes = await readUpload(run.sourceFile.storedName);
  } catch {
    return null;
  }

  const recording = readRecording(bytes, run.sourceFile.originalName);
  const summary = summarise(recording);
  if (!summary) return null;

  const supply = normaliseSupply(run.equipment?.supply);
  const feed = describeFeed(supply, run.site.equipment);

  return {
    clientName: safe(run.site.client.name),
    siteName: safe(run.site.name),
    siteLocation: run.site.location ? safe(run.site.location) : null,
    location: run.location ? safe(run.location) : null,
    boardName: safe(run.equipment?.name ?? run.location ?? "the main switchboard"),
    supply,
    feed: feed ? safe(feed) : null,
    brief: isBrief(run.brief) ? run.brief : null,
    contactName: run.contactName ? safe(run.contactName) : null,
    reportDate: new Date(),
    recording,
    summary,
    logo: await brandBytes("logo.jpg"),
    signature: await reportSignature(),
  };
}

/* --- what a power analysis is --------------------------------------------- */

const WHAT_IT_IS = [
  "A power analysis is a recording of how much current an installation actually draws, taken over a period long enough to include the way the site is really used. A logger is fitted at the switchboard with a current transformer clamped around each active conductor and around the neutral, and it is left in place while the site runs normally. It records the highest current seen on each conductor during every interval, so a short, sharp demand is captured rather than averaged away.",
  "What it answers is the question a nameplate cannot. The rating of a main switch, a submain or a supply is a limit, not a measurement, and the load on a board changes as equipment is added, shifts are changed or plant is replaced. Recording the installation over a fortnight shows the peak each phase reaches, how close that sits to the protection in front of it, whether the phases carry a similar share of the load, and how much current is returning down the neutral.",
  "Three things are read off the result. The first is headroom: the highest reading on any phase against the rating of the protective device, which is what decides whether there is capacity for more load. The second is balance: three phases carrying markedly different currents put the imbalance onto the neutral, waste capacity and overheat the lightly loaded conductors' counterparts. The third is the neutral itself, which on a balanced linear load carries very little, and on a site full of switch-mode supplies, LED drivers and variable speed drives can carry considerably more than expected.",
  "Every figure quoted in this report is the logger's own. On the charts, each line is the highest reading taken in each window of the recording rather than every individual reading, which is what makes a fortnight legible on a page; because it is the highest and never the average, no peak is lost or reduced. The highest reading of each week is marked on its chart at the moment it occurred, and the tables give it exactly as the logger recorded it.",
];

const NOTE =
  "This report is issued to the addressee named above and relates only to the installation and the recording period listed on it. It records the current drawn while the logger was fitted, under the conditions and the pattern of use present at the time. It is not a statement of what the installation will draw under different use, nor a substitute for a design calculation of maximum demand.";

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
  explain(doc, data);
  briefPage(doc, data, channels, pages.length);

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

  stampPages(doc, data);
  doc.end();
  return done;
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

  /* --- right: what was recorded, and the facts --------------------------- */
  const x = MARGIN + left + 40;
  const width = CONTENT - left - 40;
  let at = 132;

  const scope = safe(
    `${data.boardName}${data.feed ? `, fed from ${data.feed}` : ""} — three phases and neutral, logged every ${
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

  const facts: [string, string][] = [
    ["Brief", data.brief ? BRIEF_LABELS[data.brief] : "Current recording"],
    ["Recording started", shortDate(new Date(summary.from))],
    ["Recording period", `${when(summary.from)} to ${when(summary.to)}`],
    ["Readings", `${summary.count.toLocaleString("en-AU")} per channel`],
    [
      "Highest current",
      highest
        ? `${round(highest.amps)} A on ${CHANNEL_LABELS[highest.channel]}, ${when(highest.at)}`
        : "\u2014",
    ],
    ["Report date", shortDate(data.reportDate)],
    ["Recorded by", `${COMPANY.name} \u00b7 Lic ${COMPANY.licence}`],
  ];

  for (const [name, value] of facts) {
    doc.rect(x, at, width, 0.6).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9);
    doc.text(name, x, at + 7, { width: 118, height: 11, lineBreak: false });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9.5);
    doc.text(value, x + 124, at + 6.5, { width: width - 124, height: 12, ellipsis: true });
    at += 24;
  }
  doc.rect(x, at, width, 0.6).fill(COLOURS.hair);

  /* --- the foot ---------------------------------------------------------- */
  const footY = PAGE.height - MARGIN - 32;
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  const noteHeight = doc.heightOfString(NOTE, { width: CONTENT, lineGap: 1.5 });
  doc.text(NOTE, MARGIN, footY - noteHeight - 18, { width: CONTENT, lineGap: 1.5 });

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

/** A small letterspaced heading, the one marker of hierarchy on the cover. */
function label(doc: Doc, text: string, x: number, y: number) {
  doc.fillColor(COLOURS.inkSoft).font("Helvetica-Bold").fontSize(8);
  doc.text(text.toUpperCase(), x, y, { characterSpacing: 1.8, lineBreak: false });
  doc.fillColor(COLOURS.ink);
}

/** What a power analysis is, and what this one found. */
function explain(doc: Doc, data: PowerReport) {
  doc.addPage();
  heading(doc, data, "About this recording");

  let y = 104;
  const column = CONTENT / 2 - 18;

  // Two columns, because a full-width line of text on a landscape page is too
  // long to track back to the start of the next one.
  const top = y;
  const halves = [WHAT_IT_IS.slice(0, 2), WHAT_IT_IS.slice(2)];
  halves.forEach((paragraphs, index) => {
    let at = top;
    const x = MARGIN + index * (column + 36);
    for (const paragraph of paragraphs) {
      const text = safe(paragraph);
      doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
      doc.text(text, x, at, { width: column, lineGap: 2.2, align: "justify" });
      at += doc.heightOfString(text, { width: column, lineGap: 2.2 }) + 11;
    }
    y = Math.max(y, at);
  });

  /* --- what this one found ---------------------------------------------- */
  y += 12;
  doc.rect(MARGIN, y, CONTENT, 20).fill(COLOURS.bar);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.onBar);
  doc.text("HIGHEST CURRENT RECORDED", MARGIN + 10, y + 6, { characterSpacing: 1 });
  y += 24;

  const channels = channelsIn(data.recording);
  const widths = [90, 110, 190, CONTENT - 390];
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.inkSoft);
  ["Conductor", "Highest", "When", "As the logger labelled it"].forEach((title, index) => {
    doc.text(title.toUpperCase(), MARGIN + offset(widths, index) + 8, y, {
      width: widths[index] - 12,
      characterSpacing: 1,
    });
  });
  y += 13;

  channels.forEach((channel, index) => {
    const peak = data.summary.peaks[channel];
    doc.rect(MARGIN, y, CONTENT, 20).fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
    doc.rect(MARGIN + 8, y + 7, 14, 2.4).fill(SERIES[channel]);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
    doc.text(CHANNEL_LABELS[channel], MARGIN + 28, y + 6, { lineBreak: false });
    doc.font("Helvetica").fontSize(9);
    doc.text(peak ? `${round(peak.amps)} A` : "—", MARGIN + offset(widths, 1) + 8, y + 6, {
      width: widths[1] - 12,
    });
    doc.fillColor(COLOURS.inkSoft);
    doc.text(peak ? when(peak.at) : "—", MARGIN + offset(widths, 2) + 8, y + 6, {
      width: widths[2] - 12,
    });
    doc.text(
      safe(data.recording.headings[channel] ?? "—"),
      MARGIN + offset(widths, 3) + 8,
      y + 6,
      { width: widths[3] - 12, ellipsis: true, height: 11 },
    );
    doc.fillColor(COLOURS.ink);
    y += 20;
  });

  if (data.summary.skipped > 0) {
    y += 10;
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(
      `${data.summary.skipped} rows in the file carried no readable timestamp and were left out.`,
      MARGIN,
      y,
      { width: CONTENT },
    );
  }
}

function offset(widths: number[], index: number): number {
  return widths.slice(0, index).reduce((total, width) => total + width, 0);
}

/* --- why it was recorded, and what feeds the board ------------------------ */

const NO_SUPPLY =
  "The supply arrangement for this board has not been recorded. Where the size of the protective device in front of the board is not known, the currents in this report can be read as a record of the load but not as a measure of the capacity remaining.";

function briefPage(doc: Doc, data: PowerReport, channels: Channel[], weekCount: number) {
  doc.addPage();
  heading(doc, data, "The brief and the supply");

  const column = 430;
  let y = 104;

  /* --- left: what was asked for ------------------------------------------ */
  label(doc, "Objective", MARGIN, y);
  y += 16;

  if (data.brief) {
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOURS.bar);
    doc.text(BRIEF_LABELS[data.brief], MARGIN, y, { width: column });
    y += 20;
  }

  const text = safe(
    data.brief
      ? objective({
          brief: data.brief,
          board: data.boardName,
          client: data.clientName,
          site: data.siteName,
          contact: data.contactName,
        })
      : `This recording was carried out at ${data.boardName}, ${data.siteName}, for ${data.clientName}. It sets out the current carried by each phase and by the neutral across the recording period.`,
  );
  doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text(text, MARGIN, y, { width: column, lineGap: 2.4, align: "justify" });
  y += doc.heightOfString(text, { width: column, lineGap: 2.4 }) + 20;

  const spare = headroom(data, channels);
  if (spare) {
    const height = 74;
    doc.rect(MARGIN, y, column, height).fill(COLOURS.soft);
    doc.rect(MARGIN, y, 3, height).fill(COLOURS.accent);
    label(doc, "Capacity remaining", MARGIN + 18, y + 13);

    doc.font("Helvetica-Bold").fontSize(23).fillColor(COLOURS.ink);
    doc.text(`${round(spare.spare)} A`, MARGIN + 18, y + 28, { lineBreak: false });
    const width = doc.widthOfString(`${round(spare.spare)} A`);
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text(
      `of the ${spare.rating} A in front of the board, ${spare.used}% used`,
      MARGIN + 26 + width,
      y + 38,
      { width: column - 44 - width, lineBreak: false },
    );
    doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(
      safe(
        `The arithmetic difference between the rating of the protective device and the highest current recorded on any phase (${round(spare.peak)} A). It is not a maximum demand calculation and makes no allowance for diversity, ambient conditions or the capacity of the supply behind the board.`,
      ),
      MARGIN + 18,
      y + 54,
      { width: column - 36, lineGap: 1 },
    );
    y += height;
  }

  /* --- right: what feeds it ---------------------------------------------- */
  const x = MARGIN + column + 40;
  const width = CONTENT - column - 40;
  let at = 104;

  label(doc, "Supply to the board", x, at);
  at += 18;

  const rows: [string, string | null][] = [
    ["Board recorded", data.boardName],
    ["Fed from", data.feed],
    ["Length of run", describeLength(data.supply)],
    ["Protective device", data.supply.protectiveDevice],
    ["Mains, active", data.supply.activeCable],
    ["Mains, neutral", data.supply.neutralCable],
    ["Logger fitted at", data.location],
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

  if (isBlank(data.supply)) {
    at += 14;
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(NO_SUPPLY), x, at, { width, lineGap: 1.6 });
    at += doc.heightOfString(safe(NO_SUPPLY), { width, lineGap: 1.6 });
  }

  contents(doc, Math.max(y, at) + 30, channels, weekCount);
  doc.fillColor(COLOURS.ink);
}

/**
 * What is in the rest of the report, and on which page.
 *
 * Eighteen pages of charts needs a way in. The numbers are worked out rather
 * than measured, because the order of the pages is fixed: the covers, a chart
 * per week with everything on it, then each conductor on its own a week at a
 * time.
 */
function contents(doc: Doc, y: number, channels: Channel[], weekCount: number) {
  const week = (number: number) =>
    weekCount > 1 ? `Week ${number} of ${weekCount}` : "The recording";

  const entries: [string, number][] = [
    ["About this recording", 2],
    ["The brief and the supply", 3],
    ...Array.from({ length: weekCount }, (_, index): [string, number] => [
      `All conductors — ${week(index + 1)}`,
      4 + index,
    ]),
    ...channels.flatMap((channel, place) =>
      Array.from({ length: weekCount }, (_, index): [string, number] => [
        `${CHANNEL_LABELS[channel]}, ${conductor(channel)} — ${week(index + 1)}`,
        3 + weekCount + place * weekCount + index + 1,
      ]),
    ),
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
    `Each line is the highest reading in every ${describeWindow(spec)} window. Peaks are the logger's own, untouched.`,
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
    safe([note, data.location, data.siteName, data.clientName].filter(Boolean).join("  ·  ")),
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
