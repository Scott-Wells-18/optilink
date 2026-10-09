import PDFDocument from "pdfkit";
import { PDFDocument as Lib } from "pdf-lib";
import { COLOURS, SEVERITY, longDate, safe, shortDate } from "@/lib/report/theme";
import { guarded, mastheadLines, ohmText, sectionBar, stampWideFeet, tableHead, type Doc, type PageMeta } from "@/lib/report/furniture";
import { equipmentPagesPortrait } from "@/lib/report/equipment";
import { fitted, stampCertificate, type Box, type Certificate, type Slot } from "@/lib/report/certificate";
import type { Instrument } from "@/lib/report/instrument";
import { MEASUREMENT_LABELS, resistanceReads, voltsLine, type Terminals } from "@/lib/install/parse";
import { PHASE_LABELS, type Phases } from "@/lib/install/points";
import {
  CATEGORIES,
  SECTION_LABELS,
  STATUS_LABELS,
  ref,
  slotLabel,
  pairOfLabel,
  type Analysis,
  type Group,
  type Rec,
  type Section,
  type TestFile,
} from "@/lib/install/session";

/**
 * The installation test report.
 *
 * What it says is bounded by what was verified. It opens with the Section 8
 * checklist — visual inspection and the six tests — and what each one's status
 * is, and it says the installation's verification is complete only when every
 * one of them is recorded or justified as not applicable. Three uploaded test
 * types are never presented as the whole of it.
 *
 * The results are tables, one per named group, each reading with its phase,
 * its terminals, its value and unit as the instrument wrote it, and the file
 * and S number it came from. There are no charts: these are a few readings a
 * group in three different units, and a table says it exactly. No pass or
 * fail threshold is drawn or implied that the instrument did not record.
 *
 * Every record set aside — a deliberate dummy, an accidental test, a repeat —
 * is listed in the appendix with its source and the reason, and every tester
 * file is reproduced at the back in the order the operator confirmed.
 */

/*
 * Read landscape, with its appendices portrait.
 *
 * The results are tables, and a table reads better across than down. The
 * certificate and the tester's own exports are A4 portrait documents, and keep
 * their own shape.
 */
const SHEET = { width: 841.89, height: 595.28 };
const MARGIN = 34;
const CONTENT = SHEET.width - MARGIN * 2;
const FLOOR = SHEET.height - 72;

/** The upright page the certificate and the instrument's export go on. */
const UPRIGHT = { width: 595.28, height: 841.89, margin: 42, top: 104, foot: 76 };
const UPRIGHT_CONTENT = UPRIGHT.width - UPRIGHT.margin * 2;

/** What a full-width bar spans on the landscape page. */
const SPAN = { x: MARGIN, width: CONTENT };

export type InstallReport = PageMeta & {
  reportDate: Date;
  testedOn: Date;
  phases: Phases;
  installation: string | null;
  circuitDetails: string | null;
  contactName: string | null;
  instrumentName: string | null;

  analysis: Analysis;
  /** The tester files, in the confirmed order, with their pages where they open. */
  files: (TestFile & { pages: Certificate | null; bytes: Buffer | null })[];

  /** What took the readings, with its calibration certificate. */
  instrument: Instrument | null;
};

export async function buildInstallReport(data: InstallReport): Promise<Buffer> {
  const doc = guarded(
    new PDFDocument({
      size: [SHEET.width, SHEET.height],
      margin: MARGIN,
      bufferPages: true,
    }),
  );
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  cover(doc, data);
  verification(doc, data);
  results(doc, data, "INSULATION");
  results(doc, data, "RCD");
  results(doc, data, "VOLTAGE");
  unresolved(doc, data);
  appendix(doc, data);

  /*
   * The pages that carry somebody else's document, all of them upright.
   *
   * The gaps are drawn here and the documents stamped into them afterwards,
   * because pdfkit cannot place a page of another PDF and pdf-lib cannot draw
   * the report.
   */
  const certificate = equipmentPagesPortrait(doc, data.instrument, (note) =>
    uprightHead(doc, data, "Equipment Used", note), UPRIGHT);
  const originals = data.files.map((file, at) => ({ file, slots: originalPages(doc, data, file, at) }));

  stampWideFeet(doc, data, {
    width: SHEET.width,
    height: SHEET.height,
    margin: MARGIN,
  });
  doc.end();

  let out = await done;
  for (const { file, slots } of originals) {
    if (file.pages && slots.length > 0) out = await stampCertificate(out, file.pages, slots);
  }
  if (data.instrument?.certificate && certificate.length > 0) {
    out = await stampCertificate(out, data.instrument.certificate, certificate);
  }
  return attachOriginals(out, data);
}

