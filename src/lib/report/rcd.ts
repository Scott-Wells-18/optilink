import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { COMPANY } from "@/lib/company";
import { LIMIT_SOURCE, showReading, type Verdict } from "@/lib/rcd/assess";
import { loadTuning } from "@/lib/rcd/settings";
import { CHECKLIST } from "@/lib/rcd/checklist";
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
  COLOURS,
  CONTENT,
  MARGIN,
  PAGE,
  SEVERITY,
  longDate,
  safe,
  shortDate,
} from "@/lib/report/theme";

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
  mismatches: string[];
  original: Buffer | null;
  /** How many pages the instrument's own report runs to. */
  originalPages: number;
  badge: Buffer | null;
  auspta: Buffer | null;
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
  const parsed = (run.parsed ?? {}) as { company?: string | null };
  const corrections = (run.corrections ?? {}) as {
    droppedEmpty?: string[];
    droppedDuplicate?: string[];
    untested?: string[];
    walk?: { order?: string; rightToLeft?: boolean };
  };
  const checklist = (run.checklist ?? {}) as Record<string, boolean | string>;
  const original = run.sourceFile ? await fileBytes(run.sourceFile.storedName) : null;

  return {
    clientName: safe(run.site.client.name),
    siteName: safe(run.site.name),
    siteLocation: run.site.location ? safe(run.site.location) : null,
    contactName: run.site.contacts[0] ? safe(run.site.contacts[0].name) : null,
    boardName: safe(run.equipment?.name ?? "Switchboard"),
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
    mismatches: run.mismatches.map(safe),
    original,
    originalPages: original ? await countPages(original) : 0,
    logo: await brandBytes("logo.jpg"),
    badge: await brandBytes("thermographer.png"),
    auspta: await brandBytes("auspta.png"),
  };
}

/** The worse of the two phases — a device has to pass on both. */
function pick(a: number | null, b: number | null): Reading {
  const values = [a, b].filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const worst = Math.max(...values);
  return worst >= 2000 ? "NO_TRIP" : worst;
}

