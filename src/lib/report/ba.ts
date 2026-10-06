import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { personName } from "@/lib/contacts";
import { readUpload } from "@/lib/storage";
import {
  JOB_STAGES,
  STAGE_LABELS,
  isComplete,
  type JobKind,
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
import { COLOURS, CONTENT, MARGIN, PAGE, longDate, safe, shortDate } from "@/lib/report/theme";
import { clean, fromPlain, type RichText } from "@/lib/richText";
import { drawRich, measureRich, splitBlock } from "@/lib/report/richText";
import { preparedByFor } from "@/lib/profiles.server";

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
/** The least an item's heading takes, and a little air under the last row. */
const HEAD_HEIGHT = 26;
const TAIL_PAD = 6;
/** The heading's own measurements: the bar, the text and the room beside it. */
const HEAD_SIZE = 11.5;
const HEAD_INSET = 12;
const HEAD_ASIDE = 160;

type Photo = { stage: JobPhotoStage; bytes: Buffer };

type Item = {
  index: number;
  title: string;
  location: string;
  found: string;
  done: string;
  /** The job number on a rectification, where one was given. */
  number: string;
  /** How it was written: dot points, emphasis, and the line breaks typed. */
  foundRich: RichText;
  doneRich: RichText;
  photos: Photo[];
};

export type JobReport = PageMeta & {
  kind: JobKind;
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

/**
 * What was written, or the plain text read as if it had been.
 *
 * A description typed before there was anywhere to put emphasis is still a
 * description with paragraphs in it, and a line somebody opened with a dash is
 * still a dot point. Reading it that way means nothing written earlier comes
 * out as one long run-on paragraph.
 */
function richOr(stored: unknown, plain: string): RichText {
  const blocks = clean(stored);
  return blocks.length > 0 ? blocks : fromPlain(plain);
}

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
  const kind = (job.kind as JobKind) ?? "COMPLETED";
  const ready = job.items.filter((item) => isComplete(item, kind));
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
      // What was written, where it was; otherwise the plain text read as
      // paragraphs, so a description typed before there was anywhere to put
      // emphasis still comes out with its line breaks and its dashes as dot
      // points.
      foundRich: richOr(item.foundRich, item.found),
      doneRich: richOr(item.doneRich, item.done),
      number: safe(item.number?.trim() ?? ""),
      // Before, then during, then after — the order the story is told in.
      photos: photos.sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage)),
    });
  }

  return {
    kind,
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
    preparedBy: await preparedByFor(job.preparedBy),
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

  pending(doc, data);

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
  const proposed = data.kind === "RECTIFICATION";
  coverPage(doc, data, {
    title: proposed ? "Recommended Rectifications Report" : "Works Completed Report",
    eyebrow: proposed ? "Recommended rectifications" : "Before and after record",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: proposed ? "Inspected" : "Work carried out",
    date: data.jobDate,
    scopeLabel: proposed ? "Rectifications recommended" : "Work carried out",
    scopeList: listed,
    // What a reader pulling the text out of the file gets, and what is drawn
    // where there is no work on the report to list.
    scope: listed.length
      ? listed.join(", ")
      : proposed
        ? "Recommended electrical rectification works"
        : "Electrical maintenance works",
    rows: [
      // What the report is called, where it has been given a name. A client
      // filing three of these in a month needs the name to tell them apart,
      // and the date is in the row beneath it either way.
      ...(data.jobTitle && data.jobTitle !== shortDate(data.jobDate)
        ? ([["Report", data.jobTitle]] as [string, string][])
        : []),
      ["Site contact", data.contactName ?? data.clientName],
      ["Report date", shortDate(data.reportDate)],
      [proposed ? "Jobs recommended" : "Items of work", `${listed.length}`],
      [
        proposed ? "Prepared by" : "Works carried out by",
        `${THERMOGRAPHER.name} · Qualified Supervisor ${COMPANY.supervisor}`,
      ],
    ],
    note: proposed
      ? "This report is issued to the addressee named above and sets out the work we recommend carrying out at " +
        "the site listed on it. Every photograph in it was taken on site and shows the equipment as it stands. " +
        "It is a recommendation accompanied by a quotation; no work described in it has been carried out."
      : "This report is issued to the addressee named above and relates only to the site and the work listed on it. " +
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
  const proposed = data.kind === "RECTIFICATION";
  doc.addPage();
  sectionBar(doc, proposed ? "Summary of Recommendations" : "Summary of Works", MARGIN);

  const where = data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName;
  const count = data.items.length;
  const photos = data.items.reduce((total, item) => total + item.photos.length, 0);

  // The same shape of sentence either way, in the tense the report is in: one
  // says what was done, the other says what we are proposing to do.
  const opening = proposed
    ? `The following work is recommended for ${data.clientName} at ${where}, from an attendance on ${longDate(
        data.jobDate,
      )}. ${
        count === 1 ? "One job is recommended" : `${count} jobs are recommended`
      }, photographed as the equipment stands — ${photos} ${
        photos === 1 ? "photograph" : "photographs"
      } in all. None of it has been carried out.`
    : `The following works were carried out for ${data.clientName} at ${where} on ${longDate(
        data.jobDate,
      )}. ${
        count === 1 ? "One item of work was completed" : `${count} items of work were completed`
      }, photographed as found and as left — ${photos} ${
        photos === 1 ? "photograph" : "photographs"
      } in all.`;

  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.ink);
  doc.text(
    `${opening}${
      // A piece of work saved but not yet written up is left off rather than
      // printed half-finished, and the report says so rather than quietly
      // being shorter than the day was.
      data.unfinished === 0
        ? ""
        : data.unfinished === 1
          ? ` A further ${proposed ? "job" : "item of work"} has been recorded but not yet written up, and is not included here.`
          : ` A further ${data.unfinished} ${proposed ? "jobs have" : "items of work have"} been recorded but not yet written up, and are not included here.`
    }`,
    MARGIN,
    MARGIN + 46,
    { width: CONTENT, lineGap: 2.5 },
  );

  let y = doc.y + 22;
  // A recommendation has a job number where a works record has a place, and it
  // is a short thing, so the heading it leaves behind goes to the job name.
  const second = proposed ? 76 : CONTENT - 178 - 150 - 44;
  const first = proposed ? CONTENT - second - 150 - 44 : 178;
  const columns = [first, second, 150, 44];
  tableHead(
    doc,
    y,
    proposed ? ["Job", "Job no.", "What it needs", "Page"] : ["Work", "Location", "What was done", "Page"],
    columns,
  );
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
    doc.text(proposed ? item.number : item.location, MARGIN + columns[0] + 8, y + 7, {
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
 * The well a photograph sits in, and how many go across a page.
 *
 * These are phone photographs held upright — nine wide to sixteen tall — so
 * the well is that shape and a photograph fills it corner to corner instead of
 * standing as a stamp in the middle of a short landscape box with white down
 * both sides. That was the old shape, and with three rows forced onto a page
 * it squeezed every well to about 110pt tall: nine photographs in the top half
 * of a page, each too small to show what it was taken to show.
 *
 * Two rows of an upright well fill a page, so two is what a page takes.
 */
const RATIO = 16 / 9;
const MAX_ACROSS = 3;

/**
 * How many go across, for one item of work.
 *
 * Three where there are enough to need three. Fewer where there are not: a
 * report with one rectification on it and two photographs should not print
 * them at the size it would print nine, leaving two thirds of the page white.
 * One photograph on its own gets the page to itself.
 *
 * Decided once per item rather than per stage, so a before of nine and an
 * after of one are photographed at one size and read as one record.
 */
function acrossFor(counts: number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 1) return 1;
  return Math.min(MAX_ACROSS, Math.max(2, ...counts));
}

/**
 * What else has to fit on the page a photograph first lands on.
 *
 * The section bar, the item's heading, the stage's label, a line or two of
 * explanation, and the gaps around them. Reserved so that a report with one
 * photograph on it does not print the heading on one page and the photograph
 * on the next with both pages mostly white — which is what happens when the
 * well is sized to the page and then will not share it with anything.
 */
const FIRST_PAGE_FURNITURE = HEAD_HEIGHT + LABEL_HEIGHT + 40 + ROW_GAP + TAIL_PAD;

/**
 * The well's width and height at a given number across, as large as fits.
 *
 * Width first, because three across a page is what sets it in the ordinary
 * case. Height has the last word only where one or two across would otherwise
 * make a well taller than the page it has to share.
 */
function wellFor(across: number): { width: number; height: number } {
  const byWidth = (CONTENT - TILE_GAP * (across - 1)) / across;
  const room = pageRoom(true) - FIRST_PAGE_FURNITURE;
  const width = Math.min(byWidth, room / RATIO);
  return { width, height: width * RATIO };
}

/** The OptiLink blue a photograph is framed in. */
const FRAME = 2;

/**
 * A photo in its well: contained, centred, never cropped, framed in blue.
 *
 * The frame is drawn after the photograph rather than before, so that a
 * picture filling its well to the edge sits inside the line instead of over
 * the top of it.
 */
function drawTile(doc: Doc, bytes: Buffer, x: number, y: number, width: number, height: number) {
  doc.save();
  doc.rect(x, y, width, height).fill(COLOURS.well);
  doc.image(bytes, x + FRAME, y + FRAME, {
    fit: [width - FRAME * 2, height - FRAME * 2],
    align: "center",
    valign: "center",
  });
  doc
    .rect(x + FRAME / 2, y + FRAME / 2, width - FRAME, height - FRAME)
    .lineWidth(FRAME)
    .stroke(COLOURS.accent);
  doc.restore();
}

/* --- how an item's photographs fall onto pages ---------------------------- */

/** A line of explanation that belongs to a particular stage's photographs. */
type Note = { tag: string; body: RichText };

/** One stage's photographs, with the line that explains them. */
type Grid = {
  stage: JobPhotoStage;
  shots: Photo[];
  /** How many the stage holds, for the label over the first of them. */
  total: number;
  /** What was found, or what was done — whichever this stage is showing. */
  note: Note | null;
};

/**
 * How tall an item's heading is.
 *
 * A title is not cut off with an ellipsis: "Emergency light battery replaced
 * and the fitting rewired at the rear of the workshop" is what the work was,
 * and a client reading the report should get all of it. So the heading is
 * measured at the size it is drawn and grows to hold however many lines it
 * takes, which also keeps it from running into the photographs below.
 */
function headHeight(doc: Doc, item: Item): number {
  const text = headText(item);
  const lines = measureText(doc, text, {
    width: CONTENT - HEAD_ASIDE,
    size: HEAD_SIZE,
    font: "Helvetica-Bold",
    lineGap: 1,
  });
  return Math.max(HEAD_HEIGHT, Math.ceil(lines) + 12);
}

/** "1.  Meal room GPO replaced" — the number stays with its title. */
function headText(item: Item): string {
  return `${item.index}.  ${item.title}`;
}

const NOTE_INDENT = 46;
const NOTE_WIDTH = CONTENT - NOTE_INDENT;
const NOTE_SHAPE = { size: 9.5, lineGap: 1, gap: 3 } as const;

/**
 * A written explanation, as one piece per paragraph so it can flow.
 *
 * Measured as a single piece, a long description asks for more room than any
 * page has. The engine turns the page, finds it still does not fit, and leaves
 * a page holding a title and nothing else, then another holding one line —
 * which is how a works report came out with two near-empty pages and a wall of
 * text running through the footer of the third.
 *
 * A paragraph at a time, it flows: whatever fits goes on this page and the
 * rest starts the next. A paragraph longer than a whole page is cut at a word
 * boundary first, so nothing can be left with nowhere to go.
 */
function notePieces(doc: Doc, note: Note): Piece[] {
  const limit = pageRoom(false) - TAIL_PAD;
  const blocks = note.body.flatMap((block) =>
    splitBlock(doc, block, NOTE_WIDTH, limit, NOTE_SHAPE),
  );
  if (blocks.length === 0) return [];

  return blocks.map((block, at) => ({
    // The tag sits beside the first line, so that piece keeps the next with it
    // rather than standing alone at the foot of a page.
    height: measureRich(doc, [block], NOTE_WIDTH, NOTE_SHAPE) + (at === blocks.length - 1 ? 5 : 0),
    keepWith: at === 0 && blocks.length > 1 ? 1 : 0,
    draw: (y: number) => {
      if (at === 0) {
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLOURS.accent);
        doc.text(note.tag.toUpperCase(), MARGIN + 12, y + 1, { width: 34 });
      }
      drawRich(doc, [block], MARGIN + NOTE_INDENT, y, NOTE_WIDTH, NOTE_SHAPE);
    },
  }));
}

/** "BEFORE · 7" — the label over a stage's photographs. */
function gridLabel(grid: Grid, kind: JobKind, carried = false): string {
  // Nothing has been done on a rectification, so there is no before and after
  // to speak of: the photographs are of the job as it stands.
  const name =
    kind === "RECTIFICATION" ? "THE JOB" : STAGE_LABELS[grid.stage].toUpperCase();
  if (carried) return `${name}  ·  CONTINUED`;
  return grid.total > 1 ? `${name}  ·  ${grid.total}` : name;
}

/** The label piece itself, drawn the same whether it is the first or a repeat. */
function labelPiece(doc: Doc, text: string, keepWith: number): Piece {
  return {
    height: LABEL_HEIGHT,
    keepWith,
    draw: (y: number) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOURS.inkSoft);
      doc.text(text, MARGIN + 1, y + 2, { width: CONTENT, characterSpacing: 0.6 });
      doc.fillColor(COLOURS.ink);
    },
  };
}

