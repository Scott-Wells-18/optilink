import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { STAGE_LABELS, type JobPhotoStage } from "@/lib/jobs";
import {
  coverPage,
  footer,
  newDocument,
  sectionBar,
  signOff,
  stampPageNumbers,
  tableHead,
  type Doc,
  type PageMeta,
} from "@/lib/report/furniture";
import { COLOURS, CONTENT, MARGIN, PAGE, longDate, safe, shortDate } from "@/lib/report/theme";

/**
 * The works completed report — what was found, what was done, and the photos
 * that prove it.
 *
 * The hard part is thirty photos of mixed orientation not reading as a photo
 * dump. So a piece of work is a row, not a page: a heading, two lines of
 * explanation, and a strip of fixed tiles. Every photo sits whole inside its
 * tile, which means a portrait from a phone gets bars at the sides and a
 * landscape gets them top and bottom — but every row is the same height and
 * nothing is ever cropped, which is what makes the page look designed.
 */

/**
 * Tiles are sized to fill the page rather than fixed: items are packed at the
 * smallest tile that still reads, then the tiles on each page grow into
 * whatever height is left over. A page of three and a page of two therefore
 * both end up full, instead of one of them trailing off into white paper.
 */
const MIN_TILE = 118;
const MAX_TILE = 178;
const TILE_GAP = 12;
const LABEL_HEIGHT = 15;
/** Heading, the found/done lines, the tiles, their labels, and room after. */
const ITEM_GAP = 22;
/** Text is allowed down to here; below it is the footer. */
const BOTTOM = PAGE.height - 82;

type Photo = { stage: JobPhotoStage; bytes: Buffer };

type Item = {
  index: number;
  title: string;
  location: string;
  found: string;
  done: string;
  photos: Photo[];
  page: number;
  /** Set during layout, once it is known how much room the page can spare. */
  tile: number;
};

export type JobReport = PageMeta & {
  jobTitle: string;
  jobDate: Date;
  reportDate: Date;
  contactName: string | null;
  recommendations: string[];
  items: Item[];
};

/* --- gathering ------------------------------------------------------------ */

export async function loadJobReport(jobId: string): Promise<JobReport | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      site: {
        include: {
          client: { select: { name: true } },
          contacts: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
      items: {
        orderBy: { position: "asc" },
        include: { photos: { orderBy: [{ stage: "asc" }, { position: "asc" }] } },
      },
    },
  });
  if (!job) return null;

  const items: Item[] = [];
  for (const [index, item] of job.items.entries()) {
    const photos: Photo[] = [];
    for (const photo of item.photos) {
      const bytes = await photoBytes(photo.fileId);
      if (bytes) photos.push({ stage: photo.stage as JobPhotoStage, bytes });
    }
    items.push({
      index: index + 1,
      title: safe(item.title),
      location: safe(item.location),
      found: safe(item.found),
      done: safe(item.done),
      // Before, then during, then after — the order the story is told in.
      photos: photos.sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage)),
      page: 0,
      tile: MIN_TILE,
    });
  }

  return {
    clientName: safe(job.site.client.name),
    siteName: safe(job.site.name),
    siteLocation: job.site.location ? safe(job.site.location) : null,
    contactName: job.site.contacts[0] ? safe(job.site.contacts[0].name) : null,
    jobTitle: safe(job.name?.trim() || shortDate(job.date)),
    jobDate: job.date,
    reportDate: new Date(),
    recommendations: job.recommendations.map(safe),
    items,
    logo: await brandBytes("logo.jpg"),
  };
}

function stageOrder(stage: JobPhotoStage): number {
  return stage === "BEFORE" ? 0 : stage === "DURING" ? 1 : 2;
}

async function photoBytes(fileId: string): Promise<Buffer | null> {
  const file = await prisma.uploadedFile.findUnique({ where: { id: fileId } });
  if (!file) return null;
  try {
    return await readUpload(file.storedName);
  } catch {
    // A photo missing off disk should not sink the whole report.
    return null;
  }
}

async function brandBytes(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}

/* --- drawing -------------------------------------------------------------- */