/* --- small helpers ---------------------------------------------------------- */

function head(doc: Doc, data: InstallReport, title: string): number {
  if (data.logo) doc.image(data.logo, MARGIN, 26, { fit: [104, 34] });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(title, MARGIN + 120, 32, { width: CONTENT - 120, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(safe([data.clientName, data.siteName].filter(Boolean).join("  ·  ")), MARGIN + 120, 48, {
    width: CONTENT - 120,
    lineBreak: false,
    ellipsis: true,
  });
  doc.rect(MARGIN, 66, CONTENT, 0.8).fill(COLOURS.hair);
  doc.y = 80;
  doc.fillColor(COLOURS.ink);
  return doc.y;
}

function room(doc: Doc, data: InstallReport, needed: number, title: string): number {
  if (doc.y + needed <= FLOOR) return doc.y;
  doc.addPage();
  return head(doc, data, title);
}

function rows(doc: Doc, data: InstallReport, pairs: [string, string][], title: string) {
  const labelWidth = 176;
  for (const [name, value] of pairs) {
    doc.font("Helvetica-Bold").fontSize(9);
    const height = Math.max(
      18,
      doc.heightOfString(safe(value) || "—", {
        width: CONTENT - labelWidth - 4,
        lineGap: 1.4,
      }) + 9,
    );
    const y = room(doc, data, height + 4, title);
    doc.rect(MARGIN, y, CONTENT, 0.5).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9);
    doc.text(name, MARGIN + 2, y + 5, { width: labelWidth - 8 });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9);
    doc.text(safe(value) || "—", MARGIN + labelWidth, y + 5, {
      width: CONTENT - labelWidth - 4,
      lineGap: 1.4,
    });
    doc.y = y + height;
  }
  doc.rect(MARGIN, doc.y, CONTENT, 0.5).fill(COLOURS.hair);
  doc.y += 12;
  doc.fillColor(COLOURS.ink);
}

function note(doc: Doc, text: string, size = 8.5) {
  doc.font("Helvetica").fontSize(size).fillColor(COLOURS.inkSoft);
  doc.text(safe(text), MARGIN, doc.y, { width: CONTENT, lineGap: 1.6 });
  doc.y += 10;
  doc.fillColor(COLOURS.ink);
}


/* --- a table that wraps --------------------------------------------------------- */

type Tone = "normal" | "missing" | "flag" | "muted";
type Row = { cells: string[]; tone?: Tone; bold?: number[] };

/**
 * A table whose rows grow to fit their longest cell, and whose head repeats
 * when it runs onto a new page. A cell that carries an ohm sign is drawn with
 * the font that can print one.
 */