function describeWalk(walk: { order?: string; rightToLeft?: boolean } | undefined): string {
  if (!walk) return "Down each column in turn, left to right";
  const across = walk.order === "ROWS";
  const side = walk.rightToLeft ? "right to left" : "left to right";
  return across ? `Across each row, ${side}` : `Down each column in turn, ${side}`;
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

const GROUPS: { verdict: Verdict; title: string; blurb: string }[] = [
  {
    verdict: "FAIL",
    title: "Failed",
    blurb: "These devices did not meet the standard and need attention.",
  },
  {
    verdict: "CONCERN",
    title: "Concerns",
    blurb: "These passed, but close enough to their limit to be worth watching.",
  },
  { verdict: "PASS", title: "Passed", blurb: "These met the standard comfortably." },
];

export async function buildRcdReport(data: RcdReport): Promise<Buffer> {
  const { doc, done } = newDocument();

  // The instrument's pages are bound on at the end, and they count towards the
  // total the reader sees at the foot of every page.
  const appended = data.originalPages;

  const laid = plan(doc, data);

  cover(doc, data);
  contents(doc, data, laid);
  basis(doc, data);
  results(doc, data, laid);
  corrections(doc, data, laid);
  if (appended > 0) originalDivider(doc, data, appended);

  stampPageNumbers(doc, appended);
  doc.end();

  const ours = await done;
  return data.original ? await append(ours, data.original) : ours;
}

type Group = { verdict: Verdict; title: string; blurb: string; rows: RcdResultRow[]; page: number };

/** One thing to draw, and how tall it is. */
type Block =
  | { kind: "groupHead"; group: Group; height: number }
  | { kind: "tableHead"; group: Group; height: number }
  | { kind: "row"; group: Group; row: RcdResultRow; stripe: number; height: number }
  | { kind: "reason"; group: Group; text: string; height: number };

type Plan = {
  groups: Group[];
  /** The blocks that land on each results page, in order. */
  pages: Block[][];
  correctionsPage: number;
  originalPage: number;
};

const ROW_HEIGHT = 22;
const GROUP_HEAD = 46;
const TABLE_HEAD = 20;
const GROUP_GAP = 20;
const BOTTOM = PAGE.height - 82;
/** Cover, contents, basis — then the results start. */
const FIRST_RESULTS_PAGE = 4;

/**
 * Worked out before anything is drawn, because the contents page cites page
 * numbers and a failure's explanation makes its row as tall as its words.
 * The drawing below simply plays this back, so the two cannot disagree.
 */
function plan(doc: Doc, data: RcdReport): Plan {
  const groups = GROUPS.map((group) => ({
    ...group,
    rows: data.results.filter((result) => result.verdict === group.verdict),
    page: 0,
  })).filter((group) => group.rows.length > 0);

  doc.font("Helvetica").fontSize(8.5);
  const blocks: Block[] = [];
  for (const group of groups) {
    blocks.push({ kind: "groupHead", group, height: GROUP_HEAD });
    blocks.push({ kind: "tableHead", group, height: TABLE_HEAD });
    group.rows.forEach((row, stripe) => {
      blocks.push({ kind: "row", group, row, stripe, height: ROW_HEIGHT });
      if (row.verdict === "PASS") return;
      for (const text of row.reasons) {
        blocks.push({
          kind: "reason",
          group,
          text,
          height: doc.heightOfString(text, { width: CONTENT - 40 }) + 7,
        });
      }
    });
  }

  const pages: Block[][] = [];
  let page: Block[] = [];
  let y = MARGIN + 34;

  const breakPage = () => {
    pages.push(page);
    page = [];
    y = MARGIN;
  };

  for (const [index, block] of blocks.entries()) {
    // A group heading is no use at the foot of a page with nothing under it.
    const needs =
      block.kind === "groupHead"
        ? block.height + TABLE_HEAD + ROW_HEIGHT
        : block.height;

    if (page.length > 0 && y + needs > BOTTOM) {
      breakPage();
      // A table carried over needs its heading again.
      if (block.kind === "row" || block.kind === "reason") {
        page.push({ kind: "tableHead", group: block.group, height: TABLE_HEAD });
        y += TABLE_HEAD;
      }
    }

    if (block.kind === "groupHead" && !groups[0]) continue;
    if (block.kind === "groupHead") {
      block.group.page = FIRST_RESULTS_PAGE + pages.length;
      if (index > 0) y += 0;
    }

    page.push(block);
    y += block.height;

    const next = blocks[index + 1];
    if (next?.kind === "groupHead") y += GROUP_GAP;
  }
  if (page.length > 0) pages.push(page);
  if (pages.length === 0) pages.push([]);

  const correctionsPage = FIRST_RESULTS_PAGE + pages.length;
  return { groups, pages, correctionsPage, originalPage: correctionsPage + 1 };
}

function cover(doc: Doc, data: RcdReport) {
  const failed = data.results.filter((result) => result.verdict === "FAIL").length;
  coverPage(doc, data, {
    title: "Residual Current Device Test Report",
    subtitle: data.siteLocation || data.siteName,
    dateLabel: "Test Date:",
    date: data.testDate,
    scope: `${data.boardName} — ${data.results.length} ${
      data.results.length === 1 ? "device" : "devices"
    } tested${failed ? `, ${failed} failed` : ""}`,
    rows: [
      ["Prepared for:", data.contactName ?? data.clientName],
      ["Report Date:", shortDate(data.reportDate)],
      ["Switchboard:", data.boardName],
      ["Tested By:", `${COMPANY.name} · Lic ${COMPANY.licence}`],
    ],
    marks: [data.badge, data.auspta],
  });
}

function contents(doc: Doc, data: RcdReport, laid: Plan) {
  doc.addPage();
  sectionBar(doc, "Results at a Glance", MARGIN);

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

  let y = doc.y + 22;
  for (const group of laid.groups) {
    const tone =
      group.verdict === "FAIL"
        ? SEVERITY.fail
        : group.verdict === "CONCERN"
          ? SEVERITY.concern
          : SEVERITY.pass;

    doc.rect(MARGIN, y, CONTENT, 44).fillAndStroke("#ffffff", COLOURS.hair);
    doc.rect(MARGIN, y, 5, 44).fill(tone.fill);
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(13);
    doc.text(group.title, MARGIN + 18, y + 9, { width: 200 });
    doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.inkSoft);
    doc.text(group.blurb, MARGIN + 18, y + 26, { width: CONTENT - 200 });

    doc.font("Helvetica-Bold").fontSize(13).fillColor(tone.fill);
    doc.text(
      `${group.rows.length} ${group.rows.length === 1 ? "device" : "devices"}`,
      MARGIN + CONTENT - 190,
      y + 9,
      { width: 110, align: "right" },
    );
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.bar);
    doc.text(`Page ${group.page}`, MARGIN + CONTENT - 70, y + 11, {
      width: 60,
      align: "right",
    });
    y += 54;
  }

  // The instrument's own report is part of what they are being handed, so it
  // is listed like any other section rather than left to be stumbled upon.
  if (data.originalPages > 0) {
    doc.rect(MARGIN, y, CONTENT, 44).fillAndStroke("#ffffff", COLOURS.hair);
    doc.rect(MARGIN, y, 5, 44).fill(COLOURS.accent);
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(13);
    doc.text("Original instrument report", MARGIN + 18, y + 9, { width: 260 });
    doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.inkSoft);
    doc.text("The tester's own export, reproduced unaltered.", MARGIN + 18, y + 26, {
      width: CONTENT - 200,
    });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOURS.accent);
    doc.text(
      `${data.originalPages} ${data.originalPages === 1 ? "page" : "pages"}`,
      MARGIN + CONTENT - 190,
      y + 9,
      { width: 110, align: "right" },
    );
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.bar);
    doc.text(`Page ${laid.originalPage}`, MARGIN + CONTENT - 70, y + 11, {
      width: 60,
      align: "right",
    });
    y += 54;
  }

  if (data.mismatches.length > 0) {
    y += 6;
    sectionBar(doc, "Please Note", y);
    y += 30;
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
    for (const line of data.mismatches) {
      doc.text(`•  ${line}`, MARGIN + 8, y, { width: CONTENT - 16, lineGap: 1.5 });
      y = doc.y + 5;
    }
  }

  footer(doc, data);
}

