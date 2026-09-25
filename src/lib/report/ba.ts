import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import {
  JOB_STAGES,
  MAX_PHOTOS_PER_STAGE,
  STAGE_LABELS,
  isComplete,
  type JobPhotoStage,
} from "@/lib/jobs";
import { COMPANY } from "@/lib/company";
import { tidy, titleCase } from "@/lib/writing";
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
import {
  layout,
  measureText,
  render,
  type Layout,
  type Piece,
  type Section,
} from "@/lib/report/flow";
import { COLOURS, CONTENT, MARGIN, longDate, safe, shortDate } from "@/lib/report/theme";
import { reportSignature } from "@/lib/signatures";

/**
 * The works completed report — what was found, what was done, and the photos
 * that prove it.
 *
 * The hard part is thirty photos of mixed orientation not reading as a photo
 * dump. So an item is a heading, two lines of explanation, and a strip of
 * tiles per stage — before, then during, then after — with the stage named
 * once above its strip rather than under every photo.
 *
 * How many tiles go across depends on how many photos that stage holds: a pair
 * gets half the page each, four go two by two rather than three and a straggler,
 * and past six they come down in size so one item does not eat three pages.
 * Whatever the size, a photo is contained and never cropped — a phone portrait
 * gets bars at the sides, a landscape gets them above and below — because a
 * crop can hide the very thing the photo was taken to show.
 */

/** The gap between tiles, and the strip of label above them. */
const TILE_GAP = 12;
const LABEL_HEIGHT = 15;
/** Clear space under one item before the next one starts. */
const ITEM_GAP = 22;

type Photo = { stage: JobPhotoStage; bytes: Buffer };

type Item = {
  index: number;
  title: string;
  location: string;
  found: string;
  done: string;
  photos: Photo[];
};

export type JobReport = PageMeta & {
  jobTitle: string;
  jobDate: Date;
  reportDate: Date;
  contactName: string | null;
  recommendations: string[];
  items: Item[];
  /** Pieces of work saved but not yet written up, left off this report. */
  unfinished: number;
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

  // Only what is finished goes on the report. A job gets done and written up
  // at different times, so a piece of work can be saved half-written and
  // picked up later — but a works record is what was done, and half a
  // sentence about it is not that. What is left out is counted and said.
  const ready = job.items.filter((item) => isComplete(item));
  const unfinished = job.items.length - ready.length;

  const items: Item[] = [];
  for (const [index, item] of ready.entries()) {
    const photos: Photo[] = [];
    for (const photo of item.photos) {
      const bytes = await photoBytes(photo.fileId);
      if (bytes) photos.push({ stage: photo.stage as JobPhotoStage, bytes });
    }
    items.push({
      index: index + 1,
      title: safe(titleCase(item.title)),
      location: safe(titleCase(item.location)),
      found: safe(tidy(item.found)),
      done: safe(tidy(item.done)),
      // Before, then during, then after — the order the story is told in.
      photos: photos.sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage)),
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
    unfinished,
    logo: await brandBytes("logo.jpg"),
    signature: await reportSignature(),
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

/** Cover and summary are drawn by hand; the work follows. */
const FIRST_SECTION_PAGE = 3;

export function buildJobReport(data: JobReport): Promise<Buffer> {
  const { doc, done } = newDocument();

  // Measured and packed before anything is drawn, because the summary cites
  // page numbers and an item is as tall as what was written and shot for it.
  const laid = layout([work(doc, data), closing(doc, data)], FIRST_SECTION_PAGE);

  cover(doc, data);
  summary(doc, data, laid);
  render(doc, data, laid);

  stampPageNumbers(doc);
  doc.end();
  return done;
}

function cover(doc: Doc, data: JobReport) {
  coverPage(doc, data, {
    title: "Works Completed Report",
    eyebrow: "Before and after record",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: "Work carried out",
    date: data.jobDate,
    scopeLabel: "Work carried out",
    scope: data.items.length
      ? data.items.map((item) => item.title).join(", ")
      : "Electrical maintenance works",
    rows: [
      ["Site contact", data.contactName ?? data.clientName],
      ["Report date", shortDate(data.reportDate)],
      ["Items of work", `${data.items.length}`],
      ["Works carried out by", `${COMPANY.name} · Lic ${COMPANY.licence}`],
    ],
    note:
      "This report is issued to the addressee named above and relates only to the site and the work listed on it. " +
      "Every photograph in it was taken on site during the work it appears beside, and shows the equipment as it " +
      "was found and as it was left.",
    marks: [],
  });
}

function summary(doc: Doc, data: JobReport, laid: Layout) {
  doc.addPage();
  sectionBar(doc, "Summary of Works", MARGIN);

  const where = data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName;
  const count = data.items.length;
  const photos = data.items.reduce((total, item) => total + item.photos.length, 0);

  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.ink);
  doc.text(
    `The following works were carried out for ${data.clientName} at ${where} on ${longDate(
      data.jobDate,
    )}. ${
      count === 1 ? "One item of work was completed" : `${count} items of work were completed`
    }, photographed as found and as left — ${photos} ${
      photos === 1 ? "photograph" : "photographs"
    } in all.${
      // A piece of work saved but not yet written up is left off rather than
      // printed half-finished, and the report says so rather than quietly
      // being shorter than the day was.
      data.unfinished === 0
        ? ""
        : data.unfinished === 1
          ? " A further item of work has been recorded but not yet written up, and is not included here."
          : ` A further ${data.unfinished} items of work have been recorded but not yet written up, and are not included here.`
    }`,
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
    doc.text(
      String(laid.pageOf[`item:${item.index}`] ?? ""),
      MARGIN + columns[0] + columns[1] + columns[2],
      y + 7,
      { width: columns[3], align: "center" },
    );
    y += height;
  });

  footer(doc, data);
}