function table(
  doc: Doc,
  data: InstallReport,
  title: string,
  heads: string[],
  widths: number[],
  body: Row[],
) {
  const scale = CONTENT / widths.reduce((total, width) => total + width, 0);
  const columns = widths.map((width) => width * scale);
  const drawHead = () => {
    const y = doc.y;
    tableHead(doc, y, heads, columns);
    doc.y = y + 20;
  };
  if (doc.y + 44 > FLOOR) {
    doc.addPage();
    head(doc, data, title);
  }
  drawHead();

  body.forEach((row, index) => {
    const height = Math.max(
      20,
      ...row.cells.map((cell, at) => {
        doc.font(row.bold?.includes(at) ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
        return doc.heightOfString(safe(cell) || "—", { width: columns[at] - 8, lineGap: 1.2 }) + 10;
      }),
    );
    if (doc.y + height > FLOOR) {
      doc.addPage();
      head(doc, data, title);
      drawHead();
    }
    const y = doc.y;
    if (index % 2 === 1) doc.rect(MARGIN, y, CONTENT, height).fill(COLOURS.soft);
    if (row.tone === "missing" || row.tone === "flag") {
      doc.rect(MARGIN, y, 3, height).fill(row.tone === "missing" ? SEVERITY.concern.fill : SEVERITY.fail.fill);
    }
    doc.rect(MARGIN, y + height, CONTENT, 0.5).fill(COLOURS.hair);

    let x = MARGIN;
    row.cells.forEach((cell, at) => {
      const bold = row.bold?.includes(at);
      const colour =
        row.tone === "missing" && at > 0
          ? SEVERITY.concern.fill
          : row.tone === "muted"
            ? COLOURS.inkSoft
            : COLOURS.ink;
      if (cell.includes("Ω")) {
        doc.fillColor(colour);
        ohmText(doc, cell, x + 4, y + 5, {
          width: columns[at] - 8,
          size: 8.5,
          font: bold ? "Helvetica-Bold" : "Helvetica",
        });
      } else {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(colour);
        doc.text(safe(cell) || "—", x + 4, y + 5, { width: columns[at] - 8, lineGap: 1.2 });
      }
      x += columns[at];
    });
    doc.y = y + height;
    doc.fillColor(COLOURS.ink);
  });
  doc.y += 12;
}

function subhead(doc: Doc, data: InstallReport, text: string, title: string, sub?: string, rows = 2) {
  // Kept with its table where the table is short enough to keep together.
  const y = room(doc, data, Math.min(330, 60 + rows * 21), title);
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLOURS.ink);
  doc.text(safe(text), MARGIN, y, { width: CONTENT });
  doc.y = y + 15;
  if (sub) {
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(sub), MARGIN, doc.y, { width: CONTENT, lineGap: 1.2 });
    doc.y += 6;
  }
  doc.fillColor(COLOURS.ink);
}

/** "File 2 (reconnect.pdf) · S_4 · #3" — where a reading came from. */
function source(record: Rec): string {
  return `File ${record.fileNo} · ${record.name}${record.seq ? `  (W${record.seq})` : ""}`;
}

/* --- the verification checklist ------------------------------------------------- */

function verification(doc: Doc, data: InstallReport) {
  const title = "Verification summary";
  doc.addPage();
  head(doc, data, title);
  {
    const top = doc.y;
    sectionBar(doc, "Verification — AS/NZS 3000 Section 8", top, SPAN);
    doc.y = top + 32;
  }

  const { analysis } = data;
  const sections = analysis.sections;
  const body: Row[] = CATEGORIES.map((category) => {
    const entry = analysis.verification[category.key];
    const tester = category.section ? sections[category.section].accepted.length : 0;
    const groups = category.section ? sections[category.section].groups.length : 0;
    const parts: string[] = [];
    if (category.section && tester > 0) {
      parts.push(
        `${tester} tester ${tester === 1 ? "record" : "records"} in ${groups} ${groups === 1 ? "group" : "groups"} — see ${SECTION_LABELS[category.section]}.`,
      );
    }
    if (category.key === "POLARITY" && tester > 0) {
      parts.push("Voltage readings support but do not by themselves verify polarity.");
    }
    if (entry.evidence) parts.push(entry.evidence);
    if (entry.reason) parts.push(`Reason: ${entry.reason}`);
    const status = entry.selected ? STATUS_LABELS[entry.status] : "Not covered by this report";
    const settled = entry.selected && (entry.status === "RECORDED" || (entry.status === "NOT_APPLICABLE" && entry.reason));
    return {
      cells: [category.label, category.clause, status, parts.join("  ") || "—"],
      tone: settled ? "normal" : "missing",
      bold: [0, 2],
    };
  });
  table(doc, data, title, ["Category", "Clause", "Status", "Record, evidence or reason"], [190, 50, 110, 420], body);

  const open = CATEGORIES.filter((category) => {
    const entry = analysis.verification[category.key];
    return !(entry.selected && (entry.status === "RECORDED" || (entry.status === "NOT_APPLICABLE" && entry.reason)));
  });
  const blocking = analysis.issues.filter((issue) => issue.blocking).length;

  const y = doc.y;
  const statement = analysis.complete
    ? "Every verification category above is recorded or justified as not applicable, and no result is left unresolved."
    : `Installation verification is not complete. ${
        open.length > 0
          ? `${open.length} of ${CATEGORIES.length} categories ${open.length === 1 ? "is" : "are"} pending, not performed or not covered by this report (${open.map((category) => category.label.toLowerCase()).join(", ")}).`
          : ""
      }${blocking > 0 ? ` ${blocking} ${blocking === 1 ? "result is" : "results are"} unresolved — see Unresolved results.` : ""}`;
  doc.font("Helvetica-Bold").fontSize(9.5);
  const tall = doc.heightOfString(safe(statement), { width: CONTENT - 16, lineGap: 1.4 }) + 12;
  doc.rect(MARGIN, y, 3, tall).fill(analysis.complete ? SEVERITY.pass.fill : SEVERITY.concern.fill);
  doc.fillColor(COLOURS.ink).text(safe(statement), MARGIN + 12, y + 5, { width: CONTENT - 16, lineGap: 1.4 });
  doc.y = y + tall + 10;

  note(
    doc,
    "Clause references are to AS/NZS 3000:2018 Section 8 and are given for identification; confirm " +
      "them against the edition and amendments in force. This report records what was measured and " +
      "states each category's status. It does not set or imply pass or fail limits beyond those the " +
      "instrument recorded, and it is not a certificate of compliance.",
    8,
  );

  note(
    doc,
    "Voltage readings — readings between L–PE, L–N and N–PE show the voltage present between those " +
      "terminals at the time of testing. Close-to-nominal L–PE and L–N readings with a low N–PE reading " +
      "are consistent with the expected relationships; on their own they do not confirm polarity or " +
      "correct circuit connections, and they apply only to the points tested.",
    8,
  );
  note(
    doc,
    "Insulation resistance — a result shown with “>” exceeded the instrument’s displayed range and is " +
      "kept as recorded rather than as an exact value. Each reading is shown against the terminals in " +
      "the selected test arrangement.",
    8,
  );
  note(
    doc,
    "RCD — each AUTO record is one sequence on one phase: half, one and five times rated residual " +
      "current at 0° and 180°. A three-phase device has a sequence per phase; the number of tests does " +
      "not describe the device’s width on the board. Trip times are assessed against the applicable " +
      "limits in the separate RCD report.",
    8,
  );
}