/* --- the work ------------------------------------------------------------- */

function work(doc: Doc, data: JobReport): Section {
  const pieces: Piece[] = [];
  /*
   * What to write again when a page opens part way through a stage.
   *
   * A stage's photographs are no longer dealt into fixed pagefuls — the rows
   * flow, so a stage of sixteen runs over as many pages as it needs. A page
   * that opens on the middle of one would otherwise show photographs with
   * nothing saying what they are of, so the label comes again marked
   * CONTINUED, keyed by the tag its rows carry.
   */
  const carried = new Map<string, string>();

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
    return {
    id: "work",
    title: data.kind === "RECTIFICATION" ? "Recommended Rectifications" : "The Work",
    pieces,
  };
  }

  for (const item of data.items) {
    const grids = JOB_STAGES.flatMap((stage) => {
      const shots = item.photos.filter((photo) => photo.stage === stage);
      if (shots.length === 0) return [];
      // What was found is what the before photographs are showing, and what
      // was done is what the after ones are showing. Each rides above its own
      // stage rather than both sitting at the top of the item away from the
      // photographs they are explaining.
      const note =
        data.kind === "RECTIFICATION"
          ? stage === "BEFORE"
            ? { tag: "Scope", body: item.doneRich }
            : null
          : stage === "BEFORE"
            ? { tag: "Found", body: item.foundRich }
            : stage === "AFTER"
              ? { tag: "Done", body: item.doneRich }
              : null;
      return [{ stage, shots, total: shots.length, note }];
    });

    // A line with no photographs of its own to sit above still has to be said:
    // above everything where nothing was photographed as found, and under the
    // last of them where nothing was photographed as left.
    const has = (stage: JobPhotoStage) => grids.some((grid) => grid.stage === stage);
    const lead: Note | null =
      data.kind === "RECTIFICATION"
        ? has("BEFORE")
          ? null
          : { tag: "Scope", body: item.doneRich }
        : has("BEFORE")
          ? null
          : { tag: "Found", body: item.foundRich };
    const tail: Note | null =
      data.kind === "RECTIFICATION" || has("AFTER")
        ? null
        : { tag: "Done", body: item.doneRich };

    const across = acrossFor(grids.map((grid) => grid.shots.length));
    const well = wellFor(across);
    const head = headHeight(doc, item);
    const start = pieces.length;

    // Every item of work opens a page. It is a piece of work in its own right,
    // and reading one that starts halfway down under the last one's after
    // photographs is what this report is not for.
    pieces.push({
      height: head,
      // The heading brings the label and the first line of the explanation
      // with it, so it is never left standing alone at the top of a page.
      keepWith: 2,
      breakBefore: true,
      mark: `item:${item.index}`,
      draw: (y) => {
        // The rule beside the heading runs its whole height, so a title that
        // takes two lines is marked down both of them.
        doc.rect(MARGIN, y + 1, 3, head - 10).fill(COLOURS.accent);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(HEAD_SIZE);
        doc.text(headText(item), MARGIN + HEAD_INSET, y, {
          width: CONTENT - HEAD_ASIDE,
          lineGap: 1,
        });
        doc
          .font("Helvetica")
          .fontSize(9.5)
          .fillColor(COLOURS.inkSoft)
          .text(
            data.kind === "RECTIFICATION"
              ? item.number
                ? `Job ${item.number}`
                : item.location
              : item.location,
            MARGIN + CONTENT - 150,
            y + 2,
            { width: 150, align: "right" },
          );
      },
    });

    if (lead) pieces.push(...notePieces(doc, lead));

    for (const [index, grid] of grids.entries()) {
      const rows = Math.ceil(grid.shots.length / across);
      const label = gridLabel(grid, data.kind);

      // The label brings its explanation and its first row of photographs with
      // it; a label alone at the foot of a page says nothing.
      pieces.push(labelPiece(doc, label, grid.note ? 2 : 1));
      if (grid.note) pieces.push(...notePieces(doc, grid.note));

      for (let row = 0; row < rows; row += 1) {
        const inRow = grid.shots.slice(row * across, row * across + across);
        // A row short of its full width is centred rather than left with a
        // hole in the side of the page: a stage of one reads as one
        // photograph rather than as two that failed to load.
        const indent = ((across - inRow.length) * (well.width + TILE_GAP)) / 2;
        /*
         * A page opening on this row says what the photographs are of.
         *
         * The first row says the label plainly — the label itself is then up
         * on the page before, above the explanation. Any row after it says
         * CONTINUED, because photographs of that stage have already been
         * shown and these are the rest of them.
         */
        const tag = `grid:${item.index}:${index}:${row}`;
        carried.set(tag, row === 0 ? label : gridLabel(grid, data.kind, true));
        pieces.push({
          height: well.height + ROW_GAP,
          tag,
          draw: (y) => {
            inRow.forEach((photo, column) => {
              const x = MARGIN + indent + column * (well.width + TILE_GAP);
              drawTile(doc, photo.bytes, x, y, well.width, well.height);
            });
          },
        });
      }
    }

    if (tail) pieces.push(...notePieces(doc, tail));
    if (pieces.length > start) pieces[start].breakBefore = true;
  }

  return {
    id: "work",
    title: data.kind === "RECTIFICATION" ? "Recommended Rectifications" : "The Work",
    pieces,
    repeat: (next) => {
      const label = next.tag ? carried.get(next.tag) : undefined;
      return label ? labelPiece(doc, label, 1) : null;
    },
  };
}