/* --- how a strip of photos is laid out ------------------------------------ */

/**
 * A stage is laid out three tiles across, whatever it holds.
 *
 * Nine photographs is what one stage takes and three by three is what nine
 * makes, so three across is the grid. Holding to it when a stage has fewer
 * keeps every tile on the page the same size: a before of nine beside an after
 * of four still reads as one record rather than two different documents.
 */
const ACROSS = 3;

/** A tile never spans more than half the page, however few photos there are. */
function tileSize(count: number): { columns: number; width: number; height: number } {
  const columns = Math.max(1, Math.min(ACROSS, count));
  const across = Math.max(2, columns);
  const width = (CONTENT - TILE_GAP * (across - 1)) / across;
  return { columns, width, height: Math.round(width * 0.78) };
}

/** The grid a stage is drawn on: always three wide, at the size that fits. */
const GRID_WIDTH = (CONTENT - TILE_GAP * (ACROSS - 1)) / ACROSS;
const GRID_HEIGHT = Math.round(GRID_WIDTH * 0.78);

/** A photo in its well: contained, centred, never cropped. */
function drawTile(doc: Doc, bytes: Buffer, x: number, y: number, width: number, height: number) {
  doc.rect(x, y, width, height).fillAndStroke(COLOURS.well, COLOURS.hair);
  doc.image(bytes, x + 4, y + 4, {
    fit: [width - 8, height - 8],
    align: "center",
    valign: "center",
  });
}

/* --- the work ------------------------------------------------------------- */