/* --- the results, a section at a time -------------------------------------------- */

const NOT_RECORDED = "NOT RECORDED";

function results(doc: Doc, data: InstallReport, section: Section) {
  const result = data.analysis.sections[section];
  if (result.files.length === 0 && result.accepted.length === 0) return;

  const title = SECTION_LABELS[section];
  if (doc.y > FLOOR - 160 || section === "INSULATION" || result.groups.length > 1) {
    doc.addPage();
    head(doc, data, title);
  } else {
    doc.y += 8;
  }
  {
    const top = doc.y;
    sectionBar(doc, title, top, SPAN);
    doc.y = top + 30;
  }

  const files = result.files
    .map(({ file, count, accepted }) => `${file.originalName} (${accepted} of ${count} accepted)`)
    .join("  ·  ");
  note(doc, `From ${result.files.length} ${result.files.length === 1 ? "file" : "files"}: ${files || "none"}.`, 8);

  if (result.groups.length === 0) {
    note(doc, "No accepted records in this section.", 9.5);
    return;
  }

  for (const group of result.groups) {
    const name = group.name || `Group ${group.index + 1}`;
    subhead(
      doc,
      data,
      `${group.index + 1}.  ${name}`,
      title,
      group.complete ? undefined : `Incomplete — missing ${group.missing.join(", ") || "none"}${group.extras.length ? `; ${group.extras.length} record(s) fit no slot` : ""}.`,
      group.slots.length,
    );
    if (section === "INSULATION") insulationTable(doc, data, group, title);
    if (section === "VOLTAGE") voltageTable(doc, data, group, title);
    if (section === "RCD") rcdTable(doc, data, group, title);
    if (group.extras.length > 0) {
      table(
        doc,
        data,
        title,
        ["Record", "Recorded", "Why it was not placed"],
        [150, 300, 320],
        group.extras.map((extra) => ({
          cells: [source(extra.record), recorded(extra.record), extra.why],
          tone: "flag",
        })),
      );
    }
  }

  if (result.unplaced.length > 0) {
    subhead(doc, data, "Accepted but not placed", title, "No terminal pair was recorded on these.");
    table(
      doc,
      data,
      title,
      ["Record", "Recorded"],
      [150, 620],
      result.unplaced.map((record) => ({ cells: [source(record), recorded(record)], tone: "flag" })),
    );
  }
}