/* --- signing it off ------------------------------------------------------- */

function closing(doc: Doc, data: JobReport): Section {
  const pieces: Piece[] = [];

  const opener = safe(
    data.kind === "RECTIFICATION"
      ? "The work set out in this report is recommended rather than carried out. Each job is listed with photographs of how the equipment stands and what we propose doing about it, and is priced in the quotation issued alongside this report. Nothing in it has been attended to yet."
      : "The works listed in this report have been completed and left in a safe and serviceable condition. All work has been carried out in accordance with AS/NZS 3000 and tested on completion.",
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
      data.kind === "RECTIFICATION"
        ? "The following was also noted on site. It is not covered by the quotation issued with this report."
        : "The following was noted during the works but fell outside the agreed scope. We would recommend it is attended to.",
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

  return {
    id: "closing",
    title: data.kind === "RECTIFICATION" ? "Acceptance" : "Completion",
    pieces,
  };
}

/**
 * The page a rectification report ends on.
 *
 * A whole page, because what it says is the whole point of the document: the
 * work in it has not been done, and nothing in it becomes a works completed
 * report until the quotation beside it is accepted. A line of small print at
 * the foot of the last page would be read as boilerplate; a page that says
 * nothing else cannot be.
 */
function pending(doc: Doc, data: JobReport) {
  if (data.kind !== "RECTIFICATION") return;

  doc.addPage();

  const text = "WORKS COMPLETED REPORT PENDING VIA ACCEPTANCE OF QUOTATION";
  const width = CONTENT - 60;
  doc.font("Helvetica-Bold").fontSize(26);
  const height = doc.heightOfString(text, { width, align: "center", lineGap: 6 });
  const top = (PAGE.height - height) / 2 - 30;

  doc.rect(MARGIN, top - 54, CONTENT, height + 108).fill(COLOURS.soft);
  doc.rect(MARGIN, top - 54, CONTENT, 6).fill(COLOURS.bar);
  doc.rect(MARGIN, top + height + 48, CONTENT, 6).fill(COLOURS.bar);

  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(26);
  doc.text(text, MARGIN + 30, top, { width, align: "center", lineGap: 6, characterSpacing: 0.4 });

  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      "The work set out in this report has not been carried out. On acceptance of the quotation issued with it, " +
        "the work will be scheduled and a works completed report will follow, with photographs of the work as it " +
        "was found and as it was left.",
    ),
    MARGIN + 70,
    top + height + 78,
    { width: CONTENT - 140, align: "center", lineGap: 2 },
  );

  footer(doc, data);
}
