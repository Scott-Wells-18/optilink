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
  describeWindow,
  drawChart,
  legend,
  markPeak,
  round,
  scaleTop,
  when,
  type ChartBox,
} from "@/lib/report/chart";
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
      site: { include: { client: { select: { name: true } } } },
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

  return {
    clientName: safe(run.site.client.name),
    siteName: safe(run.site.name),
    siteLocation: run.site.location ? safe(run.site.location) : null,
    location: run.location ? safe(run.location) : null,
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

  cover(doc, data);
  explain(doc, data);

  const channels = channelsIn(data.recording);
  const pages = weeks(data.recording.samples);
  // One scale across every page, so the second week is read against the first
  // rather than against itself.
  const top = scaleTop(
    Math.max(...Object.values(data.summary.peaks).map((peak) => peak.amps), 1),
  );

  pages.forEach((week, index) => {
    doc.addPage();
    weekPage(doc, data, week, index + 1, pages.length, channels, top);
  });

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
    `${data.location ?? "Main switchboard"} — three phases and neutral, logged every ${
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