function flagText(record: Rec | null): string {
  if (!record) return "";
  const flags = record.flags.map((flag) => flag.text);
  if (record.mark?.mark === "GENUINE" && flags.length > 0) flags.push("Confirmed genuine.");
  return flags.join(" ");
}

function insulationTable(doc: Doc, data: InstallReport, group: Group, title: string) {
  table(
    doc,
    data,
    title,
    ["Phase", "Terminals", "Resistance", "Test voltage", "Source", "Notes"],
    [120, 90, 100, 80, 150, 230],
    group.slots.map((slot) => {
      const record = slot.record;
      if (!record) {
        return { cells: [slot.phase, slot.label, NOT_RECORDED, "", "", ""], tone: "missing" };
      }
      return {
        cells: [
          slot.phase,
          `${slot.label}${record.pairText && record.pairText !== slot.label ? ` (recorded ${record.pairText})` : ""}`,
          resistanceReads(record),
          record.terminalVolts === null ? "—" : `${record.terminalVolts} V`,
          source(record),
          [flagText(record), slot.mismatch ?? ""].filter(Boolean).join(" "),
        ],
        tone: record.flags.some((flag) => flag.failureLike) || slot.mismatch ? "flag" : "normal",
        bold: [2],
      };
    }),
  );
}

function voltageTable(doc: Doc, data: InstallReport, group: Group, title: string) {
  table(
    doc,
    data,
    title,
    ["Phase", "Terminals", "Voltage", "Frequency", "Source", "Instrument line / notes"],
    [60, 80, 80, 70, 150, 330],
    group.slots.map((slot) => {
      const record = slot.record;
      const pair = pairOfLabel(slot.label) as Terminals | null;
      const terminals = slotLabel(slot.phase, slot.label);
      if (!record) return { cells: [slot.phase, terminals, NOT_RECORDED, "", "", ""], tone: "missing" };
      const value = pair ? record.readings[pair] : undefined;
      return {
        cells: [
          slot.phase,
          terminals,
          value === undefined ? "—" : `${value} V`,
          record.hertz === null ? "—" : `${record.hertz} Hz`,
          source(record),
          [voltsLine(record), flagText(record)].filter(Boolean).join("  —  "),
        ],
        tone: record.flags.some((flag) => flag.failureLike) ? "flag" : "normal",
        bold: [2],
      };
    }),
  );
}

function trip(reading: number | "NO_TRIP" | null | undefined): string {
  if (reading === "NO_TRIP") return "No trip";
  if (reading === null || reading === undefined) return "---";
  return `${reading} ms`;
}

function rcdTable(doc: Doc, data: InstallReport, group: Group, title: string) {
  table(
    doc,
    data,
    title,
    ["Phase", "Setting", "×½ 0° / 180°", "×1 0° / 180°", "×5 0° / 180°", "Touch V", "Source", "Notes"],
    [60, 80, 110, 90, 90, 60, 120, 160],
    group.slots.map((slot) => {
      const record = slot.record;
      const test = record?.rcd;
      if (!record || !test) {
        return { cells: [slot.phase, NOT_RECORDED, "", "", "", "", record ? source(record) : "", ""], tone: "missing" };
      }
      return {
        cells: [
          slot.phase,
          [test.ratingMa ? `${test.ratingMa} mA` : null, test.waveform ? `Type ${test.waveform}${test.selective ? " S" : ""}` : null]
            .filter(Boolean)
            .join(", ") || "—",
          `${trip(test.halfAt0)} / ${trip(test.halfAt180)}`,
          `${trip(test.ratedAt0)} / ${trip(test.ratedAt180)}`,
          `${trip(test.fiveAt0)} / ${trip(test.fiveAt180)}`,
          test.touchVolts === null ? "—" : `${test.touchVolts} V`,
          source(record),
          flagText(record),
        ],
        tone: record.flags.some((flag) => flag.failureLike) ? "flag" : "normal",
      };
    }),
  );
}

/** The record as the instrument wrote it. */
function recorded(record: Rec): string {
  return [record.rawFunction, record.rawParameters, record.rawResult].filter(Boolean).join("  ·  ");
}

/* --- what is not settled ---------------------------------------------------------- */