export function buildJobReport(data: JobReport): Promise<Buffer> {
  const { doc, done } = newDocument();

  // Laid out before anything is drawn, because the summary cites page numbers
  // and an item's height depends on how much was written about it.
  const pages = layout(doc, data);

  cover(doc, data);
  summary(doc, data);
  work(doc, data, pages);
  closing(doc, data);

  stampPageNumbers(doc);
  doc.end();
  return done;
}

function cover(doc: Doc, data: JobReport) {
  coverPage(doc, data, {
    title: "Works Completed Report",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: "Work Carried Out:",
    date: data.jobDate,
    scope: data.items.length
      ? data.items.map((item) => item.title).join(", ")
      : "Electrical maintenance works",
    rows: [
      ["Prepared for:", data.contactName ?? data.clientName],
      ["Report Date:", shortDate(data.reportDate)],
      ["Site:", data.siteName],
      ["Works By:", "Optilink Electrical & Communications"],
    ],
    marks: [],
  });
}

function summary(doc: Doc, data: JobReport) {
  doc.addPage();
  sectionBar(doc, "Summary of Works", MARGIN);

  const where = data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName;
  const count = data.items.length;
  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.ink);
  doc.text(
    `The following works were carried out for ${data.clientName} at ${where} on ${longDate(
      data.jobDate,
    )}. ${
      count === 1
        ? "One item of work was completed"
        : `${count} items of work were completed`
    }, each photographed as it was found and as it was left.`,
    MARGIN,
    MARGIN + 46,
    { width: CONTENT, lineGap: 2.5 },
  );

  let y = doc.y + 22;
  const columns = [178, CONTENT - 178 - 150 - 44, 150, 44];
  tableHead(doc, y, ["Work", "Location", "What was done", "Page"], columns);
  y += 20;

  doc.fontSize(9);
  data.items.forEach((item, index) => {
    const height = 23;
    doc
      .rect(MARGIN, y, CONTENT, height)
      .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold");
    doc.text(`${item.index}.  ${item.title}`, MARGIN + 8, y + 7, {
      width: columns[0] - 12,
      ellipsis: true,
      height: 12,
    });
    doc.font("Helvetica");
    doc.text(item.location, MARGIN + columns[0] + 8, y + 7, {
      width: columns[1] - 12,
      ellipsis: true,
      height: 12,
    });
    doc.text(item.done, MARGIN + columns[0] + columns[1] + 8, y + 7, {
      width: columns[2] - 12,
      ellipsis: true,
      height: 12,
    });
    doc.text(String(item.page), MARGIN + columns[0] + columns[1] + columns[2], y + 7, {
      width: columns[3],
      align: "center",
    });
    y += height;
  });

  footer(doc, data);
}

/**
 * Which items fall on which page, worked out from their measured heights.
 * Page 1 is the cover and page 2 the summary, so the work starts on page 3.
 */
function layout(doc: Doc, data: JobReport): Item[][] {
  const pages: Item[][] = [];
  let page: Item[] = [];
  let y = MARGIN + 34;

  for (const item of data.items) {
    const height = itemHeight(doc, item, MIN_TILE);
    if (page.length > 0 && y + height > BOTTOM) {
      pages.push(page);
      page = [];
      y = MARGIN;
    }
    item.page = pages.length + 3;
    page.push(item);
    y += height + ITEM_GAP;
  }
  if (page.length > 0) pages.push(page);

  // Share out whatever height is left on each page between its own items.
  pages.forEach((items, index) => {
    const top = index === 0 ? MARGIN + 34 : MARGIN;
    const used = items.reduce(
      (total, item) => total + itemHeight(doc, item, MIN_TILE) + ITEM_GAP,
      0,
    );
    const rows = items.reduce((total, item) => total + tileRows(item), 0);
    const spare = BOTTOM - top - used;
    const growth = rows > 0 ? Math.max(0, Math.floor(spare / rows)) : 0;
    for (const item of items) item.tile = Math.min(MAX_TILE, MIN_TILE + growth);
  });

  return pages;
}

/** How many rows of tiles an item needs — three across, or two when paired. */
function tileRows(item: Item): number {
  return Math.max(1, Math.ceil(item.photos.length / (item.photos.length === 2 ? 2 : 3)));
}

