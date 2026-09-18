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
    original: run.sourceFile ? await fileBytes(run.sourceFile.storedName) : null,
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
  const appended = data.original ? await countPages(data.original) : 0;

  // The results are grouped worst first, and the contents page cites the pages
  // they land on — so the layout is worked out before anything is drawn.
  const plan = planGroups(data);

  cover(doc, data);
  contents(doc, data, plan);
  basis(doc, data);
  results(doc, data, plan);
  corrections(doc, data);

  stampPageNumbers(doc, appended);
  doc.end();

  const ours = await done;
  return data.original ? await append(ours, data.original) : ours;
}

type Group = { verdict: Verdict; title: string; blurb: string; rows: RcdResultRow[]; page: number };

const ROW_HEIGHT = 22;
const GROUP_HEAD = 46;
const BOTTOM = PAGE.height - 82;

function planGroups(data: RcdReport): Group[] {
  const groups = GROUPS.map((group) => ({
    ...group,
    rows: data.results.filter((result) => result.verdict === group.verdict),
    page: 0,
  })).filter((group) => group.rows.length > 0);

  // Contents is page 2, the basis page 3, so results start on page 4.
  let page = 4;
  let y = MARGIN + 34;
  for (const group of groups) {
    const height = GROUP_HEAD + 20 + group.rows.length * ROW_HEIGHT;
    if (y > MARGIN + 34 && y + Math.min(height, 160) > BOTTOM) {
      page += 1;
      y = MARGIN;
    }
    group.page = page;
    y += height + 20;
    while (y > BOTTOM) {
      page += 1;
      y -= BOTTOM - MARGIN;
    }
  }
  return groups;
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

function contents(doc: Doc, data: RcdReport, groups: Group[]) {
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
  for (const group of groups) {
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

function results(doc: Doc, data: RcdReport, groups: Group[]) {
  doc.addPage();
  sectionBar(doc, "Test Results", MARGIN);
  let y = MARGIN + 34;

  const columns = [150, 60, 64, 64, 64, CONTENT - 150 - 252];

  for (const group of groups) {
    if (y + GROUP_HEAD + 20 + ROW_HEIGHT > BOTTOM) {
      footer(doc, data);
      doc.addPage();
      y = MARGIN;
    }

    const tone =
      group.verdict === "FAIL"
        ? SEVERITY.fail
        : group.verdict === "CONCERN"
          ? SEVERITY.concern
          : SEVERITY.pass;
    doc.rect(MARGIN, y, 5, 26).fill(tone.fill);
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(13);
    doc.text(`${group.title} — ${group.rows.length}`, MARGIN + 16, y + 5);
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text(group.blurb, MARGIN + 16, y + 21, { width: CONTENT - 20 });
    y += GROUP_HEAD;

    tableHead(doc, y, ["Circuit", "Rating", "× ½", "× 1", "× 5", "Touch V"], columns);
    y += 20;

    doc.fontSize(9);
    group.rows.forEach((row, index) => {
      if (y + ROW_HEIGHT > BOTTOM) {
        footer(doc, data);
        doc.addPage();
        y = MARGIN;
        tableHead(doc, y, ["Circuit", "Rating", "× ½", "× 1", "× 5", "Touch V"], columns);
        y += 20;
      }
      doc
        .rect(MARGIN, y, CONTENT, ROW_HEIGHT)
        .fillAndStroke(index % 2 ? COLOURS.soft : "#ffffff", COLOURS.hair);
      doc.fillColor(COLOURS.ink).font("Helvetica-Bold").text(row.label, MARGIN + 8, y + 6, {
        width: columns[0] - 12,
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
      let x = MARGIN + columns[0];
      cells.forEach((cell, at) => {
        doc.text(cell, x, y + 6, { width: columns[at + 1], align: "center" });
        x += columns[at + 1];
      });
      y += ROW_HEIGHT;

      // A failure or a concern says why, right under its own row.
      if (row.verdict !== "PASS") {
        for (const reason of row.reasons) {
          const height = doc.heightOfString(reason, { width: CONTENT - 40 }) + 7;
          doc.rect(MARGIN, y, CONTENT, height).fillAndStroke("#ffffff", COLOURS.hair);
          doc.rect(MARGIN, y, 3, height).fill(tone.fill);
          doc
            .fillColor(COLOURS.inkSoft)
            .font("Helvetica")
            .fontSize(8.5)
            .text(reason, MARGIN + 18, y + 4, { width: CONTENT - 40 });
          doc.fontSize(9);
          y += height;
        }
      }
    });
    y += 20;
  }

  footer(doc, data);
}

function corrections(doc: Doc, data: RcdReport) {
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

  y += 24;
  if (data.original) {
    sectionBar(doc, "Original Instrument Report", y);
    y += 32;
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
    doc.text(
      "The pages that follow are the test instrument's own export, reproduced exactly as it was downloaded and not edited in any way. The same file is also attached to this PDF, so the original can be extracted and checked independently.",
      MARGIN,
      y,
      { width: CONTENT, lineGap: 2 },
    );
    y = doc.y + 14;
  }

  signOff(doc, y + 10);
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