function unresolved(doc: Doc, data: InstallReport) {
  const issues = data.analysis.issues;
  if (issues.length === 0) return;
  const title = "Unresolved results";
  doc.addPage();
  head(doc, data, title);
  {
    const top = doc.y;
    sectionBar(doc, "Unresolved and flagged results", top, SPAN);
    doc.y = top + 30;
  }
  note(
    doc,
    "Unresolved items are missing readings, readings that fit no slot, and decisions still to be made. " +
      "Flagged items are readings worth a second look; they stay in the results unless confirmed " +
      "otherwise. Nothing listed here has been removed.",
    8.5,
  );
  const byId = new Map(data.analysis.records.map((record) => [record.id, record]));
  table(
    doc,
    data,
    title,
    ["", "Item", "Detail", "Records"],
    [70, 230, 360, 110],
    issues.map((issue) => ({
      cells: [
        issue.blocking ? "Unresolved" : "Flagged",
        issue.title,
        issue.detail,
        issue.records.map((id) => (byId.get(id) ? ref(byId.get(id) as Rec) : id)).join(", "),
      ],
      tone: issue.blocking ? "missing" : "normal",
      bold: [0, 1],
    })),
  );
}

/* --- the appendix: records set aside, and the files ------------------------------ */

function appendix(doc: Doc, data: InstallReport) {
  const title = "Records set aside and source files";
  doc.addPage();
  head(doc, data, title);
  {
    const top = doc.y;
    sectionBar(doc, "Accidental, duplicate and dummy tests", top, SPAN);
    doc.y = top + 30;
  }

  const out = [...data.analysis.excluded, ...data.analysis.held];
  if (out.length === 0) {
    note(doc, "No records were set aside.", 9.5);
  } else {
    note(
      doc,
      "These records were recorded by the instrument and are not in the results. They have not been " +
        "deleted: each is listed with the file it came from, its original S number and position, and " +
        "the reason, and each appears in its tester file reproduced at the back of this report.",
      8.5,
    );
    table(
      doc,
      data,
      title,
      ["Source", "Measurement", "As recorded", "Taken", "Reason"],
      [150, 90, 290, 80, 160],
      out.map((record) => ({
        cells: [
          `${ref(record)} (#${record.position})\n${record.fileName}`,
          MEASUREMENT_LABELS[record.kind],
          recorded(record),
          taken(record),
          `${record.why ?? ""}${record.mark?.confirmedFailure ? " (confirmed by the operator despite a failure-like reading)" : ""}`,
        ],
        tone: record.state === "HELD" ? "missing" : "muted",
      })),
    );
  }

  const y = room(doc, data, 90, title);
  sectionBar(doc, "Tester files, in the order used", y, SPAN);
  doc.y = y + 30;
  table(
    doc,
    data,
    title,
    ["#", "File", "Section", "Records", "First record"],
    [40, 300, 170, 80, 180],
    data.files.map((file, at) => ({
      cells: [
        String(at + 1),
        file.originalName,
        file.section === "MIXED" ? "Mixed (single export)" : SECTION_LABELS[file.section],
        String(file.rows.length),
        file.excludeFirst ? `${file.rows[0]?.name ?? "—"} set aside as a dummy` : "Counted",
      ],
    })),
  );
  note(
    doc,
    "S numbers restart in each file, so a record is identified by its file and S number together. " +
      "W numbers are the continuous working sequence of accepted records within each section.",
    8,
  );
}

function taken(record: Rec): string {
  if (!record.takenAt) return "—";
  const at = record.takenAt instanceof Date ? record.takenAt : new Date(record.takenAt);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toISOString().slice(0, 19).replace("T", " ");
}

/* --- the cover --------------------------------------------------------------- */

