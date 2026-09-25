import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { personName } from "@/lib/contacts";
import { readUpload } from "@/lib/storage";
import {
  JOB_STAGES,
  STAGE_LABELS,
  isComplete,
  type JobPhotoStage,
} from "@/lib/jobs";
import { COMPANY, THERMOGRAPHER } from "@/lib/company";
import { tidy, titleCase } from "@/lib/writing";
import {
  COVER_LIST_MAX,
  bulletColumns,
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
  pageRoom,
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
 * dump. So every numbered item of work opens its own page, and under its
 * heading come the photographs a stage at a time — before, then during, then
 * after — each stage named once above its own grid, with what was found
 * riding above the before photographs and what was done above the after ones,
 * because that is what each of them is explaining.
 *
 * The grid is three across and never more than three deep: nine photographs to
 * a page, and a stage that will not fit in what is left of one starts the next.
 * Whatever the size, a photo is contained and never cropped — a phone portrait
 * gets bars at the sides, a landscape gets them above and below — because a
 * crop can hide the very thing the photo was taken to show.
 */

/** The gap between tiles, and the strip of label above them. */
const TILE_GAP = 12;
const LABEL_HEIGHT = 15;
/** Clear air under a row of tiles. */
const ROW_GAP = 7;
/** The item's heading, and a little air under the last row on a page. */
const HEAD_HEIGHT = 26;
const TAIL_PAD = 6;

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
      contact: { select: { name: true } },
      site: { include: { client: { select: { name: true } } } },
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
    contactName: job.contact ? safe(personName(job.contact.name)) : null,
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

export function buildJobReport(data: JobReport): Promise<Buffer> {
  const { doc, done } = newDocument();

  // Cover, then any page of work the cover's two columns could not hold, then
  // the summary — so the first section starts after all of them.
  const firstSection = 3 + overflowPages(data);

  // Measured and packed before anything is drawn, because the summary cites
  // page numbers and an item is as tall as what was written and shot for it.
  const laid = layout([work(doc, data), closing(doc, data)], firstSection);

  cover(doc, data);
  restOfTheList(doc, data);
  summary(doc, data, laid);
  render(doc, data, laid);

  stampPageNumbers(doc);
  doc.end();
  return done;
}

/** Every piece of work, in the order it is written up. */
function titles(data: JobReport): string[] {
  return data.items.map((item) => item.title);
}

/** How many pages of work the cover's own two columns could not take. */
function overflowPages(data: JobReport): number {
  return Math.ceil(Math.max(0, titles(data).length - COVER_LIST_MAX) / COVER_LIST_MAX);
}

function cover(doc: Doc, data: JobReport) {
  const listed = titles(data);
  coverPage(doc, data, {
    title: "Works Completed Report",
    eyebrow: "Before and after record",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: "Work carried out",
    date: data.jobDate,
    scopeLabel: "Work carried out",
    scopeList: listed,
    // What a reader pulling the text out of the file gets, and what is drawn
    // where there is no work on the report to list.
    scope: listed.length ? listed.join(", ") : "Electrical maintenance works",
    rows: [
      ["Site contact", data.contactName ?? data.clientName],
      ["Report date", shortDate(data.reportDate)],
      ["Items of work", `${listed.length}`],
      ["Works carried out by", `${THERMOGRAPHER.name} · Lic ${COMPANY.licence}`],
    ],
    note:
      "This report is issued to the addressee named above and relates only to the site and the work listed on it. " +
      "Every photograph in it was taken on site during the work it appears beside, and shows the equipment as it " +
      "was found and as it was left.",
    marks: [],
  });
}

/**
 * The work the cover's two columns could not hold.
 *
 * A day of forty pieces of work is a real day, and cutting the list at thirty
 * would leave the cover saying less than was done. So it carries on here, in
 * the same two columns, for as many pages as it takes.
 */
function restOfTheList(doc: Doc, data: JobReport) {
  const rest = titles(data).slice(COVER_LIST_MAX);
  if (rest.length === 0) return;

  for (let at = 0; at < rest.length; at += COVER_LIST_MAX) {
    const page = rest.slice(at, at + COVER_LIST_MAX);
    doc.addPage();
    sectionBar(doc, "Work Carried Out (continued)", MARGIN);
    bulletColumns(doc, page, MARGIN + 4, MARGIN + 46, CONTENT - 8);
    footer(doc, data);
  }
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
 * The grid: three tiles across, three rows deep, nine to a page.
 *
 * Holding to three across whatever a stage holds keeps every tile on the page
 * the same size: a before of nine beside an after of four still reads as one
 * record rather than two different documents.
 */
const ACROSS = 3;
const DOWN = 3;
const PER_PAGE = ACROSS * DOWN;

const TILE_WIDTH = (CONTENT - TILE_GAP * (ACROSS - 1)) / ACROSS;

/**
 * How tall a tile is allowed to get, and how short it may be squeezed.
 *
 * The photographs are taken on a phone and held upright, so the well they sit
 * in is upright too — four tall to three wide, which is the shape of the
 * photograph itself. A portrait then fills its well edge to edge instead of
 * sitting as a stamp in the middle of a square with bars down both sides.
 *
 * Three rows of a well that tall do not fit on a page, so a page of three rows
 * takes what the page has; the floor is the point below which a photograph
 * stops being worth printing.
 */
const TALL = Math.round((TILE_WIDTH * 4) / 3);
const SHORT = 112;

/** A photo in its well: contained, centred, never cropped. */
function drawTile(doc: Doc, bytes: Buffer, x: number, y: number, width: number, height: number) {
  doc.rect(x, y, width, height).fillAndStroke(COLOURS.well, COLOURS.hair);
  doc.image(bytes, x + 4, y + 4, {
    fit: [width - 8, height - 8],
    align: "center",
    valign: "center",
  });
}

/* --- how an item's photographs fall onto pages ---------------------------- */

/** A line of explanation that belongs to a particular stage's photographs. */
type Note = { tag: string; body: string };

/** One stage's photographs, or as many of them as one page will take. */
type Grid = {
  stage: JobPhotoStage;
  shots: Photo[];
  rows: number;
  /** How many the stage holds in all, for the label over the first of them. */
  total: number;
  /** True where this is the rest of a stage carried over from the page before. */
  carried: boolean;
  /** What was found, or what was done — whichever this stage is showing. */
  note: Note | null;
};

/** What one page of an item carries. */
type Leaf = {
  grids: Grid[];
  rows: number;
  /** A line with no photographs of its own to sit above. */
  lead: Note | null;
  tail: Note | null;
};

/**
 * A stage, cut into pagefuls.
 *
 * Nine to a page is the rule, and a stage is capped at nine when it is saved,
 * so this only ever does anything for a stage photographed before that cap
 * existed. Its label says the total and the rest are marked as carried over,
 * so nobody reads the second half of a stage as a stage of its own.
 */
function cut(stage: JobPhotoStage, shots: Photo[], note: Note | null): Grid[] {
  const out: Grid[] = [];
  for (let at = 0; at < shots.length; at += PER_PAGE) {
    const slice = shots.slice(at, at + PER_PAGE);
    out.push({
      stage,
      shots: slice,
      rows: Math.ceil(slice.length / ACROSS),
      total: shots.length,
      carried: at > 0,
      note: at === 0 ? note : null,
    });
  }
  return out;
}

/**
 * The item's stages dealt onto pages, three rows to a page.
 *
 * A stage is never split across a page break — the photographs of one stage
 * belong together — so a stage that will not fit in the rows left starts the
 * next page. Three before photographs and three after share a page; seven
 * before fill one on their own and whatever follows begins the next.
 */
function pagefuls(grids: Grid[]): Leaf[] {
  const leaves: Leaf[] = [];
  let leaf: Leaf = { grids: [], rows: 0, lead: null, tail: null };

  for (const grid of grids) {
    if (leaf.grids.length > 0 && leaf.rows + grid.rows > DOWN) {
      leaves.push(leaf);
      leaf = { grids: [], rows: 0, lead: null, tail: null };
    }
    leaf.grids.push(grid);
    leaf.rows += grid.rows;
  }

  leaves.push(leaf);
  return leaves;
}

/** How tall a leaf is before its tiles: headings, labels and explanations. */
function furnitureOf(doc: Doc, leaf: Leaf, withHead: boolean): number {
  const notes = [leaf.lead, ...leaf.grids.map((grid) => grid.note), leaf.tail];
  return (
    (withHead ? HEAD_HEIGHT : 0) +
    leaf.grids.length * LABEL_HEIGHT +
    notes.reduce((total, note) => total + (note ? noteHeight(doc, note.body) : 0), 0) +
    leaf.rows * ROW_GAP +
    TAIL_PAD
  );
}

/**
 * How tall the tiles are for one item of work.
 *
 * As tall as the page allows, up to the upright well — but the same on every
 * page of the item, so a stage of three and a stage of seven are photographed
 * at one size rather than the reader being shown two. The page with the most
 * rows on it is therefore what decides the size for all of them.
 */
function tileHeight(doc: Doc, leaves: Leaf[], underBar: boolean): number {
  let height = TALL;
  leaves.forEach((leaf, at) => {
    if (leaf.rows === 0) return;
    const room = pageRoom(underBar && at === 0) - furnitureOf(doc, leaf, at === 0);
    height = Math.min(height, Math.floor(room / leaf.rows));
  });
  return Math.max(SHORT, height);
}

const NOTE_INDENT = 46;
const NOTE_WIDTH = CONTENT - NOTE_INDENT;

function noteHeight(doc: Doc, body: string): number {
  return measureText(doc, body, { width: NOTE_WIDTH, size: 9.5, lineGap: 1 }) + 5;
}

/** "FOUND  Socket loose in the wall" — the line above a stage's photographs. */
function notePiece(doc: Doc, note: Note): Piece {
  return {
    height: noteHeight(doc, note.body),
    draw: (y) => {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.accent);
      doc.text(note.tag.toUpperCase(), MARGIN + 12, y + 1, { width: 34 });
      doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
      doc.text(note.body, MARGIN + NOTE_INDENT, y, { width: NOTE_WIDTH, lineGap: 1 });
    },
  };
}

/** "BEFORE · 7", or "BEFORE · CONTINUED" where the stage ran onto this page. */
function gridLabel(grid: Grid): string {
  const name = STAGE_LABELS[grid.stage].toUpperCase();
  if (grid.carried) return `${name}  ·  CONTINUED`;
  return grid.total > 1 ? `${name}  ·  ${grid.total}` : name;
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

  for (const [at, item] of data.items.entries()) {
    const grids = JOB_STAGES.flatMap((stage) => {
      const shots = item.photos.filter((photo) => photo.stage === stage);
      if (shots.length === 0) return [];
      // What was found is what the before photographs are showing, and what
      // was done is what the after ones are showing. Each rides above its own
      // stage rather than both sitting at the top of the item away from the
      // photographs they are explaining.
      const note =
        stage === "BEFORE"
          ? { tag: "Found", body: item.found }
          : stage === "AFTER"
            ? { tag: "Done", body: item.done }
            : null;
      return cut(stage, shots, note);
    });

    const leaves = pagefuls(grids);

    // A line with no photographs of its own to sit above still has to be said:
    // above everything where nothing was photographed as found, and under the
    // last of them where nothing was photographed as left.
    const has = (stage: JobPhotoStage) => grids.some((grid) => grid.stage === stage);
    if (!has("BEFORE")) leaves[0].lead = { tag: "Found", body: item.found };
    if (!has("AFTER")) leaves[leaves.length - 1].tail = { tag: "Done", body: item.done };

    const height = tileHeight(doc, leaves, at === 0);

    leaves.forEach((leaf, page) => {
      const start = pieces.length;

      // Every item of work opens a page. It is a piece of work in its own
      // right, and reading one that starts halfway down under the last one's
      // after photographs is what this report is not for.
      if (page === 0) {
        pieces.push({
          height: HEAD_HEIGHT,
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
      }

      if (leaf.lead) pieces.push(notePiece(doc, leaf.lead));

      for (const grid of leaf.grids) {
        // The label, its explanation and every row of the grid go together:
        // the pages were worked out above, and this is what holds them to it.
        pieces.push({
          height: LABEL_HEIGHT,
          keepWith: (grid.note ? 1 : 0) + grid.rows,
          draw: (y) => {
            doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.inkSoft);
            doc.text(gridLabel(grid), MARGIN + 1, y + 2, {
              width: CONTENT,
              characterSpacing: 0.6,
            });
            doc.fillColor(COLOURS.ink);
          },
        });

        if (grid.note) pieces.push(notePiece(doc, grid.note));

        for (let row = 0; row < grid.rows; row += 1) {
          const inRow = grid.shots.slice(row * ACROSS, row * ACROSS + ACROSS);
          // A row short of three is centred rather than left with a hole in
          // the side of the page: a stage of one reads as one photograph
          // rather than as two that failed to load.
          const indent = ((ACROSS - inRow.length) * (TILE_WIDTH + TILE_GAP)) / 2;
          pieces.push({
            height: height + ROW_GAP,
            draw: (y) => {
              inRow.forEach((photo, column) => {
                const x = MARGIN + indent + column * (TILE_WIDTH + TILE_GAP);
                drawTile(doc, photo.bytes, x, y, TILE_WIDTH, height);
              });
            },
          });
        }
      }

      if (leaf.tail) pieces.push(notePiece(doc, leaf.tail));

      // The first piece of every page of the item starts that page, whatever
      // room is left on the one before.
      if (pieces.length > start) pieces[start].breakBefore = true;
    });
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
