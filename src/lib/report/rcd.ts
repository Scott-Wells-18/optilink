import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { readInstrument, type Instrument } from "@/lib/report/instrument";
import { expiry } from "@/lib/report/calibration";
import {
  fitted,
  readCertificate,
  stampCertificate,
  type Box,
  type Certificate,
  type Slot,
} from "@/lib/report/certificate";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { COMPANY } from "@/lib/company";
import { showReading, type Verdict } from "@/lib/rcd/assess";
import { loadTuning } from "@/lib/rcd/settings";
import { CHECKLIST } from "@/lib/rcd/checklist";
import { normaliseWalk } from "@/lib/rcd/map";
import { namesMatch } from "@/lib/rcd/names";
import {
  CORRECTIONS_NOTE,
  CRITERIA_NOTE,
  CRITERIA_STANDARDS_NOTE,
  IN_NEW_SOUTH_WALES,
  LIMITATIONS,
  NOT_TESTED_NOTE,
  THIRTY_MA_CRITERIA,
  WHAT_IS_AN_RCD,
  WHAT_WAS_DONE,
  instrumentPassage,
  verdictPassages,
  type Passage,
} from "@/lib/rcd/explain";
import type { Reading } from "@/lib/rcd/parse";
import type { RcdLimits } from "@/lib/standards/rcd";
import {
  chip,
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
import {
  COLOURS,
  CONTENT,
  MARGIN,
  PAGE,
  SEVERITY,
  longDate,
  safe,
  shortDate,
} from "@/lib/report/theme";
import { reportSignature } from "@/lib/signatures";

/**
 * The RCD test report.
 *
 * The client reads two things: did anything fail, and where do I look. So the
 * second page is a contents page that sends them straight to the failures, the
 * concerns and then the passes; the results themselves are grouped the same
 * way, worst first.
 *
 * The instrument's own export is bound in at the back, unaltered, and attached
 * to the file as well — so if a reading is ever disputed, the original is
 * there to be produced.
 */

export type RcdResultRow = {
  /**
   * The way on the board this reading came off, where it was matched to one.
   * The three phases of a three-phase device all carry the same slot, which
   * is how a count of devices is told apart from a count of readings.
   */
  slot: string | null;
  /** The device, named for every way it occupies: "CB-1,3,5,7 (Welder)". */
  label: string;
  /**
   * Which phase this record is, on a device that takes three of them. Shown
   * beside the device rather than written into its name, so all three rows
   * name the same device.
   */
  phase: string | null;
  ratingMa: number | null;
  kindLabel: string;
  half: Reading;
  rated: Reading;
  five: Reading;
  /**
   * Each test at both points on the waveform, as the instrument took them.
   * The three above are the slower of each pair, which is what the verdict is
   * assessed on; these are what the reader is shown.
   */
  angles: [Reading, Reading, Reading, Reading, Reading, Reading];
  touchVolts: number | null;
  verdict: Verdict;
  reasons: string[];
};


/**
 * One switchboard, tested.
 *
 * Everything in here is a fact about that board: its own readings, its own
 * walk, its own corrections, its own instrument export. A visit that took in
 * three boards carries three of these, and the report sets each out under its
 * own name rather than running them together.
 */
export type BoardTest = {
  boardName: string;
  testDate: Date;
  results: RcdResultRow[];
  corrections: {
    droppedEmpty: string[];
    droppedDuplicate: string[];
    untested: string[];
    walk: string;
  };
  checklist: { question: string; answer: string }[];
  /** The instrument's own export for this board, and its page sizes. */
  original: Buffer | null;
  originalPages: Certificate | null;
};

export type RcdReport = PageMeta & {
  reportDate: Date;
  contactName: string | null;
  /** The instrument, named for the report rather than for any one board. */
  instrument: string | null;
  /** Our own gear, where one was chosen: for the Equipment Used pages. */
  gear: Instrument | null;
  boards: BoardTest[];
  limits: { kindLabel: string; limits: RcdLimits }[];
  concernPercent: number;
};

/* --- gathering ------------------------------------------------------------ */

export async function loadRcdReport(reportId: string): Promise<RcdReport | null> {
  const report = await prisma.rcdReport.findUnique({
    where: { id: reportId },
    include: {
      instrument: { include: { certFile: true, photoFile: true } },
      site: {
        include: {
          client: { select: { name: true } },
          contacts: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
      tests: {
        orderBy: { createdAt: "asc" },
        include: {
          equipment: { select: { name: true } },
          sourceFile: true,
          results: { orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!report) return null;

  const tuning = await loadTuning();
  const boards: BoardTest[] = [];
  // The instrument's own name for itself, off whichever board's export gives
  // one: it is the same machine across a visit.
  let named: string | null = null;

  for (const run of report.tests) {
    const parsed = (run.parsed ?? {}) as {
      company?: string | null;
      siteName?: string | null;
      boardName?: string | null;
    };
    if (!named && parsed.company) named = safe(parsed.company);

    const identity = resolveIdentity(parsed, {
      siteName: report.site.name,
      siteLocation: report.site.location,
      boardName: run.equipment?.name ?? "Switchboard",
    });
    const corrections = (run.corrections ?? {}) as {
      droppedEmpty?: string[];
      droppedDuplicate?: string[];
      untested?: string[];
      walk?: unknown;
    };
    const checklist = (run.checklist ?? {}) as Record<string, boolean | string>;
    const original = run.sourceFile ? await fileBytes(run.sourceFile.storedName) : null;

    boards.push({
      boardName: safe(identity.boardName),
      testDate: run.date,
      results: run.results.map((result) => ({
        slot: result.slot,
        label: safe(result.label),
        phase: result.phase ? safe(result.phase) : null,
        ratingMa: result.ratingMa,
        kindLabel: result.kind ? tuning.limits[result.kind].kindLabel : "—",
        half: pick(result.halfAt0, result.halfAt180),
        rated: pick(result.ratedAt0, result.ratedAt180),
        five: pick(result.fiveAt0, result.fiveAt180),
        angles: [
          one(result.halfAt0),
          one(result.halfAt180),
          one(result.ratedAt0),
          one(result.ratedAt180),
          one(result.fiveAt0),
          one(result.fiveAt180),
        ],
        touchVolts: result.touchVolts,
        verdict: result.verdict as Verdict,
        reasons: result.reasons.map(safe),
      })),
      corrections: {
        droppedEmpty: (corrections.droppedEmpty ?? []).map(safe),
        droppedDuplicate: (corrections.droppedDuplicate ?? []).map(safe),
        untested: (corrections.untested ?? []).map(safe),
        walk: describeWalk(corrections.walk),
      },
      checklist: CHECKLIST.map((item) => ({
        question: item.question,
        answer: safe(answerFor(checklist[item.key])),
      })),
      original,
      originalPages: original ? await readCertificate(original) : null,
    });
  }

  const first = report.tests[0];
  const identity = resolveIdentity(
    (first?.parsed ?? {}) as { siteName?: string | null; boardName?: string | null },
    {
      siteName: report.site.name,
      siteLocation: report.site.location,
      boardName: first?.equipment?.name ?? "Switchboard",
    },
  );
  const gear = await readInstrument(report.instrument);

  return {
    clientName: safe(report.site.client.name),
    siteName: safe(identity.siteName),
    siteLocation: identity.siteLocation ? safe(identity.siteLocation) : null,
    contactName: report.site.contacts[0] ? safe(report.site.contacts[0].name) : null,
    reportDate: new Date(),
    instrument: gear?.name ?? named,
    gear,
    boards,
    limits: Object.values(tuning.limits).map((limits) => ({
      kindLabel: limits.kindLabel,
      limits,
    })),
    concernPercent: tuning.concernPercent,
    logo: await brandBytes("logo.jpg"),
    signature: await reportSignature(),
  };
}

/** A single reading, with a refusal to trip called what it is. */
function one(value: number | null): Reading {
  if (value === null) return null;
  return value >= 2000 ? "NO_TRIP" : value;
}

/** The worse of the two phases — a device has to pass on both. */
function pick(a: number | null, b: number | null): Reading {
  const values = [a, b].filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const worst = Math.max(...values);
  return worst >= 2000 ? "NO_TRIP" : worst;
}

function describeWalk(value: unknown): string {
  const walk = normaliseWalk(value);
  const grid =
    walk.order === "ROWS"
      ? "Across each row, then down"
      : "Down each column in turn";
  const extras = walk.extrasFirst
    ? "additional RCDs first"
    : "additional RCDs after the grid";
  return `${grid}, left to right, ${extras}`;
}

type Names = { siteName: string; siteLocation: string | null; boardName: string };

/**
 * Whose names the report carries.
 *
 * Normally the record's, which is also the instrument's, spelled properly. But
 * if the export names a different site or a different board, the export wins
 * outright and without comment: these readings came off whatever the
 * instrument was standing in front of, and a report that labels them with the
 * board they were filed against is a report that says something untrue.
 *
 * The operator is told at the time, in the wizard, where they can still change
 * what it is filed against. By the time a report is being drawn that decision
 * is made, and the report has no business arguing with itself in front of the
 * client.
 *
 * The location belongs to the record's site, so once the site is in doubt the
 * location is dropped rather than carried over onto somewhere else.
 */
function resolveIdentity(
  parsed: { siteName?: string | null; boardName?: string | null },
  record: Names,
): Names {
  const exportSite = parsed.siteName?.trim() || null;
  const exportBoard = parsed.boardName?.trim() || null;

  const siteDiffers = exportSite !== null && !namesMatch(exportSite, record.siteName);
  const boardDiffers = exportBoard !== null && !namesMatch(exportBoard, record.boardName);

  if (!siteDiffers && !boardDiffers) return record;

  return {
    siteName: exportSite ?? record.siteName,
    siteLocation: null,
    boardName: exportBoard ?? record.boardName,
  };
}

function answerFor(value: boolean | string | undefined): string {
  if (typeof value === "string") return value.trim() || "—";
  return value ? "Yes" : "No";
}

async function fileBytes(storedName: string): Promise<Buffer | null> {
  try {
    return await readUpload(storedName);
  } catch {
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

const GROUPS: { verdict: Verdict; title: string; blurb: string; empty: string }[] = [
  {
    verdict: "FAIL",
    title: "Failed",
    blurb: "Did not satisfy the acceptance criteria applied to the test.",
    empty: "No device failed. Nothing in this section needs acting on.",
  },
  {
    verdict: "CONCERN",
    title: "Concerns",
    blurb: "Passed, but recorded close to the applicable limit.",
    empty: "No device recorded close enough to its limit to raise.",
  },
  {
    verdict: "PASS",
    title: "Passed",
    blurb: "Satisfied every criterion applied on the date of testing.",
    empty: "No device passed on this run.",
  },
];

/** Cover and contents are drawn by hand; the sections follow. */
/**
 * The first page a flowed section can land on, where the contents runs to a
 * single page. A longer contents pushes it down, which `buildRcdReport` works
 * out before anything is packed.
 */
const FIRST_SECTION_PAGE = 3;

const ROW_HEIGHT = 22;
const TABLE_HEAD = 20;

/**
 * The results grid: a column for every reading the instrument took.
 *
 * Wider on the circuit than the instrument's own layout, because a circuit
 * here is named for its way and its label — "CB-4 (Kitchen GPOs)" — rather
 * than by the instrument's "S_4".
 */
const RESULT_COLUMNS = [140, 46, 44, 50, 40, 46, 40, 46];
const RESULT_TITLES = [
  "Circuit",
  "Rating",
  "x1/2 0\u00b0",
  "x1/2 180\u00b0",
  "x1 0\u00b0",
  "x1 180\u00b0",
  "x5 0\u00b0",
  "x5 180\u00b0",
];
/** The touch voltage takes whatever the eight columns above leave. */
const TOUCH_WIDTH = CONTENT - RESULT_COLUMNS.reduce((total, width) => total + width, 0);

export async function buildRcdReport(data: RcdReport): Promise<Buffer> {
  const { doc, done } = newDocument();

  // How long the contents runs has to be known before anything is packed: a
  // visit with six boards lists more than fits on one page, and every page
  // number after it would otherwise be one out.
  const listed = 2 + data.boards.length * 2 + data.boards.filter(hasOriginal).length + 1;
  const contentsPages = Math.max(1, Math.ceil(listed / ENTRIES_PER_PAGE));

  // Everything after the contents is measured and packed first, so the page
  // numbers the contents prints are the pages things actually landed on.
  const laid = layout(sections(doc, data), 2 + contentsPages + 1);

  // The pages carrying other people's documents come after the flowed
  // sections, and their numbers are worked out the same way.
  const placed = placement(data, 2 + contentsPages + laid.count);

  cover(doc, data);
  contents(doc, data, laid, placed);
  render(doc, data, laid);

  // The pages that carry other people's documents — each board's instrument
  // export, and the instrument's calibration certificate — are drawn after
  // the flowed sections, because they are placed rather than flowed.
  const originals = originalPages(doc, data);
  const certificate = equipmentPages(doc, data);

  stampPageNumbers(doc, 0);
  doc.end();

  let out = await done;
  for (const { board, slots } of originals) {
    if (board.originalPages) {
      out = await stampCertificate(out, board.originalPages, slots);
    }
  }
  if (data.gear?.certificate && certificate.length > 0) {
    out = await stampCertificate(out, data.gear.certificate, certificate);
  }

  return attachOriginals(out, data);
}

/** Every section of the report, in the order it is read. */
function sections(doc: Doc, data: RcdReport): Section[] {
  const out: Section[] = [definitions(doc, data), basis(doc, data)];

  // Each board gets its own results and its own corrections, under its own
  // name: a visit that took in three boards is three sets of readings, and
  // running them together would lose which reading belongs to which board.
  data.boards.forEach((board, index) => {
    out.push(results(doc, data, board, index));
    out.push(corrections(doc, data, board, index));
  });

  return out;
}

/** Each board's own key into the laid-out page numbers. */
function boardKey(prefix: string, index: number): string {
  return `${prefix}:${index}`;
}

/** Contents rows that fit on a page of contents. */
const ENTRIES_PER_PAGE = 13;

function hasOriginal(board: BoardTest): boolean {
  return (board.originalPages?.sizes.length ?? 0) > 0;
}

/** How many pages of ours one borrowed document takes. */
function sheetsFor(pages: number): number {
  return Math.ceil(pages / PER_PAGE);
}

/**
 * Where the placed pages land.
 *
 * They are drawn after everything that flows, so their numbers are simply
 * counted on from the end of the flowed sections — each board's instrument
 * record in turn, then the equipment page.
 */
function placement(
  data: RcdReport,
  from: number,
): { originals: (number | null)[]; equipment: number | null } {
  let at = from;
  const originals = data.boards.map((board) => {
    const pages = board.originalPages?.sizes.length ?? 0;
    if (pages === 0) return null;
    const start = at;
    at += sheetsFor(pages);
    return start;
  });
  return { originals, equipment: data.gear ? at : null };
}

/* --- the cover and the contents ------------------------------------------- */

/** Every reading on every board, for the counts the cover and contents carry. */
function everyResult(data: RcdReport): RcdResultRow[] {
  return data.boards.flatMap((board) => board.results);
}

/**
 * How many devices a set of readings came off.
 *
 * A three-phase device is tested on each phase in turn and so puts three
 * readings on the report, all naming the same device. Counting the rows would
 * say three devices where there is one, so the ways they sit on are counted
 * instead. A reading the board could not account for stands on its own.
 */
function deviceCount(results: RcdResultRow[]): number {
  const seen = new Set<string>();
  let loose = 0;
  for (const result of results) {
    if (result.slot) seen.add(result.slot);
    else loose += 1;
  }
  return seen.size + loose;
}

/** "3 devices", for the narrow count column in the contents. */
function testedCount(results: RcdResultRow[]): string {
  const devices = deviceCount(results);
  return `${devices} ${devices === 1 ? "device" : "devices"}`;
}

/** The same two numbers, said as a sentence for the cover. */
function testedSentence(results: RcdResultRow[]): string {
  const devices = deviceCount(results);
  const said = `${devices} ${devices === 1 ? "device" : "devices"} tested`;
  return devices === results.length
    ? said
    : `${said} over ${results.length} readings`;
}

function cover(doc: Doc, data: RcdReport) {
  const all = everyResult(data);
  const failed = all.filter((result) => result.verdict === "FAIL").length;
  const boards = data.boards.length;
  const tested = data.boards.map((board) => board.boardName).join(", ");
  // The visit's date is the earliest board's, since that is the day the work
  // started; a visit that ran over two days says so on each board's own page.
  const testDate =
    data.boards.reduce<Date | null>(
      (held, board) => (!held || board.testDate < held ? board.testDate : held),
      null,
    ) ?? data.reportDate;

  coverPage(doc, data, {
    title: "Residual Current Device Test Report",
    eyebrow: "RCD testing",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: "Test date",
    date: testDate,
    scopeLabel: "Tested on this visit",
    scope: `${tested || "—"} — ${boards} ${
      boards === 1 ? "switchboard" : "switchboards"
    }, ${testedSentence(all)}${failed ? `, ${failed} failed` : ""}`,
    rows: [
      ["Site contact", data.contactName ?? data.clientName],
      ["Report date", shortDate(data.reportDate)],
      [boards === 1 ? "Switchboard" : "Switchboards", tested || "—"],
      ["Instrument", data.instrument ?? "—"],
      ["Tested by", `${COMPANY.name} · Lic ${COMPANY.licence}`],
    ],
    note:
      "This report is issued to the addressee named above and relates only to the switchboards and devices listed " +
      "on it. Testing was carried out with a calibrated instrument and assessed against the criteria set out " +
      "inside. It records how each device performed on the day of testing; it is not a warranty of future " +
      "performance.",
    marks: [],
  });
}

/** One row of the contents: what it is, how much of it there is, and where. */
type Entry = { title: string; note: string; count: string; page: string; tone: string };

function contents(
  doc: Doc,
  data: RcdReport,
  laid: Layout,
  placed: { originals: (number | null)[]; equipment: number | null },
) {
  doc.addPage();
  sectionBar(doc, "Contents", MARGIN);

  const where = data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName;
  const boards = data.boards.length;
  const earliest =
    data.boards.reduce<Date | null>(
      (held, board) => (!held || board.testDate < held ? board.testDate : held),
      null,
    ) ?? data.reportDate;

  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.ink);
  doc.text(
    safe(
      `Residual current devices on ${boards} ${
        boards === 1 ? "switchboard" : "switchboards"
      } at ${where} were tested on ${longDate(earliest)} for ${
        data.clientName
      }. Each device was tested at half, one and five times its rated residual current, in both polarities.${
        everyResult(data).some((result) => result.phase)
          ? " A three-phase device was tested on each of its phases in turn and so is listed once for each, under the same circuit reference."
          : ""
      }`,
    ),
    MARGIN,
    MARGIN + 46,
    { width: CONTENT, lineGap: 2.5 },
  );

  const entries: Entry[] = [
    {
      title: "Definitions",
      note: "What an RCD does, what was tested, and what each verdict means.",
      count: "",
      page: String(laid.pageOf.definitions),
      tone: COLOURS.accent,
    },
    {
      title: "Basis of assessment",
      note: "The criteria every reading was judged against, and their source.",
      count: "",
      page: String(laid.pageOf.basis),
      tone: COLOURS.accent,
    },
  ];

  // A board at a time, so the reader can go straight to the board they care
  // about rather than to a verdict that spans all of them.
  data.boards.forEach((board, index) => {
    const failed = board.results.filter((result) => result.verdict === "FAIL").length;
    const concerns = board.results.filter((result) => result.verdict === "CONCERN").length;
    entries.push({
      title: `${board.boardName} — results`,
      note: `${
        failed
          ? `${failed} failed, ${concerns} raised as a concern.`
          : concerns
            ? `Nothing failed; ${concerns} raised as a concern.`
            : "Every device satisfied the criteria applied."
      }${
        deviceCount(board.results) === board.results.length
          ? ""
          : ` ${board.results.length} readings in all.`
      }`,
      count: testedCount(board.results),
      page: String(laid.pageOf[boardKey("results", index)] ?? "—"),
      tone: failed
        ? toneFor("FAIL").fill
        : concerns
          ? toneFor("CONCERN").fill
          : toneFor("PASS").fill,
    });
    entries.push({
      title: `${board.boardName} — corrections`,
      note: "What was set aside before this board's results were drawn up.",
      count: "",
      page: String(laid.pageOf[boardKey("corrections", index)] ?? "—"),
      tone: COLOURS.accent,
    });
  });

  data.boards.forEach((board, index) => {
    const pages = board.originalPages?.sizes.length ?? 0;
    const at = placed.originals[index];
    if (pages === 0 || at === null || at === undefined) return;
    entries.push({
      title: `${board.boardName} — instrument record`,
      note: "The tester's own export for this board, reproduced unaltered.",
      count: `${pages} ${pages === 1 ? "page" : "pages"}`,
      page: String(at),
      tone: COLOURS.accent,
    });
  });

  if (data.gear && placed.equipment !== null) {
    entries.push({
      title: "Equipment used",
      note: "The instrument the readings were taken with, and its calibration.",
      count: "",
      page: String(placed.equipment),
      tone: COLOURS.accent,
    });
  }

  let y = doc.y + 22;
  for (const entry of entries) {
    // A contents that runs past the foot of the page takes a page of its own
    // rather than printing over the footer.
    if (y + 48 > PAGE.height - MARGIN - 40) {
      footer(doc, data);
      doc.addPage();
      y = MARGIN;
    }
    doc.rect(MARGIN, y, CONTENT, 40).fillAndStroke("#ffffff", COLOURS.hair);
    doc.rect(MARGIN, y, 5, 40).fill(entry.tone);

    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(11.5);
    doc.text(safe(entry.title), MARGIN + 18, y + 8, { width: 250, ellipsis: true, height: 14 });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(entry.note), MARGIN + 18, y + 24, {
      width: CONTENT - 210,
      ellipsis: true,
      height: 11,
    });

    if (entry.count) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(entry.tone);
      doc.text(entry.count, MARGIN + CONTENT - 180, y + 9, { width: 108, align: "right" });
    }
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.bar);
    doc.text(entry.page === "—" ? "—" : `Page ${entry.page}`, MARGIN + CONTENT - 66, y + 11, {
      width: 56,
      align: "right",
    });
    y += 48;
  }

  footer(doc, data);
}

/* --- definitions ---------------------------------------------------------- */

/**
 * Written out rather than assumed. A client handed trip times and three
 * colours has been given data; this is what turns it into a report they can
 * act on without ringing up to ask what any of it means.
 */
function definitions(doc: Doc, data: RcdReport): Section {
  const passages: Passage[] = [
    WHAT_IS_AN_RCD,
    IN_NEW_SOUTH_WALES,
    WHAT_WAS_DONE,
    ...verdictPassages(data.concernPercent),
    instrumentPassage(data.instrument),
  ];

  const verdictTone: Record<string, Verdict> = {
    Failed: "FAIL",
    Concern: "CONCERN",
    Passed: "PASS",
  };
  const pieces: Piece[] = [];

  for (const passage of passages) {
    const verdict = verdictTone[passage.heading];
    const tone = verdict ? toneFor(verdict).fill : COLOURS.accent;

    pieces.push({
      height: 24,
      keepWith: 1,
      draw: (y) => {
        doc.rect(MARGIN, y + 3, 3, 13).fill(tone);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(11.5);
        doc.text(safe(passage.heading), MARGIN + 12, y + 2, { width: CONTENT - 12 });
      },
    });

    for (const paragraph of passage.body) {
      const text = safe(paragraph);
      const height = measureText(doc, text, { width: CONTENT - 12, size: 9.5 }) + 9;
      pieces.push({
        height,
        // The first paragraph stays with its heading; the rest may break.
        draw: (y) => {
          doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
          doc.text(text, MARGIN + 12, y, { width: CONTENT - 12, lineGap: 2 });
        },
      });
    }

    pieces.push({ height: 8, draw: () => {} });
  }

  return { id: "definitions", title: "Definitions", pieces };
}

/* --- the limits, the site checks and the limitations ---------------------- */

function basis(doc: Doc, data: RcdReport): Section {
  const pieces: Piece[] = [];

  // Three columns: what the instrument did, what a general 30 mA device is
  // held to, and what that test is for. The third column is what makes the
  // table readable by someone who is not an electrician.
  const columns = [150, 168, CONTENT - 318];

  pieces.push({
    height: 26,
    keepWith: 2,
    draw: (y) => {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOURS.ink);
      doc.text("30 mA RCD Test Assessment Criteria", MARGIN, y, { width: CONTENT });
    },
  });

  pieces.push({
    height: TABLE_HEAD,
    keepWith: 2,
    draw: (y) =>
      tableHead(doc, y, ["Test", "General 30 mA RCD Expectation", "What It Means"], columns),
  });

  THIRTY_MA_CRITERIA.forEach((row, index) => {
    const height = Math.max(
      ROW_HEIGHT,
      measureText(doc, row[2], { width: columns[2] - 16, size: 9.5, lineGap: 1 }) + 10,
    );
    pieces.push({
      height,
      draw: (y) => {
        doc
          .rect(MARGIN, y, CONTENT, height)
          .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9.5);
        doc.text(row[0], MARGIN + 8, y + 6, { width: columns[0] - 12 });
        doc.font("Helvetica").fontSize(9.5);
        doc.text(row[1], MARGIN + columns[0] + 8, y + 6, { width: columns[1] - 12 });
        doc.fillColor(COLOURS.inkSoft);
        doc.text(row[2], MARGIN + columns[0] + columns[1] + 8, y + 6, {
          width: columns[2] - 16,
          lineGap: 1,
        });
        doc.fillColor(COLOURS.ink);
      },
    });
  });

  pieces.push({ height: 14, draw: () => {} });
  for (const line of CRITERIA_NOTE) {
    const text = safe(line);
    const height = measureText(doc, text, { width: CONTENT, size: 9.5, lineGap: 2 }) + 8;
    pieces.push({
      height,
      draw: (y) => {
        doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
        doc.text(text, MARGIN, y, { width: CONTENT, lineGap: 2 });
      },
    });
  }

  const concern = safe(
    `Within this report, a device that satisfies every criterion above but records an operating time at or above ${data.concernPercent}% of the applicable limit is raised as a Concern. That threshold is an internal advisory threshold used by this report, not a classification specified by any Australian Standard.`,
  );
  pieces.push({
    height: measureText(doc, concern, { width: CONTENT, size: 9.5, lineGap: 2 }) + 12,
    draw: (y) => {
      doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
      doc.text(concern, MARGIN, y, { width: CONTENT, lineGap: 2 });
    },
  });

  pieces.push({
    height: measureText(doc, safe(CRITERIA_STANDARDS_NOTE), { width: CONTENT, size: 8.5 }) + 20,
    draw: (y) => {
      doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
      doc.text(safe(CRITERIA_STANDARDS_NOTE), MARGIN, y, { width: CONTENT, lineGap: 1.8 });
    },
  });

  pieces.push({
    height: 30,
    keepWith: 1,
    draw: (y) => sectionBar(doc, "Limitations", y),
  });
  for (const line of LIMITATIONS) {
    const text = safe(line);
    const height = measureText(doc, text, { width: CONTENT - 18, size: 9, lineGap: 1.5 }) + 9;
    pieces.push({
      height,
      draw: (y) => {
        doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
        doc.text("•", MARGIN + 2, y, { width: 10 });
        doc.text(text, MARGIN + 14, y, { width: CONTENT - 18, lineGap: 1.5 });
      },
    });
  }

  return { id: "basis", title: "Basis of Assessment", pieces };
}

/* --- the results ---------------------------------------------------------- */

function toneFor(verdict: Verdict) {
  return verdict === "FAIL"
    ? SEVERITY.fail
    : verdict === "CONCERN"
      ? SEVERITY.concern
      : SEVERITY.pass;
}

function results(doc: Doc, data: RcdReport, board: BoardTest, index: number): Section {
  const pieces: Piece[] = [];

  for (const group of GROUPS) {
    const rows = board.results.filter((result) => result.verdict === group.verdict);
    const tone = toneFor(group.verdict);

    pieces.push({
      height: 34,
      // The heading has to bring the table head and a row with it, or an
      // empty group's sentence, so it is never stranded at the foot of a page.
      keepWith: 2,
      mark: group.verdict,
      draw: (y) => {
        doc.rect(MARGIN, y, 5, 26).fill(tone.fill);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(13);
        doc.text(`${group.title} — ${rows.length}`, MARGIN + 16, y + 3, {
          width: CONTENT - 20,
          ellipsis: true,
          height: 15,
        });
        doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
        doc.text(group.blurb, MARGIN + 16, y + 19, {
          width: CONTENT - 20,
          ellipsis: true,
          height: 11,
        });
      },
    });

    // An empty group still prints, saying so in as many words.
    if (rows.length === 0) {
      pieces.push({
        height: 40,
        draw: (y) => {
          doc.rect(MARGIN, y, CONTENT, 28).fillAndStroke(COLOURS.soft, COLOURS.hair);
          doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(COLOURS.inkSoft);
          doc.text(group.empty, MARGIN + 10, y + 9, {
            width: CONTENT - 20,
            ellipsis: true,
            height: 12,
          });
        },
      });
      continue;
    }

    const head = (y: number) =>
      tableHead(doc, y, [...RESULT_TITLES, "Touch V"], [...RESULT_COLUMNS, TOUCH_WIDTH]);
    pieces.push({ height: TABLE_HEAD, tag: "head", draw: head });

    rows.forEach((row, stripe) => {
      pieces.push({
        height: ROW_HEIGHT,
        tag: "row",
        draw: (y) => {
          doc
            .rect(MARGIN, y, CONTENT, ROW_HEIGHT)
            .fillAndStroke(stripe % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
          // The verdict's colour on the leading edge, so a row carries its
          // classification with it wherever the table breaks across a page.
          doc.rect(MARGIN, y, 3, ROW_HEIGHT).fill(tone.fill);

          // The device, and which phase of it. A three-phase device puts the
          // same name on all three of its rows and separates them by phase, so
          // the phase is set apart rather than run into the name.
          doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(8.5);
          const phaseWidth = row.phase ? 20 : 0;
          doc.text(row.label, MARGIN + 10, y + 6, {
            width: RESULT_COLUMNS[0] - 16 - phaseWidth,
            ellipsis: true,
            height: 11,
          });
          if (row.phase) {
            doc.font("Helvetica").fontSize(7.5).fillColor(COLOURS.inkSoft);
            doc.text(row.phase, MARGIN + RESULT_COLUMNS[0] - 26, y + 7, {
              width: 20,
              align: "right",
            });
          }

          doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
          const cells = [
            row.ratingMa ? `${row.ratingMa} mA` : "\u2014",
            ...row.angles.map(showReading),
            row.touchVolts === null ? "\u2014" : `${row.touchVolts} V`,
          ];
          const widths = [...RESULT_COLUMNS.slice(1), TOUCH_WIDTH];
          let x = MARGIN + RESULT_COLUMNS[0];
          cells.forEach((cell, at) => {
            doc.text(cell, x, y + 6, { width: widths[at], align: "center" });
            x += widths[at];
          });
          doc.fillColor(COLOURS.ink);
        },
      });

      // A failure or a concern says why, right under its own row.
      if (row.verdict === "PASS") return;
      for (const reason of row.reasons) {
        const text = safe(reason);
        const height = measureText(doc, text, { width: CONTENT - 40, size: 8.5, lineGap: 0 }) + 7;
        pieces.push({
          height,
          tag: "row",
          draw: (y) => {
            doc.rect(MARGIN, y, CONTENT, height).fillAndStroke("#ffffff", COLOURS.hair);
            doc.rect(MARGIN, y, 3, height).fill(tone.fill);
            doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
            doc.text(text, MARGIN + 18, y + 4, { width: CONTENT - 40 });
          },
        });
      }
    });

    pieces.push({ height: 20, draw: () => {} });
  }

  return {
    id: boardKey("results", index),
    title: `Test Results — ${board.boardName}`,
    pieces,
    // A table that runs over the page keeps its column headings; a page that
    // opens on a heading or an empty group's note does not want them.
    repeat: (next) =>
      next.tag === "row"
        ? {
            height: TABLE_HEAD,
            draw: (y) =>
              tableHead(
                doc,
                y,
                [...RESULT_TITLES, "Touch V"],
                [...RESULT_COLUMNS, TOUCH_WIDTH],
              ),
          }
        : null,
  };
}

/* --- what was set aside --------------------------------------------------- */

function corrections(doc: Doc, data: RcdReport, board: BoardTest, index: number): Section {
  const pieces: Piece[] = [];

  for (const line of CORRECTIONS_NOTE) {
    const text = safe(line);
    pieces.push({
      height: measureText(doc, text, { width: CONTENT, size: 9.5, lineGap: 2 }) + 9,
      draw: (y) => {
        doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
        doc.text(text, MARGIN, y, { width: CONTENT, lineGap: 2 });
      },
    });
  }
  pieces.push({ height: 8, draw: () => {} });

  const listed = (values: string[]) =>
    values.length ? `${values.length} (${values.join(", ")})` : "None";

  const lines: [string, string][] = [
    ["Switchboard", board.boardName],
    ["Tested on", shortDate(board.testDate)],
    ["Order worked", board.corrections.walk],
    ["Incomplete / non-device records excluded", listed(board.corrections.droppedEmpty)],
    ["Superseded repeat tests excluded", listed(board.corrections.droppedDuplicate)],
    ["RCDs not tested", listed(board.corrections.untested)],
    ["Instrument", data.instrument ?? "—"],
  ];

  lines.forEach(([label, value], index) => {
    const height = Math.max(
      ROW_HEIGHT,
      measureText(doc, value, { width: CONTENT - 244, size: 9.5, lineGap: 0 }) + 10,
    );
    pieces.push({
      height,
      draw: (y) => {
        doc
          .rect(MARGIN, y, CONTENT, height)
          .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9.5);
        // Wide enough for "Incomplete / non-device records excluded", which is
        // the longest of them and was being cut off.
        doc.text(label, MARGIN + 8, y + 6, { width: 218, ellipsis: true, height: 11 });
        doc.font("Helvetica").text(value, MARGIN + 234, y + 6, { width: CONTENT - 244 });
      },
    });
  });

  if (board.checklist.length > 0) {
    pieces.push({ height: 16, draw: () => {} });
    pieces.push({
      height: 30,
      keepWith: 1,
      draw: (y) => sectionBar(doc, "Site Checks", y),
    });
    board.checklist.forEach((item, index) => {
      const height = Math.max(
        ROW_HEIGHT,
        measureText(doc, item.question, { width: CONTENT - 140, size: 9.5, lineGap: 0 }) + 10,
      );
      pieces.push({
        height,
        draw: (y) => {
          doc
            .rect(MARGIN, y, CONTENT, height)
            .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
          doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(9.5);
          doc.text(item.question, MARGIN + 8, y + 6, { width: CONTENT - 140 });
          doc
            .font("Helvetica-Bold")
            .text(item.answer, MARGIN + CONTENT - 124, y + 6, { width: 116, align: "right" });
        },
      });
    });
    pieces.push({ height: 18, draw: () => {} });
  }

  const note = safe(NOT_TESTED_NOTE);
  pieces.push({
    height: measureText(doc, note, { width: CONTENT, size: 8.5, lineGap: 1.8 }) + 16,
    draw: (y) => {
      doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
      doc.text(note, MARGIN, y + 8, { width: CONTENT, lineGap: 1.8 });
      doc.fillColor(COLOURS.ink);
    },
  });

  pieces.push({
    // Tall enough for the signature, which is drawn above the rule it sits on.
    height: 114,
    draw: (y) => signOff(doc, data, y + 44),
  });

  return {
    id: boardKey("corrections", index),
    title: `Corrections Applied — ${board.boardName}`,
    pieces,
  };
}

/* --- the instrument's own report ------------------------------------------ */

/* --- the instrument's record, set out so it can be read ------------------- */





async function countPages(pdf: Buffer): Promise<number> {
  try {
    return (await PDFDocument.load(pdf)).getPageCount();
  } catch {
    return 0;
  }
}

/**
 * Up to four documents on a page, laid out so each is as large as it can be.
 *
 * One fills most of the page on its own; two stack; three put two across the
 * top and one across the foot; four go two by two. Past four they are too
 * small to read, so a fifth starts a new page.
 */
function cells(count: number, region: Box): Box[] {
  const gap = 14;
  const half = (region.height - gap) / 2;
  const column = (region.width - gap) / 2;

  if (count <= 1) {
    // Eighty per cent of the region, centred: large, but plainly a
    // reproduction on our page rather than a page of ours.
    const width = region.width * 0.8;
    const height = region.height * 0.8;
    return [
      {
        x: region.x + (region.width - width) / 2,
        y: region.y + (region.height - height) / 2,
        width,
        height,
      },
    ];
  }

  if (count === 2) {
    return [
      { x: region.x, y: region.y, width: region.width, height: half },
      { x: region.x, y: region.y + half + gap, width: region.width, height: half },
    ];
  }

  const top = [
    { x: region.x, y: region.y, width: column, height: half },
    { x: region.x + column + gap, y: region.y, width: column, height: half },
  ];
  if (count === 3) {
    // The odd one out takes the whole foot and is centred inside it.
    return [...top, { x: region.x, y: region.y + half + gap, width: region.width, height: half }];
  }
  return [
    ...top,
    { x: region.x, y: region.y + half + gap, width: column, height: half },
    { x: region.x + column + gap, y: region.y + half + gap, width: column, height: half },
  ];
}

/** As many as go on a page before they stop being readable. */
const PER_PAGE = 4;

/** The body of a placed page, between the heading rule and the page foot. */
const PLACED = { top: MARGIN + 46, bottom: PAGE.height - MARGIN - 34 };

/** A certificate page is set in from its border, and the border from its gap. */
const BORDER_GAP = 5;
const BORDER_WIDTH = 1.4;

/**
 * One borrowed page in its gap, with the Optilink rule set out around it.
 *
 * The blue rule sits outside the page's own edge rather than on it, so a
 * document that has a border of its own keeps it.
 */
function place(
  doc: Doc,
  size: { width: number; height: number },
  space: Box,
  caption: string,
): Box {
  const inset = BORDER_GAP + BORDER_WIDTH + 2;
  const box = fitted(
    {
      x: space.x + inset,
      y: space.y + inset,
      width: space.width - inset * 2,
      height: space.height - inset * 2 - 12,
    },
    size,
  );

  doc.lineWidth(0.5).strokeColor(COLOURS.hair);
  doc.rect(box.x, box.y, box.width, box.height).stroke();
  doc.lineWidth(BORDER_WIDTH).strokeColor(COLOURS.accent);
  doc
    .rect(
      box.x - BORDER_GAP,
      box.y - BORDER_GAP,
      box.width + BORDER_GAP * 2,
      box.height + BORDER_GAP * 2,
    )
    .stroke();
  doc.lineWidth(1).strokeColor("#000000");

  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLOURS.inkSoft);
  doc.text(caption, box.x - BORDER_GAP, box.y + box.height + BORDER_GAP + 4, {
    width: box.width + BORDER_GAP * 2,
    align: "center",
    characterSpacing: 1.1,
  });
  doc.fillColor(COLOURS.ink);

  return box;
}

/** The heading that sits above a page of somebody else's document. */
function placedHeading(doc: Doc, title: string, note: string) {
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(safe(title), MARGIN, MARGIN, { width: CONTENT });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(note), MARGIN, MARGIN + 17, { width: CONTENT, height: 11, ellipsis: true });
  doc.rect(MARGIN, MARGIN + 32, CONTENT, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, MARGIN + 31, 44, 2.2).fill(COLOURS.accent);
  doc.fillColor(COLOURS.ink);
}

/**
 * Each board's instrument export, reproduced page for page.
 *
 * The pages are the instrument's own, embedded rather than redrawn, so what
 * the reader sees is the file that came off the machine. The gaps are cut
 * here and filled once the document is closed.
 */
function originalPages(
  doc: Doc,
  data: RcdReport,
): { board: BoardTest; slots: Slot[] }[] {
  const out: { board: BoardTest; slots: Slot[] }[] = [];

  for (const board of data.boards) {
    const sizes = board.originalPages?.sizes ?? [];
    if (sizes.length === 0) continue;

    const slots: Slot[] = [];
    for (let from = 0; from < sizes.length; from += PER_PAGE) {
      const chunk = sizes.slice(from, from + PER_PAGE);
      doc.addPage();
      placedHeading(
        doc,
        `Original Instrument Report — ${board.boardName}`,
        `${data.instrument ?? "The test instrument"}'s own export, reproduced unaltered.`,
      );

      const page = doc.bufferedPageRange().count - 1;
      const region: Box = {
        x: MARGIN,
        y: PLACED.top,
        width: CONTENT,
        height: PLACED.bottom - PLACED.top,
      };
      chunk.forEach((size, at) => {
        const box = place(
          doc,
          size,
          cells(chunk.length, region)[at],
          `PAGE ${from + at + 1} OF ${sizes.length}`,
        );
        slots.push({ ...box, page, source: from + at });
      });
    }
    out.push({ board, slots });
  }

  return out;
}

/** The Equipment Used pages turn on their side, as the power analysis does. */
const LANDSCAPE: [number, number] = [PAGE.height, PAGE.width];
const WIDE = PAGE.height - MARGIN * 2;

/** The instrument block: a photograph, and what it is beside it. */
const GEAR = { photo: 150, gap: 18, details: 170, gutter: 24 };

/**
 * The instrument the readings were taken with, and its calibration.
 *
 * Landscape, because a certificate is a portrait page and two of them side by
 * side need the width — the same reason the power analysis turns this page on
 * its side. The photograph sits at the left with what the instrument is
 * beside it, and the certificate takes everything to the right of that.
 */
function equipmentPages(doc: Doc, data: RcdReport): Slot[] {
  const gear = data.gear;
  if (!gear) return [];

  const sizes = gear.certificate?.sizes ?? [];
  const slots: Slot[] = [];

  doc.addPage({ size: LANDSCAPE, margin: MARGIN });
  wideHeading(doc, "Equipment Used", "The instrument, and the certificate that says it reads true.");

  const top = MARGIN + 52;
  let y = top;
  if (gear.photo) {
    try {
      doc.image(gear.photo, MARGIN, y, { fit: [GEAR.photo, 112] });
    } catch {
      // An image the renderer will not take is not worth a failed report.
    }
  }
  const x = gear.photo ? MARGIN + GEAR.photo + GEAR.gap : MARGIN;
  const width = GEAR.details;

  const rows: [string, string][] = [
    ["Equipment name", gear.name],
    ["Model no", gear.modelNo ?? "—"],
    ["Serial no", gear.serialNo ?? "—"],
    [
      "Certification date",
      gear.calibration.calibratedOn ? shortDate(gear.calibration.calibratedOn) : "—",
    ],
    ["Due/expiry date", dueDate(gear)],
  ];
  for (const [name, value] of rows) {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(name.toUpperCase(), x, y, { width, characterSpacing: 1.2, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOURS.ink);
    doc.text(safe(value), x, y + 11, { width });
    y += doc.heightOfString(safe(value), { width }) + 18;
  }

  const note = gear.certificate
    ? "The calibration certificate is reproduced on this page exactly as it was issued. Nothing has been retyped or redrawn."
    : "No calibration certificate has been filed against this instrument.";
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(safe(note), MARGIN, Math.max(y, top + 124) + 8, {
    width: GEAR.photo + GEAR.gap + GEAR.details,
    lineGap: 1.8,
  });
  doc.fillColor(COLOURS.ink);

  if (sizes.length === 0) return slots;

  // The certificate takes the page to the right of the block, and the whole
  // width of any page after it.
  const left = MARGIN + GEAR.photo + GEAR.gap + GEAR.details + GEAR.gutter;
  const bottom = PAGE.width - MARGIN - 30;

  for (let from = 0; from < sizes.length; from += PER_PAGE) {
    const chunk = sizes.slice(from, from + PER_PAGE);
    const first = from === 0;
    if (!first) {
      doc.addPage({ size: LANDSCAPE, margin: MARGIN });
      wideHeading(doc, "Equipment Used", "Calibration certificate, continued.");
    }
    const page = doc.bufferedPageRange().count - 1;
    const region: Box = {
      x: first ? left : MARGIN,
      y: MARGIN + 52,
      width: (first ? MARGIN + WIDE - left : WIDE),
      height: bottom - (MARGIN + 52),
    };
    chunk.forEach((size, at) => {
      const box = place(
        doc,
        size,
        cells(chunk.length, region)[at],
        `PAGE ${from + at + 1} OF ${sizes.length}`,
      );
      slots.push({ ...box, page, source: from + at });
    });
  }

  return slots;
}

/** The same heading as a placed page, across the width of a turned page. */
function wideHeading(doc: Doc, title: string, note: string) {
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOURS.ink);
  doc.text(safe(title), MARGIN, MARGIN, { width: WIDE });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(safe(note), MARGIN, MARGIN + 18, { width: WIDE, height: 11, ellipsis: true });
  doc.rect(MARGIN, MARGIN + 34, WIDE, 0.8).fill(COLOURS.hair);
  doc.rect(MARGIN, MARGIN + 33, 48, 2.2).fill(COLOURS.accent);
  doc.fillColor(COLOURS.ink);
}

/** The due date, the certificate's own or a year from its certification. */
function dueDate(gear: Instrument): string {
  const due = expiry(gear.calibration);
  if (!due) return gear.certificate ? "Not stated on the certificate" : "—";
  return shortDate(due.at);
}

/**
 * Every original, attached whole as well as reproduced.
 *
 * A page that has been through two libraries is a copy; the point of
 * including the instrument's record is to have the file itself, so it rides
 * along as an attachment that can be pulled out and opened on its own.
 */
async function attachOriginals(ours: Buffer, data: RcdReport): Promise<Buffer> {
  const files = data.boards
    .map((board, index) => ({ board, index }))
    .filter((entry) => entry.board.original);
  if (files.length === 0 && !data.gear?.certificate) return ours;

  try {
    const target = await PDFDocument.load(ours);
    for (const { board, index } of files) {
      await target.attach(
        new Uint8Array(board.original as Buffer),
        `instrument-report-${index + 1}.pdf`,
        {
          mimeType: "application/pdf",
          description: `${board.boardName}: the test instrument's own export, unaltered.`,
        },
      );
    }
    if (data.gear?.certificate) {
      await target.attach(
        new Uint8Array(data.gear.certificate.bytes),
        "calibration-certificate.pdf",
        {
          mimeType: "application/pdf",
          description: `${data.gear.name}: calibration certificate, unaltered.`,
        },
      );
    }
    return Buffer.from(await target.save());
  } catch {
    // A report without the attachments still beats no report.
    return ours;
  }
}