function basis(doc: Doc, data: RcdReport) {
  doc.addPage();
  sectionBar(doc, "Basis of Assessment", MARGIN);

  let y = MARGIN + 42;
  const columns = [168, 104, 104, CONTENT - 168 - 208];
  tableHead(doc, y, ["Device", "Max at rated", "Max at 5 x rated", "Min at rated"], columns);
  y += 20;
  doc.fontSize(9.5);
  data.limits.forEach((entry, index) => {
    doc
      .rect(MARGIN, y, CONTENT, ROW_HEIGHT)
      .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
    doc.fillColor(COLOURS.ink).font("Helvetica").text(entry.kindLabel, MARGIN + 8, y + 6, {
      width: columns[0] - 12,
    });
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
    y += ROW_HEIGHT;
  });

  y += 14;
  doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
  doc.text(
    `At half the rated residual current the device must NOT operate; a trip at that current is recorded as a failure. A device that passes but reads at or above ${data.concernPercent}% of its limit is raised as a concern rather than a clean pass.`,
    MARGIN,
    y,
    { width: CONTENT, lineGap: 2 },
  );
  y = doc.y + 8;
  doc.fontSize(9).fillColor(COLOURS.inkSoft).text(LIMIT_SOURCE, MARGIN, y, { width: CONTENT });
  y = doc.y + 18;

  if (data.checklist.length > 0) {
    sectionBar(doc, "Site Checks", y);
    y += 30;
    doc.fontSize(9.5);
    data.checklist.forEach((item, index) => {
      const height = Math.max(
        ROW_HEIGHT,
        doc.heightOfString(item.question, { width: CONTENT - 130 }) + 10,
      );
      doc
        .rect(MARGIN, y, CONTENT, height)
        .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
      doc.fillColor(COLOURS.ink).font("Helvetica").text(item.question, MARGIN + 8, y + 6, {
        width: CONTENT - 130,
      });
      doc
        .font("Helvetica-Bold")
        .text(item.answer, MARGIN + CONTENT - 116, y + 6, { width: 108, align: "right" });
      y += height;
    });
    y += 18;
  }

  sectionBar(doc, "Limitations", y);
  y += 30;
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
  for (const line of LIMITATIONS) {
    doc.text(`•  ${line}`, MARGIN + 6, y, { width: CONTENT - 12, lineGap: 1.5 });
    y = doc.y + 6;
  }

  footer(doc, data);
}