function cover(doc: Doc, data: InstallReport) {
  if (data.logo) doc.image(data.logo, MARGIN, 36, { fit: [136, 44] });
  mastheadLines(doc, MARGIN + 250, 36, CONTENT - 250);

  let y = 126;
  doc.rect(MARGIN, y, 4, 48).fill(COLOURS.accent);
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(9);
  doc.text("INSTALLATION TESTING", MARGIN + 16, y + 2, { characterSpacing: 1.6 });
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(21);
  doc.text("Installation Test Report", MARGIN + 16, y + 16, { width: CONTENT - 16 });

  y = 188;
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.bar);
  doc.text("PREPARED FOR", MARGIN, y, { characterSpacing: 1.2 });
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(15);
  doc.text(safe(data.clientName), MARGIN, y + 14, { width: CONTENT });
  doc.font("Helvetica").fontSize(10.5).fillColor(COLOURS.bar);
  doc.text(safe(data.siteName), MARGIN, y + 34, { width: CONTENT });
  if (data.siteLocation) {
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.inkSoft);
    doc.text(safe(data.siteLocation), MARGIN, y + 49, { width: CONTENT });
  }

  doc.y = y + 70;
  const { analysis } = data;
  const accepted = analysis.records.filter((record) => record.state === "ACCEPTED").length;
  const counted = (section: "INSULATION" | "RCD" | "VOLTAGE") => {
    const result = analysis.sections[section];
    return `${result.accepted.length} in ${result.groups.length} ${result.groups.length === 1 ? "group" : "groups"}`;
  };
  const open = CATEGORIES.filter((category) => {
    const entry = analysis.verification[category.key];
    return !(entry.selected && (entry.status === "RECORDED" || (entry.status === "NOT_APPLICABLE" && entry.reason)));
  }).length;

  rows(
    doc,
    data,
    [
      ["Installation / circuit", data.installation ?? ""],
      ["Switchboard and circuit", data.circuitDetails ?? ""],
      ["Supply", PHASE_LABELS[data.phases]],
      ["Tested on", shortDate(data.testedOn)],
      ["Report date", longDate(data.reportDate)],
      ["Prepared for", data.contactName ?? ""],
      ["Instrument", data.instrumentName ?? ""],
      [
        "Tester records",
        `${analysis.records.length} read from ${data.files.length} ${data.files.length === 1 ? "file" : "files"}, ` +
          `${accepted} accepted, ${analysis.excluded.length + analysis.held.length} set aside or held  ·  ` +
          `insulation ${counted("INSULATION")}, RCD ${counted("RCD")}, voltage ${counted("VOLTAGE")}`,
      ],
      [
        "Verification",
        analysis.complete
          ? "All seven categories recorded or justified not applicable"
          : `Not complete — ${open} of ${CATEGORIES.length} categories open` +
            (analysis.issues.some((issue) => issue.blocking) ? ", with unresolved results" : ""),
      ],
    ],
    "Installation Test Report",
  );

  /*
   * The closing line, kept on the cover.
   *
   * It used to be dropped near the foot of the page whatever was above it, so
   * a cover with a long installation description and a note about the records
   * pushed it past the bottom — and the second half of one sentence took a
   * page of its own with nothing else on it. It is measured and placed where
   * it fits: low on the page when there is room, straight under what is above
   * it when there is not.
   */
  const closing =
    "This report sets out the readings the test instrument recorded on the date shown, at the points " +
    "listed inside. It states what was measured. It is not a certificate of compliance for the " +
    "installation, and the limitations inside form part of it.";
  /*
   * Low on the page, but never above what is already drawn there, and never
   * past the bottom of it.
   *
   * Capping it at the last line that fits put it back up the page when the
   * details ran long, straight through the note about the records — the two
   * were drawn over each other. So what is already on the page is the floor,
   * sitting low is only the preference, and when a long installation
   * description and a note have taken the room, the line is set a little
   * smaller rather than being pushed off the page.
   */
  const topOf = (tall: number) =>
    Math.max(doc.y + 6, Math.min(SHEET.height - MARGIN - 110, FLOOR - tall));
  let size = 8.5;
  let tall = 0;
  let top = 0;
  for (;;) {
    doc.font("Helvetica").fontSize(size);
    tall = doc.heightOfString(safe(closing), { width: CONTENT, lineGap: 1.6 });
    top = topOf(tall);
    if (top + tall <= FLOOR || size <= 7) break;
    size -= 0.25;
  }
  doc.y = top;
  note(doc, closing, size);
}

/* --- the instrument's own export, reproduced ------------------------------- */

/** The heading on an upright page, which is a narrower page than the rest. */
function uprightHead(doc: Doc, data: InstallReport, title: string, note?: string) {
  const { margin } = UPRIGHT;
  if (data.logo) doc.image(data.logo, margin, 26, { fit: [104, 34] });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(title, margin + 120, 32, {
    width: UPRIGHT_CONTENT - 120,
    lineBreak: false,
    ellipsis: true,
  });
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(note ?? [data.clientName, data.siteName].filter(Boolean).join("  ·  ")),
    margin + 120,
    48,
    { width: UPRIGHT_CONTENT - 120, lineBreak: false, ellipsis: true },
  );
  doc.rect(margin, 66, UPRIGHT_CONTENT, 0.8).fill(COLOURS.hair);
  doc.fillColor(COLOURS.ink);
}