function work(doc: Doc, data: JobReport, pages: Item[][]) {
  pages.forEach((items, index) => {
    doc.addPage();
    let y = MARGIN;
    if (index === 0) {
      sectionBar(doc, "The Work", MARGIN);
      y = MARGIN + 34;
    }
    for (const item of items) {
      drawItem(doc, item, y);
      y += itemHeight(doc, item, item.tile) + ITEM_GAP;
    }
    footer(doc, data);
  });
}

/** Measured before drawing, so an item is never split across two pages. */
function itemHeight(doc: Doc, item: Item, tile: number): number {
  doc.font("Helvetica").fontSize(9.5);
  const textWidth = CONTENT - 46;
  const lines =
    doc.heightOfString(item.found, { width: textWidth }) +
    doc.heightOfString(item.done, { width: textWidth }) +
    6;
  return 20 + lines + 10 + tileRows(item) * (tile + LABEL_HEIGHT + 6);
}

function drawItem(doc: Doc, item: Item, top: number) {
  let y = top;

  // The heading: a numbered rule, the title, and where it was.
  doc.rect(MARGIN, y + 1, 3, 15).fill(COLOURS.accent);
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(11.5);
  doc.text(`${item.index}.  ${item.title}`, MARGIN + 12, y, { width: CONTENT - 160 });
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLOURS.inkSoft)
    .text(item.location, MARGIN + CONTENT - 150, y + 2, { width: 150, align: "right" });
  y += 20;

  const textWidth = CONTENT - 46;
  for (const [label, body] of [
    ["Found", item.found],
    ["Done", item.done],
  ] as const) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.accent);
    doc.text(label.toUpperCase(), MARGIN + 12, y + 1, { width: 34 });
    doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
    doc.text(body, MARGIN + 46, y, { width: textWidth, lineGap: 1 });
    y = doc.y + 3;
  }

  y += 7;

  // Tiles: three across, or two wider ones when there is no "during" shot, so
  // a row of two never looks like a row of three with a hole in it.
  const perRow = item.photos.length === 2 ? 2 : 3;
  const tileWidth = (CONTENT - TILE_GAP * (perRow - 1)) / perRow;

  item.photos.forEach((photo, index) => {
    const column = index % perRow;
    const row = Math.floor(index / perRow);
    const x = MARGIN + column * (tileWidth + TILE_GAP);
    const tileY = y + row * (item.tile + LABEL_HEIGHT + 6);

    doc.rect(x, tileY, tileWidth, item.tile).fillAndStroke(COLOURS.well, COLOURS.hair);
    // Contained, not cropped: whatever shape it is, all of it is there.
    doc.image(photo.bytes, x + 4, tileY + 4, {
      fit: [tileWidth - 8, item.tile - 8],
      align: "center",
      valign: "center",
    });

    const repeat = item.photos.filter(
      (other, at) => other.stage === photo.stage && at < index,
    ).length;
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLOURS.inkSoft)
      .text(
        repeat ? `${STAGE_LABELS[photo.stage].toUpperCase()} ${repeat + 1}` : STAGE_LABELS[photo.stage].toUpperCase(),
        x,
        tileY + item.tile + 4,
        { width: tileWidth, align: "center", characterSpacing: 0.6 },
      );
  });

  doc.fillColor(COLOURS.ink);
}

function closing(doc: Doc, data: JobReport) {
  doc.addPage();
  sectionBar(doc, "Completion", MARGIN);

  let y = MARGIN + 46;
  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.ink);
  doc.text(
    "The works listed in this report have been completed and left in a safe and serviceable condition. All work has been carried out in accordance with AS/NZS 3000 and tested on completion.",
    MARGIN,
    y,
    { width: CONTENT, lineGap: 2.5 },
  );
  y = doc.y + 24;

  if (data.recommendations.length > 0) {
    sectionBar(doc, "Further Recommendations", y);
    y += 32;
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
    doc.text(
      "The following was noted during the works but fell outside the agreed scope. We would recommend it is attended to.",
      MARGIN,
      y,
      { width: CONTENT, lineGap: 2 },
    );
    y = doc.y + 10;
    for (const line of data.recommendations) {
      doc.text(`•  ${line}`, MARGIN + 8, y, { width: CONTENT - 16, lineGap: 1.5 });
      y = doc.y + 5;
    }
    y += 14;
  }

  signOff(doc, y + 20);
  footer(doc, data);
}