const RESULT_COLUMNS = [150, 60, 64, 64, 64, CONTENT - 150 - 252];
const RESULT_TITLES = ["Circuit", "Rating", "x 1/2", "x 1", "x 5", "Touch V"];

function toneFor(verdict: Verdict) {
  return verdict === "FAIL"
    ? SEVERITY.fail
    : verdict === "CONCERN"
      ? SEVERITY.concern
      : SEVERITY.pass;
}

function results(doc: Doc, data: RcdReport, laid: Plan) {
  laid.pages.forEach((blocks, index) => {
    doc.addPage();
    let y = MARGIN;
    if (index === 0) {
      sectionBar(doc, "Test Results", MARGIN);
      y = MARGIN + 34;
      if (blocks.length === 0) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor(COLOURS.ink)
          .text("No devices were tested on this run.", MARGIN, y, { width: CONTENT });
      }
    }

    for (const block of blocks) {
      const tone = toneFor(block.group.verdict);

      if (block.kind === "groupHead") {
        doc.rect(MARGIN, y, 5, 26).fill(tone.fill);
        doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(13);
        doc.text(`${block.group.title} — ${block.group.rows.length}`, MARGIN + 16, y + 5);
        doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
        doc.text(block.group.blurb, MARGIN + 16, y + 21, { width: CONTENT - 20 });
      }

      if (block.kind === "tableHead") {
        tableHead(doc, y, RESULT_TITLES, RESULT_COLUMNS);
      }

      if (block.kind === "row") {
        doc
          .rect(MARGIN, y, CONTENT, block.height)
          .fillAndStroke(block.stripe % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
        doc
          .fillColor(COLOURS.ink)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(block.row.label, MARGIN + 8, y + 6, {
            width: RESULT_COLUMNS[0] - 12,
            ellipsis: true,
            height: 11,
          });
        doc.font("Helvetica");
        const cells = [
          block.row.ratingMa ? `${block.row.ratingMa} mA` : "—",
          showReading(block.row.half),
          showReading(block.row.rated),
          showReading(block.row.five),
          block.row.touchVolts === null ? "—" : `${block.row.touchVolts} V`,
        ];
        let x = MARGIN + RESULT_COLUMNS[0];
        cells.forEach((cell, at) => {
          doc.text(cell, x, y + 6, { width: RESULT_COLUMNS[at + 1], align: "center" });
          x += RESULT_COLUMNS[at + 1];
        });
      }

      // A failure or a concern says why, right under its own row.
      if (block.kind === "reason") {
        doc.rect(MARGIN, y, CONTENT, block.height).fillAndStroke("#ffffff", COLOURS.hair);
        doc.rect(MARGIN, y, 3, block.height).fill(tone.fill);
        doc
          .fillColor(COLOURS.inkSoft)
          .font("Helvetica")
          .fontSize(8.5)
          .text(block.text, MARGIN + 18, y + 4, { width: CONTENT - 40 });
      }

      y += block.height;
    }

    footer(doc, data);
  });
}

