import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { COMPANY } from "@/lib/company";
import { LIMIT_SOURCE, showReading, type Verdict } from "@/lib/rcd/assess";
import { loadTuning } from "@/lib/rcd/settings";
import { CHECKLIST } from "@/lib/rcd/checklist";
import { normaliseWalk } from "@/lib/rcd/map";
import { namesMatch } from "@/lib/rcd/names";
import {
  IN_NEW_SOUTH_WALES,
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

/** The four limitation clauses that go on every report of this kind. */
const LIMITATIONS = [
  "The examination and testing of the installation and/or appliances (if applicable) is based on safety provisions and not on efficient performance. The report is not a guarantee or warranty that the wiring or connections to outlets are satisfactory for its present use or for any altered use.",
  "Where the report includes a visual inspection then the report relates only to those areas where access was obtainable.",
  "The report is on the condition of the electrical equipment (RCD only) on the day of inspection and in the prevailing weather conditions at the date of inspection. The tests show only the current readings for equipment under conditions then existing. Alterations in usage patterns may affect the integrity of the system.",
  "The report is made for the benefit of the person to whom it is addressed. No other person shall be entitled to rely on this report for any purpose whatsoever.",
];

export type RcdResultRow = {
  label: string;
  ratingMa: number | null;
  kindLabel: string;
  half: Reading;
  rated: Reading;
  five: Reading;
  touchVolts: number | null;
  verdict: Verdict;
  reasons: string[];
};

export type RcdReport = PageMeta & {
  boardName: string;
  testDate: Date;
  reportDate: Date;
  contactName: string | null;
  instrument: string | null;
  results: RcdResultRow[];
  limits: { kindLabel: string; limits: RcdLimits }[];
  concernPercent: number;
  corrections: {
    droppedEmpty: string[];
    droppedDuplicate: string[];
    untested: string[];
    walk: string;
  };
  checklist: { question: string; answer: string }[];
  original: Buffer | null;
  /** How many pages the instrument's own report runs to. */
  originalPages: number;
};

/* --- gathering ------------------------------------------------------------ */

export async function loadRcdReport(runId: string): Promise<RcdReport | null> {
  const run = await prisma.rcdTestRun.findUnique({
    where: { id: runId },
    include: {
      equipment: { select: { name: true } },
      sourceFile: true,
      site: {
        include: {
          client: { select: { name: true } },
          contacts: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
      results: { orderBy: { position: "asc" } },
    },
  });
  if (!run) return null;

  const tuning = await loadTuning();
  const parsed = (run.parsed ?? {}) as {
    company?: string | null;
    siteName?: string | null;
    boardName?: string | null;
  };
  const identity = resolveIdentity(parsed, {
    siteName: run.site.name,
    siteLocation: run.site.location,
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

  return {
    clientName: safe(run.site.client.name),
    siteName: safe(identity.siteName),
    siteLocation: identity.siteLocation ? safe(identity.siteLocation) : null,
    contactName: run.site.contacts[0] ? safe(run.site.contacts[0].name) : null,
    boardName: safe(identity.boardName),
    testDate: run.date,
    reportDate: new Date(),
    instrument: parsed.company ? safe(parsed.company) : null,
    results: run.results.map((result) => ({
      label: safe(result.label),
      ratingMa: result.ratingMa,
      kindLabel: result.kind ? tuning.limits[result.kind].kindLabel : "—",
      half: pick(result.halfAt0, result.halfAt180),
      rated: pick(result.ratedAt0, result.ratedAt180),
      five: pick(result.fiveAt0, result.fiveAt180),
      touchVolts: result.touchVolts,
      verdict: result.verdict as Verdict,
      reasons: result.reasons.map(safe),
    })),
    limits: Object.values(tuning.limits).map((limits) => ({
      kindLabel: limits.kindLabel,
      limits,
    })),
    concernPercent: tuning.concernPercent,
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
    originalPages: original ? await countPages(original) : 0,
    logo: await brandBytes("logo.jpg"),
    signature: await reportSignature(),
  };
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
    blurb: "Did not meet the standard. These need replacing.",
    empty: "No device failed. Nothing in this section needs acting on.",
  },
  {
    verdict: "CONCERN",
    title: "Concerns",
    blurb: "Passed, but close enough to the limit to be worth watching.",
    empty: "No device was close enough to its limit to raise.",
  },
  {
    verdict: "PASS",
    title: "Passed",
    blurb: "Met the standard with margin in hand.",
    empty: "No device passed on this run.",
  },
];

/** Cover and contents are drawn by hand; the sections follow. */
const FIRST_SECTION_PAGE = 3;

const ROW_HEIGHT = 22;
const TABLE_HEAD = 20;

const RESULT_COLUMNS = [150, 60, 64, 64, 64, CONTENT - 150 - 252];
const RESULT_TITLES = ["Circuit", "Rating", "x 1/2", "x 1", "x 5", "Touch V"];

export async function buildRcdReport(data: RcdReport): Promise<Buffer> {
  const { doc, done } = newDocument();

  // The instrument's pages are bound on at the end, and they count towards the
  // total the reader sees at the foot of every page.
  const appended = data.originalPages;

  // Everything after the contents is measured and packed first, so the page
  // numbers the contents prints are the pages things actually landed on.
  const laid = layout(sections(doc, data, appended), FIRST_SECTION_PAGE);

  cover(doc, data);
  contents(doc, data, laid);
  render(doc, data, laid);

  stampPageNumbers(doc, appended);
  doc.end();

  const ours = await done;
  return data.original ? await append(ours, data.original) : ours;
}

/** Every section of the report, in the order it is read. */
function sections(doc: Doc, data: RcdReport, appended: number): Section[] {
  const out: Section[] = [
    definitions(doc, data),
    basis(doc, data),
    results(doc, data),
    corrections(doc, data),
  ];
  if (appended > 0) out.push(originalDivider(doc, data, appended));
  return out;
}

/* --- the cover and the contents ------------------------------------------- */

function cover(doc: Doc, data: RcdReport) {
  const failed = data.results.filter((result) => result.verdict === "FAIL").length;
  coverPage(doc, data, {
    title: "Residual Current Device Test Report",
    eyebrow: "Safety switch testing",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: "Test date",
    date: data.testDate,
    scopeLabel: "Tested on this visit",
    scope: `${data.boardName} — one switchboard, ${data.results.length} ${
      data.results.length === 1 ? "device" : "devices"
    } tested${failed ? `, ${failed} failed` : ""}`,
    rows: [
      ["Site contact", data.contactName ?? data.clientName],
      ["Report date", shortDate(data.reportDate)],
      ["Switchboard", data.boardName],
      ["Tested by", `${COMPANY.name} · Lic ${COMPANY.licence}`],
    ],
    note:
      "This report is issued to the addressee named above and relates only to the switchboard and devices listed " +
      "on it. Testing was carried out with a calibrated instrument and assessed against AS/NZS 3017. It records " +
      "how each device performed on the day of testing; it is not a warranty of future performance.",
    marks: [],
  });
}

/** One row of the contents: what it is, how much of it there is, and where. */
type Entry = { title: string; note: string; count: string; page: string; tone: string };

function contents(doc: Doc, data: RcdReport, laid: Layout) {
  doc.addPage();
  sectionBar(doc, "Contents", MARGIN);

  const where = data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName;
  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.ink);
  doc.text(
    `Residual current devices at ${data.boardName}, ${where}, were tested on ${longDate(
      data.testDate,
    )} for ${data.clientName}. Each device was tested at half, one and five times its rated residual current, in both polarities.`,
    MARGIN,
    MARGIN + 46,
    { width: CONTENT, lineGap: 2.5 },
  );

  const counted = (verdict: Verdict) =>
    data.results.filter((result) => result.verdict === verdict).length;

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
      note: "The limits every reading was judged against, and their source.",
      count: "",
      page: String(laid.pageOf.basis),
      tone: COLOURS.accent,
    },
    // Every verdict is listed whether or not anything landed in it: a client
    // has to be able to see at a glance that nothing failed, rather than infer
    // it from a section that is not there.
    ...GROUPS.map((group) => {
      const total = counted(group.verdict);
      return {
        title: group.title,
        note: group.blurb,
        count: `${total} ${total === 1 ? "device" : "devices"}`,
        page: total > 0 ? String(laid.pageOf[group.verdict] ?? laid.pageOf.results) : "—",
        tone: toneFor(group.verdict).fill,
      };
    }),
    {
      title: "Corrections applied",
      note: "What was set aside before the results were drawn up, and why.",
      count: "",
      page: String(laid.pageOf.corrections),
      tone: COLOURS.accent,
    },
  ];

  if (data.originalPages > 0) {
    entries.push({
      title: "Original instrument report",
      note: "The tester's own export, reproduced unaltered.",
      count: `${data.originalPages} ${data.originalPages === 1 ? "page" : "pages"}`,
      page: String(laid.pageOf.original),
      tone: COLOURS.accent,
    });
  }

  let y = doc.y + 22;
  for (const entry of entries) {
    doc.rect(MARGIN, y, CONTENT, 40).fillAndStroke("#ffffff", COLOURS.hair);
    doc.rect(MARGIN, y, 5, 40).fill(entry.tone);

    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(12);
    doc.text(entry.title, MARGIN + 18, y + 8, { width: 230, ellipsis: true, height: 14 });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(entry.note, MARGIN + 18, y + 24, {
      width: CONTENT - 210,
      ellipsis: true,
      height: 11,
    });

    if (entry.count) {
      doc.font("Helvetica-Bold").fontSize(11.5).fillColor(entry.tone);
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
  const columns = [168, 104, 104, CONTENT - 168 - 208];

  pieces.push({
    height: TABLE_HEAD,
    keepWith: 2,
    draw: (y) =>
      tableHead(doc, y, ["Device", "Max at rated", "Max at 5 x rated", "Min at rated"], columns),
  });

  data.limits.forEach((entry, index) => {
    pieces.push({
      height: ROW_HEIGHT,
      draw: (y) => {
        doc
          .rect(MARGIN, y, CONTENT, ROW_HEIGHT)
          .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
        doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(9.5);
        doc.text(entry.kindLabel, MARGIN + 8, y + 6, { width: columns[0] - 12, ellipsis: true, height: 11 });
        const cells = [
          `${entry.limits.maxAtRatedMs} ms`,
          entry.limits.maxAt5xMs === null ? "—" : `${entry.limits.maxAt5xMs} ms`,
          entry.limits.minAtRatedMs === null ? "—" : `${entry.limits.minAtRatedMs} ms`,
        ];
        let x = MARGIN + columns[0];
        cells.forEach((cell, at) => {
          doc.text(cell, x, y + 6, { width: columns[at + 1], align: "center" });
          x += columns[at + 1];
        });
      },
    });
  });

  const rule = safe(
    `At half the rated residual current the device must NOT operate; an operation at that current is recorded as a failure. A device that passes but reads at or above ${data.concernPercent}% of its limit is raised as a concern rather than a clean pass.`,
  );
  pieces.push({ height: 14, draw: () => {} });
  pieces.push({
    height: measureText(doc, rule, { width: CONTENT, size: 9.5 }) + 8,
    draw: (y) => {
      doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
      doc.text(rule, MARGIN, y, { width: CONTENT, lineGap: 2 });
    },
  });
  pieces.push({
    height: measureText(doc, safe(LIMIT_SOURCE), { width: CONTENT, size: 9 }) + 20,
    draw: (y) => {
      doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
      doc.text(safe(LIMIT_SOURCE), MARGIN, y, { width: CONTENT, lineGap: 2 });
    },
  });

  if (data.checklist.length > 0) {
    pieces.push({
      height: 30,
      keepWith: 1,
      draw: (y) => sectionBar(doc, "Site Checks", y),
    });
    data.checklist.forEach((item, index) => {
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

  pieces.push({
    height: 30,
    keepWith: 1,
    draw: (y) => sectionBar(doc, "Limitations", y),
  });
  for (const line of LIMITATIONS) {
    const text = safe(line);
    const height = measureText(doc, text, { width: CONTENT - 18, size: 9, lineGap: 1.5 }) + 7;
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

function results(doc: Doc, data: RcdReport): Section {
  const pieces: Piece[] = [];

  for (const group of GROUPS) {
    const rows = data.results.filter((result) => result.verdict === group.verdict);
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

    pieces.push({
      height: TABLE_HEAD,
      tag: "head",
      draw: (y) => tableHead(doc, y, RESULT_TITLES, RESULT_COLUMNS),
    });

    rows.forEach((row, stripe) => {
      pieces.push({
        height: ROW_HEIGHT,
        tag: "row",
        draw: (y) => {
          doc
            .rect(MARGIN, y, CONTENT, ROW_HEIGHT)
            .fillAndStroke(stripe % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
          doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9);
          doc.text(row.label, MARGIN + 8, y + 6, {
            width: RESULT_COLUMNS[0] - 12,
            ellipsis: true,
            height: 11,
          });
          doc.font("Helvetica");
          const cells = [
            row.ratingMa ? `${row.ratingMa} mA` : "—",
            showReading(row.half),
            showReading(row.rated),
            showReading(row.five),
            row.touchVolts === null ? "—" : `${row.touchVolts} V`,
          ];
          let x = MARGIN + RESULT_COLUMNS[0];
          cells.forEach((cell, at) => {
            doc.text(cell, x, y + 6, { width: RESULT_COLUMNS[at + 1], align: "center" });
            x += RESULT_COLUMNS[at + 1];
          });
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
    id: "results",
    title: "Test Results",
    pieces,
    // A table that runs over the page keeps its column headings; a page that
    // opens on a heading or an empty group's note does not want them.
    repeat: (next) =>
      next.tag === "row"
        ? {
            height: TABLE_HEAD,
            draw: (y) => tableHead(doc, y, RESULT_TITLES, RESULT_COLUMNS),
          }
        : null,
  };
}

/* --- what was set aside --------------------------------------------------- */

function corrections(doc: Doc, data: RcdReport): Section {
  const pieces: Piece[] = [];

  const intro = safe(
    "The instrument records every fetch, including those taken without a device connected, and an RCD tested more than once leaves a record each time. The following was set aside before the results were drawn up.",
  );
  pieces.push({
    height: measureText(doc, intro, { width: CONTENT, size: 10 }) + 16,
    draw: (y) => {
      doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
      doc.text(intro, MARGIN, y, { width: CONTENT, lineGap: 2 });
    },
  });

  const listed = (values: string[]) =>
    values.length ? `${values.length} (${values.join(", ")})` : "None";

  const lines: [string, string][] = [
    ["Order worked", data.corrections.walk],
    ["Empty tests discarded", listed(data.corrections.droppedEmpty)],
    ["Repeat tests discarded", listed(data.corrections.droppedDuplicate)],
    ["RCDs not tested", listed(data.corrections.untested)],
    ["Instrument", data.instrument ?? "—"],
  ];

  lines.forEach(([label, value], index) => {
    const height = Math.max(
      ROW_HEIGHT,
      measureText(doc, value, { width: CONTENT - 190, size: 9.5, lineGap: 0 }) + 10,
    );
    pieces.push({
      height,
      draw: (y) => {
        doc
          .rect(MARGIN, y, CONTENT, height)
          .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9.5);
        doc.text(label, MARGIN + 8, y + 6, { width: 164, ellipsis: true, height: 11 });
        doc.font("Helvetica").text(value, MARGIN + 180, y + 6, { width: CONTENT - 190 });
      },
    });
  });

  pieces.push({
    // Tall enough for the signature, which is drawn above the rule it sits on.
    height: 114,
    draw: (y) => signOff(doc, data, y + 44),
  });

  return { id: "corrections", title: "Corrections Applied", pieces };
}

/* --- the instrument's own report ------------------------------------------ */

/**
 * A page of its own, so the instrument's report cannot be missed when the
 * client flips through — and so it is obvious where ours stops and theirs
 * starts.
 */
function originalDivider(doc: Doc, data: RcdReport, pages: number): Section {
  const one = pages === 1;
  const lines = [
    {
      text: safe(
        one
          ? "The page that follows is the test instrument's own report."
          : `The ${pages} pages that follow are the test instrument's own report.`,
      ),
      size: 15,
      font: "Helvetica-Bold",
      gap: 16,
    },
    {
      text: safe(
        one
          ? "It is reproduced exactly as it was downloaded from the instrument and has not been edited, reformatted or re-typed in any way. Nothing in this report changes it."
          : "They are reproduced exactly as they were downloaded from the instrument and have not been edited, reformatted or re-typed in any way. Nothing in this report changes them.",
      ),
      size: 11,
      font: "Helvetica",
      gap: 14,
    },
    {
      text: safe(
        `The same file is also attached to this PDF as \u201coriginal-instrument-report.pdf\u201d, so the instrument's own record can be extracted and checked against ${
          one ? "this page" : "these pages"
        } independently.`,
      ),
      size: 11,
      font: "Helvetica",
      gap: 26,
    },
  ];

  const pieces: Piece[] = [{ height: 18, draw: () => {} }];
  for (const line of lines) {
    const height =
      measureText(doc, line.text, { width: CONTENT, size: line.size, font: line.font, lineGap: 3 }) +
      line.gap;
    pieces.push({
      height,
      draw: (y) => {
        doc.font(line.font).fontSize(line.size).fillColor(COLOURS.ink);
        doc.text(line.text, MARGIN, y, { width: CONTENT, lineGap: 3 });
      },
    });
  }

  pieces.push({
    height: 22,
    draw: (y) => {
      doc.rect(MARGIN, y, CONTENT, 2).fill(COLOURS.accent);
    },
  });
  pieces.push({
    height: 16,
    draw: (y) => {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.inkSoft);
      doc.text(`Instrument: ${data.instrument ?? "\u2014"}`, MARGIN, y, { width: CONTENT });
      doc.fillColor(COLOURS.ink);
    },
  });

  return { id: "original", title: "Original Instrument Report", pieces };
}

async function countPages(pdf: Buffer): Promise<number> {
  try {
    return (await PDFDocument.load(pdf)).getPageCount();
  } catch {
    return 0;
  }
}

/**
 * pdfkit cannot copy pages out of an existing PDF, so the instrument's export
 * is bound on with pdf-lib — and attached whole as well, because a page that
 * has been through two libraries is a copy, and the point of including it is
 * to have the original.
 */
async function append(ours: Buffer, original: Buffer): Promise<Buffer> {
  try {
    const target = await PDFDocument.load(ours);
    const source = await PDFDocument.load(original);
    const pages = await target.copyPages(source, source.getPageIndices());
    for (const page of pages) target.addPage(page);

    await target.attach(new Uint8Array(original), "original-instrument-report.pdf", {
      mimeType: "application/pdf",
      description: "The test instrument's own export, unaltered.",
    });

    return Buffer.from(await target.save());
  } catch {
    // A report without the original bound in still beats no report.
    return ours;
  }
}