/** How a borrowed page is set in from its blue rule, and the rule from it. */
const BORDER_GAP = 5;
const BORDER_WIDTH = 1.4;

/**
 * The gaps the tester's own export is stamped into, two to an upright page.
 *
 * Reproduced rather than appended. An appended page is the instrument's page
 * with our page numbers running off the end of it; a reproduced one sits on
 * our page, inside an Optilink rule, captioned with which page of theirs it
 * is — the same way the RCD report carries a board's export. The untouched
 * file still goes along as an attachment, so nothing is lost by it.
 */
function originalPages(
  doc: Doc,
  data: InstallReport,
  file: InstallReport["files"][number],
  number: number,
): Slot[] {
  const sizes = file.pages?.sizes ?? [];
  if (sizes.length === 0) return [];

  const slots: Slot[] = [];
  const perPage = 2;

  for (let from = 0; from < sizes.length; from += perPage) {
    const chunk = sizes.slice(from, from + perPage);
    doc.addPage({ size: [UPRIGHT.width, UPRIGHT.height], margin: UPRIGHT.margin });
    uprightHead(
      doc,
      data,
      `Original Tester File ${number + 1} of ${data.files.length}`,
      `${file.originalName} — ${file.section === "MIXED" ? "single export" : SECTION_LABELS[file.section]}, reproduced unaltered.`,
    );

    const page = doc.bufferedPageRange().count - 1;
    const region: Box = {
      x: UPRIGHT.margin,
      y: UPRIGHT.top,
      width: UPRIGHT_CONTENT,
      height: UPRIGHT.height - UPRIGHT.foot - UPRIGHT.top,
    };
    const gap = 16;
    const share = (region.width - gap * (chunk.length - 1)) / chunk.length;

    chunk.forEach((size, at) => {
      const inset = BORDER_GAP + BORDER_WIDTH + 2;
      const box = fitted(
        {
          x: region.x + at * (share + gap) + inset,
          y: region.y + inset,
          width: share - inset * 2,
          height: region.height - inset * 2 - 12,
        },
        size,
      );

      // A hairline on the page's own edge, so a white export has a definite
      // boundary; the blue rule sits outside it rather than on top of it, so a
      // document that has a border of its own keeps it.
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
      doc.text(
        `PAGE ${from + at + 1} OF ${sizes.length}`,
        box.x - BORDER_GAP,
        box.y + box.height + BORDER_GAP + 5,
        { width: box.width + BORDER_GAP * 2, align: "center", characterSpacing: 1.1 },
      );
      doc.fillColor(COLOURS.ink);

      slots.push({ ...box, page, source: from + at });
    });
  }

  return slots;
}

/**
 * The originals, attached whole as well as reproduced.
 *
 * A page reproduced on our paper is readable; the file itself is the evidence.
 * Both go in, so the report can be read and the original pulled out of it.
 */
async function attachOriginals(ours: Buffer, data: InstallReport): Promise<Buffer> {
  const files = data.files.filter((file) => file.bytes);
  if (files.length === 0 && !data.instrument?.certificate) return ours;

  try {
    const target = await Lib.load(ours);
    for (const [at, file] of files.entries()) {
      await target.attach(new Uint8Array(file.bytes as Buffer), `${at + 1}-${file.originalName}`, {
        mimeType: "application/pdf",
        description: "A test instrument export, unaltered.",
      });
    }
    if (data.instrument?.certificate) {
      await target.attach(
        new Uint8Array(data.instrument.certificate.bytes),
        "calibration-certificate.pdf",
        {
          mimeType: "application/pdf",
          description: "The instrument's calibration certificate, as issued.",
        },
      );
    }
    return Buffer.from(await target.save());
  } catch {
    // A report without its attachments is still a report; one that failed to
    // build is not.
    return ours;
  }
}

export function installFileName(data: InstallReport): string {
  return `Installation Test - ${data.clientName} - ${data.testedOn
    .toISOString()
    .slice(0, 10)}.pdf`;
}