function work(doc: Doc, data: JobReport): Section {
  const pieces: Piece[] = [];

  if (data.items.length === 0) {
    pieces.push({
      height: 30,
      draw: (y) => {
        doc.font("Helvetica-Oblique").fontSize(10.5).fillColor(COLOURS.inkSoft);
        doc.text("No work has been written up against this report yet.", MARGIN, y, {
          width: CONTENT,
        });
      },
    });
    return { id: "work", title: "The Work", pieces };
  }

  for (const item of data.items) {
    // The heading, and enough of what follows that it is never left alone at
    // the foot of a page.
    pieces.push({
      height: 22,
      keepWith: 2,
      mark: `item:${item.index}`,
      draw: (y) => {
        doc.rect(MARGIN, y + 1, 3, 15).fill(COLOURS.accent);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(11.5);
        doc.text(`${item.index}.  ${item.title}`, MARGIN + 12, y, {
          width: CONTENT - 160,
          ellipsis: true,
          height: 14,
        });
        doc
          .font("Helvetica")
          .fontSize(9.5)
          .fillColor(COLOURS.inkSoft)
          .text(item.location, MARGIN + CONTENT - 150, y + 2, { width: 150, align: "right" });
      },
    });

    const textWidth = CONTENT - 46;
    for (const [label, body] of [
      ["Found", item.found],
      ["Done", item.done],
    ] as const) {
      const height = measureText(doc, body, { width: textWidth, size: 9.5, lineGap: 1 }) + 3;
      pieces.push({
        height,
        draw: (y) => {
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.accent);
          doc.text(label.toUpperCase(), MARGIN + 12, y + 1, { width: 34 });
          doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
          doc.text(body, MARGIN + 46, y, { width: textWidth, lineGap: 1 });
        },
      });
    }

    pieces.push({ height: 9, draw: () => {} });

    const stages = JOB_STAGES.map((stage) => ({
      stage,
      shots: item.photos.filter((photo) => photo.stage === stage),
    })).filter((entry) => entry.shots.length > 0);

    // The classic case — one shot of each — reads as a single row, each tile
    // labelled under itself. Stacking a strip per stage would give it half a
    // page for two photographs.
    const single = stages.length > 0 && stages.every((entry) => entry.shots.length === 1);

    if (single) {
      const { width, height } = tileSize(stages.length);
      pieces.push({
        height: height + LABEL_HEIGHT + 6,
        draw: (y) => {
          stages.forEach((entry, column) => {
            const x = MARGIN + column * (width + TILE_GAP);
            drawTile(doc, entry.shots[0].bytes, x, y, width, height);
            doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.inkSoft);
            doc.text(STAGE_LABELS[entry.stage].toUpperCase(), x, y + height + 4, {
              width,
              align: "center",
              characterSpacing: 0.6,
            });
          });
          doc.fillColor(COLOURS.ink);
        },
      });
    } else {
      // One grid per stage, so the story reads before, during, after — and the
      // stage is named once over its grid rather than under every tile.
      //
      // The grid is kept whole: the label asks for every row of it to fit
      // alongside, so a stage of nine lands as a three-by-three block on one
      // page rather than six photographs here and three overleaf. A stage
      // saved before nine was the limit can run to more rows than a page
      // holds, and asking for the impossible only pushes it off the bottom —
      // so past three rows it is allowed to break where it must.
      for (const { stage, shots } of stages) {
        const width = GRID_WIDTH;
        const height = GRID_HEIGHT;
        const columns = ACROSS;
        const rows = Math.ceil(shots.length / columns);

        pieces.push({
          height: LABEL_HEIGHT,
          keepWith: Math.min(rows, Math.ceil(MAX_PHOTOS_PER_STAGE / ACROSS)),
          draw: (y) => {
            doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.inkSoft);
            doc.text(
              shots.length > 1
                ? `${STAGE_LABELS[stage].toUpperCase()}  \u00b7  ${shots.length}`
                : STAGE_LABELS[stage].toUpperCase(),
              MARGIN + 1,
              y + 2,
              { width: CONTENT, characterSpacing: 0.6 },
            );
            doc.fillColor(COLOURS.ink);
          },
        });

        for (let row = 0; row < rows; row += 1) {
          const inRow = shots.slice(row * columns, row * columns + columns);
          pieces.push({
            height: height + 7,
            draw: (y) => {
              inRow.forEach((photo, column) => {
                drawTile(doc, photo.bytes, MARGIN + column * (width + TILE_GAP), y, width, height);
              });
            },
          });
        }
      }
    }

    pieces.push({ height: ITEM_GAP, draw: () => {} });
  }

  return { id: "work", title: "The Work", pieces };
}

/* --- signing it off ------------------------------------------------------- */

function closing(doc: Doc, data: JobReport): Section {
  const pieces: Piece[] = [];

  const opener = safe(
    "The works listed in this report have been completed and left in a safe and serviceable condition. All work has been carried out in accordance with AS/NZS 3000 and tested on completion.",
  );
  pieces.push({
    height: measureText(doc, opener, { width: CONTENT, size: 10.5, lineGap: 2.5 }) + 24,
    draw: (y) => {
      doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.ink);
      doc.text(opener, MARGIN, y, { width: CONTENT, lineGap: 2.5 });
    },
  });

  if (data.recommendations.length > 0) {
    pieces.push({
      height: 32,
      keepWith: 2,
      draw: (y) => sectionBar(doc, "Further Recommendations", y),
    });
    const note = safe(
      "The following was noted during the works but fell outside the agreed scope. We would recommend it is attended to.",
    );
    pieces.push({
      height: measureText(doc, note, { width: CONTENT, size: 10 }) + 10,
      draw: (y) => {
        doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
        doc.text(note, MARGIN, y, { width: CONTENT, lineGap: 2 });
      },
    });
    for (const line of data.recommendations) {
      const height = measureText(doc, line, { width: CONTENT - 20, size: 10, lineGap: 1.5 }) + 5;
      pieces.push({
        height,
        draw: (y) => {
          doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
          doc.text("•", MARGIN + 6, y, { width: 10 });
          doc.text(line, MARGIN + 18, y, { width: CONTENT - 20, lineGap: 1.5 });
        },
      });
    }
    pieces.push({ height: 14, draw: () => {} });
  }

  // Tall enough for the signature, which is drawn above the rule it sits on.
  pieces.push({ height: 110, draw: (y) => signOff(doc, data, y + 40) });

  return { id: "closing", title: "Completion", pieces };
}