function corrections(doc: Doc, data: RcdReport, laid: Plan) {
  doc.addPage();
  sectionBar(doc, "Corrections Applied", MARGIN);

  let y = MARGIN + 46;
  doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
  doc.text(
    "The instrument records every fetch, including those taken without a device connected, and a way tested more than once leaves a record each time. The following was set aside before the results above were drawn up.",
    MARGIN,
    y,
    { width: CONTENT, lineGap: 2 },
  );
  y = doc.y + 16;

  const lines: [string, string][] = [
    ["Order worked", data.corrections.walk],
    [
      "Empty tests discarded",
      data.corrections.droppedEmpty.length
        ? `${data.corrections.droppedEmpty.length} (${data.corrections.droppedEmpty.join(", ")})`
        : "None",
    ],
    [
      "Repeat tests discarded",
      data.corrections.droppedDuplicate.length
        ? `${data.corrections.droppedDuplicate.length} (${data.corrections.droppedDuplicate.join(", ")})`
        : "None",
    ],
    [
      "Ways not tested",
      data.corrections.untested.length
        ? `${data.corrections.untested.length} (${data.corrections.untested.join(", ")})`
        : "None",
    ],
    ["Instrument", data.instrument ?? "—"],
  ];

  doc.fontSize(9.5);
  lines.forEach(([label, value], index) => {
    const height = Math.max(
      ROW_HEIGHT,
      doc.heightOfString(value, { width: CONTENT - 180 }) + 10,
    );
    doc
      .rect(MARGIN, y, CONTENT, height)
      .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").text(label, MARGIN + 8, y + 6, {
      width: 164,
    });
    doc.font("Helvetica").text(value, MARGIN + 180, y + 6, { width: CONTENT - 190 });
    y += height;
  });

  signOff(doc, y + 26);
  footer(doc, data);
}

/**
 * A page of its own, so the instrument's report cannot be missed when the
 * client flips through — and so it is obvious where ours stops and theirs
 * starts.
 */
function originalDivider(doc: Doc, data: RcdReport, pages: number) {
  doc.addPage();
  sectionBar(doc, "Original Instrument Report", MARGIN);

  let y = MARGIN + 52;
  doc.font("Helvetica-Bold").fontSize(15).fillColor(COLOURS.ink);
  doc.text(
    pages === 1
      ? "The page that follows is the test instrument's own report."
      : `The ${pages} pages that follow are the test instrument's own report.`,
    MARGIN,
    y,
    { width: CONTENT, lineGap: 2 },
  );
  y = doc.y + 16;

  doc.font("Helvetica").fontSize(11).fillColor(COLOURS.ink);
  doc.text(
    pages === 1
      ? "It is reproduced exactly as it was downloaded from the instrument and has not been edited, reformatted or re-typed in any way. Nothing in this report changes it."
      : "They are reproduced exactly as they were downloaded from the instrument and have not been edited, reformatted or re-typed in any way. Nothing in this report changes them.",
    MARGIN,
    y,
    { width: CONTENT, lineGap: 3 },
  );
  y = doc.y + 14;
  doc.text(
    `The same file is also attached to this PDF as \u201coriginal-instrument-report.pdf\u201d, so the instrument's own record can be extracted and checked against ${
      pages === 1 ? "this page" : "these pages"
    } independently.`,
    MARGIN,
    y,
    { width: CONTENT, lineGap: 3 },
  );
  y = doc.y + 26;

  doc.rect(MARGIN, y, CONTENT, 2).fill(COLOURS.accent);
  y += 18;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(COLOURS.inkSoft);
  doc.text(`Instrument: ${data.instrument ?? "—"}`, MARGIN, y, { width: CONTENT });

  footer(doc, data);
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
