import PDFDocument from "pdfkit";
import { COMPANY, reportBy } from "@/lib/company";
import { PRIORITY_BANDS, printColours, priorityLabel } from "@/lib/priority";
import type { ReportData, ReportFinding } from "@/lib/report/data";

/**
 * The thermographic report, laid out to the shape the trade expects: a cover,
 * the survey notes, the terms the severity bands come from, a table of what
 * was found, a page per finding, and the plant list.
 *
 * Drawn rather than templated — a PDF library keeps this working on a server
 * with no browser, which is what Railway gives us.
 */

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const CONTENT = PAGE.width - MARGIN * 2;

const INK = "#111111";
const HEAD = "#3b3b7a";
const HEAD_INK = "#ffffff";
const BAND = "#a8dbe8";
const HAIR = "#3b3b7a";
const SOFT = "#f1f1f6";
const RED = "#d81f26";

type Doc = PDFKit.PDFDocument;

export function buildReport(data: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  cover(doc, data);
  surveyNotes(doc, data);
  terms(doc, data);
  abnormalities(doc, data);
  for (const finding of data.findings) findingPage(doc, data, finding);
  plantInspected(doc, data);

  stampPageNumbers(doc);
  doc.end();
  return done;
}

/* --- the cover ------------------------------------------------------------ */

function cover(doc: Doc, data: ReportData) {
  if (data.logo) {
    doc.image(data.logo, MARGIN + 100, 46, { fit: [CONTENT - 200, 92], align: "center" });
  }

  let y = 178;
  const titleHeight = 128;
  doc.rect(MARGIN, y, CONTENT, titleHeight).fillAndStroke(BAND, INK);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(17);
  doc.text("Thermographic and Preventive Maintenance Report", MARGIN, y + 16, {
    width: CONTENT,
    align: "center",
  });
  doc.font("Helvetica").fontSize(10);
  doc.text("For", MARGIN, y + 42, { width: CONTENT, align: "center" });
  doc.font("Helvetica-Bold").fontSize(15);
  doc.text(data.clientName, MARGIN, y + 60, { width: CONTENT, align: "center" });
  doc.fontSize(10.5);
  doc.text(data.siteLocation || data.siteName, MARGIN, y + 88, {
    width: CONTENT,
    align: "center",
  });

  y += titleHeight + 34;
  doc.font("Helvetica-Oblique").fontSize(10).fillColor(INK);
  doc.text("Inspection Date:", MARGIN, y, { width: CONTENT, align: "center" });
  doc.font("Helvetica-Bold").fontSize(10.5);
  doc.text(shortDate(data.inspectionDate), MARGIN, y + 15, { width: CONTENT, align: "center" });

  // The scope grows with the site, so the block sizes itself to the list.
  y += 48;
  const scope = data.scope.length ? data.scope.join(", ") : "Electrical switchboards and equipment";
  doc.font("Helvetica-Bold").fontSize(12.5);
  const scopeHeight = Math.max(
    50,
    doc.heightOfString(scope, { width: CONTENT - 36, align: "center" }) + 26,
  );
  doc.rect(MARGIN, y, CONTENT, scopeHeight).fillAndStroke(BAND, INK);
  doc.fillColor(INK).text(scope, MARGIN + 18, y + 13, { width: CONTENT - 36, align: "center" });

  y += scopeHeight + 40;
  const rows: [string, string][] = [
    ["Prepared for:", data.contactName ?? data.clientName],
    ["Report Date:", shortDate(data.reportDate)],
    ["Next Survey Due:", shortDate(data.nextSurveyDue)],
    ["Survey/Report By:", reportBy()],
  ];
  doc.fontSize(10);
  rows.forEach(([label, value], index) => {
    const rowY = y + index * 30;
    doc.font("Helvetica").fillColor(INK).text(label, MARGIN, rowY, { width: 120 });
    doc.text(value, MARGIN + 130, rowY, { width: 250 });
  });

  const rightX = MARGIN + CONTENT - 190;
  const details = [
    COMPANY.name,
    `ABN: ${COMPANY.abn}`,
    "",
    COMPANY.addressLine1,
    COMPANY.addressLine2,
    "",
    `P: ${COMPANY.phone}`,
    COMPANY.email,
  ];
  doc.font("Helvetica").fontSize(9.5).fillColor(INK);
  details.forEach((line, index) => {
    doc.text(line, rightX, y + index * 13, { width: 190, align: "center" });
  });

  const badgeY = y + 150;
  if (data.badge) doc.image(data.badge, MARGIN + 10, badgeY, { fit: [118, 118] });
  if (data.auspta) {
    doc.image(data.auspta, MARGIN + CONTENT - 128, badgeY, { fit: [118, 118] });
  }
}

/* --- survey notes --------------------------------------------------------- */

function surveyNotes(doc: Doc, data: ReportData) {
  doc.addPage();
  sectionBar(doc, "Survey Notes", MARGIN);

  const where = data.siteLocation ? `${data.siteName}, ${data.siteLocation}` : data.siteName;
  const paragraphs = [
    `This thermographic survey and report was conducted for ${data.clientName} at ${where} on ${longDate(data.inspectionDate)}.`,
    "All equipment on the site that was operating at the time of the survey was inspected, and the results are documented in the following report pages. The equipment inspected is listed in the plant inspected page at the rear of this report.",
    `The report indicates thermal abnormalities and visual observations identified during the survey. ${
      data.findings.length
        ? "These identified issues will require an inspection by your electrical maintenance staff, who will determine if and what action is required."
        : "No thermal abnormalities were identified during this survey."
    }`,
    "Other equipment surveyed at the site had no thermal abnormalities in the equipment or its connections.",
    "Regular thermographic inspections are an invaluable preventative maintenance tool. We would recommend that a further infrared inspection on this equipment be conducted within twelve months. If you have any queries regarding this report please do not hesitate to contact the writer at any time.",
  ];

  let y = MARGIN + 46;
  doc.font("Helvetica").fontSize(10.5).fillColor(INK);
  for (const paragraph of paragraphs) {
    doc.text(paragraph, MARGIN, y, { width: CONTENT, align: "left", lineGap: 2.5 });
    y = doc.y + 12;
  }

  y += 40;
  doc.font("Helvetica").fontSize(11).text("……………………………………………", MARGIN, y);
  doc.font("Helvetica-Bold").fontSize(11).text(THERMOGRAPHER_NAME, MARGIN, y + 22);
  doc.font("Helvetica").fontSize(10).text(THERMOGRAPHER_LINE, MARGIN, y + 38);

  footer(doc, data);
}

const THERMOGRAPHER_NAME = reportBy().split(" (")[0];
const THERMOGRAPHER_LINE = `${reportBy().split(" (")[1]?.replace(/\)$/, "") ?? ""}`;

/* --- terms and the severity bands ---------------------------------------- */

function terms(doc: Doc, data: ReportData) {
  doc.addPage();
  sectionBar(doc, "Report Guidelines — General", MARGIN);

  let y = MARGIN + 46;
  doc.font("Helvetica").fontSize(9.5).fillColor(INK);
  const guidelines = [
    'This report has been prepared in accordance with the "Standard for Infrared Inspections of Electrical Systems and Rotating Equipment", Infraspection Institute. The delta T (temperature difference) criteria applied to evaluate the temperature severity of an exception is the experience-based criteria for electrical and mechanical equipment.',
    `${COMPANY.name} cannot survey equipment which is not operating during the inspection period, equipment that is interlocked, or switchboards covered by plastic or acrylic.`,
    "This qualitative report is designed to caution against temperature anomalies that may indicate the possible deterioration or failure of a component or system. It is not a guarantee against failure, nor a quantitative measure of deterioration or malfunction. It is the responsibility of the end user to resolve the diagnosis and determine any corrective measures.",
  ];
  for (const paragraph of guidelines) {
    doc.text(paragraph, MARGIN, y, { width: CONTENT, lineGap: 2 });
    y = doc.y + 10;
  }

  y += 8;
  sectionBar(doc, "Terms and Definitions", y);
  y += 30;
  const definitions: [string, string][] = [
    [
      "Thermography",
      "The collection and analysis of radiated energy in the infrared portion of the electromagnetic spectrum using a thermal imaging camera.",
    ],
    [
      "Thermogram",
      "An image produced by the thermal imaging camera, representing levels of radiated energy from the scene viewed, displayed in a colour palette.",
    ],
    [
      "Temperature difference (Delta T)",
      "The apparent temperature rise of the exception above the apparent temperature of a defined reference — typically a similar component under the same conditions.",
    ],
  ];
  doc.fontSize(9.5);
  for (const [term, meaning] of definitions) {
    doc.font("Helvetica-Bold").text(term, MARGIN, y, { width: 148 });
    doc.font("Helvetica").text(meaning, MARGIN + 158, y, { width: CONTENT - 158, lineGap: 1.5 });
    y = Math.max(doc.y, y + 26) + 8;
  }

  y += 10;
  const columns = [86, 300, CONTENT - 86 - 300];
  tableHead(doc, y, ["Delta T", "Recommendations", "Fault Rating"], columns);
  y += 20;
  doc.fontSize(9.5).font("Helvetica");
  for (const band of PRIORITY_BANDS) {
    const height = Math.max(
      21,
      doc.heightOfString(band.action, { width: columns[1] - 14 }) + 12,
    );
    doc.rect(MARGIN, y, CONTENT, height).fillAndStroke("#ffffff", "#cccccc");
    doc.fillColor(INK).font("Helvetica").text(band.range, MARGIN + 8, y + 6, { width: columns[0] - 12 });
    doc.text(band.action, MARGIN + columns[0] + 8, y + 6, { width: columns[1] - 14 });
    doc.font("Helvetica");
    const chipX = MARGIN + columns[0] + columns[1];
    doc.rect(chipX, y, columns[2], height).fill(band.print);
    doc
      .fillColor(band.printInk)
      .font("Helvetica-Bold")
      .text(`${band.band} (${priorityLabel(band.priority)})`, chipX, y + height / 2 - 5, {
        width: columns[2],
        align: "center",
      });
    y += height;
  }

  footer(doc, data);
}

/* --- what was found ------------------------------------------------------- */

function abnormalities(doc: Doc, data: ReportData) {
  doc.addPage();
  sectionBar(doc, "Identified Thermal Abnormalities / Issues", MARGIN);

  const columns = [186, CONTENT - 186 - 54 - 44, 54, 44];
  let y = MARGIN + 30;
  tableHead(doc, y, ["Equipment", "Component Description", "Priority", "Page"], columns);
  y += 20;

  if (data.findings.length === 0) {
    doc.rect(MARGIN, y, CONTENT, 24).fillAndStroke("#ffffff", "#cccccc");
    doc
      .fillColor(INK)
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text("No thermal abnormalities were identified during this survey.", MARGIN + 8, y + 7, {
        width: CONTENT - 16,
      });
    y += 24;
  }

  doc.fontSize(9);
  data.findings.forEach((finding, index) => {
    const height = 23;
    doc.rect(MARGIN, y, CONTENT, height).fillAndStroke(index % 2 ? SOFT : "#ffffff", "#cccccc");
    doc.fillColor(INK).font("Helvetica").text(finding.equipment, MARGIN + 8, y + 7, {
      width: columns[0] - 12,
      ellipsis: true,
      height: 12,
    });
    doc.text(finding.component, MARGIN + columns[0] + 8, y + 7, {
      width: columns[1] - 12,
      ellipsis: true,
      height: 12,
    });

    const chipX = MARGIN + columns[0] + columns[1];
    const colours = printColours(finding.priority);
    doc.rect(chipX + 4, y + 3, columns[2] - 8, height - 6).fill(colours.print);
    doc
      .fillColor(colours.printInk)
      .font("Helvetica-Bold")
      .text(priorityLabel(finding.priority), chipX + 4, y + 7, {
        width: columns[2] - 8,
        align: "center",
      });

    doc
      .fillColor(INK)
      .font("Helvetica")
      .text(String(finding.page), chipX + columns[2], y + 7, {
        width: columns[3],
        align: "center",
      });
    y += height;
  });

  footer(doc, data);
}

/* --- a page per finding --------------------------------------------------- */

function findingPage(doc: Doc, data: ReportData, finding: ReportFinding) {
  doc.addPage();
  const colours = printColours(finding.priority);

  // Header: what and where, with the priority called out beside it.
  const labelWidth = 92;
  const headWidth = CONTENT - 120;
  doc.rect(MARGIN, MARGIN, labelWidth, 21).fill(SOFT);
  doc.rect(MARGIN, MARGIN + 21, labelWidth, 21).fill(SOFT);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5);
  doc.text("Equipment:", MARGIN + 6, MARGIN + 6);
  doc.text("Component Desc:", MARGIN + 6, MARGIN + 27);
  doc.font("Helvetica").fontSize(10);
  doc.text(finding.equipment, MARGIN + labelWidth + 8, MARGIN + 6, {
    width: headWidth - labelWidth - 12,
    ellipsis: true,
    height: 12,
  });
  doc.text(finding.component, MARGIN + labelWidth + 8, MARGIN + 27, {
    width: headWidth - labelWidth - 12,
    ellipsis: true,
    height: 12,
  });
  doc.moveTo(MARGIN, MARGIN + 21).lineTo(MARGIN + headWidth, MARGIN + 21).lineWidth(1).stroke(HAIR);
  doc.moveTo(MARGIN, MARGIN + 42).lineTo(MARGIN + headWidth, MARGIN + 42).stroke(HAIR);

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK);
  doc.text("Priority:", MARGIN + headWidth + 4, MARGIN + 18, { width: 52 });
  doc.rect(MARGIN + CONTENT - 62, MARGIN - 4, 62, 52).fillAndStroke(colours.print, INK);
  doc
    .fillColor(colours.printInk)
    .font("Helvetica-Bold")
    .fontSize(30)
    .text(priorityLabel(finding.priority), MARGIN + CONTENT - 62, MARGIN + 6, {
      width: 62,
      align: "center",
    });

  // IR image and the numbers off it.
  let y = MARGIN + 64;
  const halfLeft = 300;
  bar(doc, MARGIN, y, halfLeft, `IR Image:  ${time(finding.takenAt)}  ${shortDate(finding.takenAt)}`);
  bar(doc, MARGIN + halfLeft, y, CONTENT - halfLeft, "Analysis", "center");
  y += 19;

  const panelHeight = 190;
  doc.rect(MARGIN, y, CONTENT, panelHeight).lineWidth(1).stroke(HAIR);
  if (finding.thermal) {
    doc.image(finding.thermal, MARGIN + 10, y + 10, {
      fit: [halfLeft - 20, panelHeight - 20],
      align: "center",
      valign: "center",
    });
  }

  const ax = MARGIN + halfLeft + 12;
  const aw = CONTENT - halfLeft - 24;
  doc.rect(ax, y + 12, aw, 34).fillAndStroke(SOFT, HAIR);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Temperature Rise:", ax + 8, y + 24);
  doc.fontSize(19).text(
    finding.rise === null ? "—" : `${finding.rise}°C`,
    ax + aw / 2,
    y + 20,
    { width: aw / 2 - 8, align: "center" },
  );

  const rows: [string, string][] = [
    ["R1 Temp", finding.hotTemp === null ? "—" : String(finding.hotTemp)],
    ["Ref Temp", finding.refTemp === null ? "—" : String(finding.refTemp)],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y + 52 + index * 20;
    doc.rect(ax, rowY, aw / 2, 20).fillAndStroke(SOFT, HAIR);
    doc.rect(ax + aw / 2, rowY, aw / 2, 20).fillAndStroke("#ffffff", HAIR);
    doc.fillColor(INK).font("Helvetica").fontSize(9.5);
    doc.text(label, ax + 8, rowY + 6);
    doc.text(value, ax + aw / 2 + 8, rowY + 6);
  });

  const loadY = y + 118;
  doc.rect(ax, loadY, 74, 36).fillAndStroke(SOFT, HAIR);
  doc.rect(ax + 74, loadY, aw - 74, 36).fillAndStroke("#ffffff", HAIR);
  doc.fillColor(INK).font("Helvetica").fontSize(9.5);
  doc.text("Circuit Load", ax + 6, loadY + 13, { width: 68 });
  doc.text(finding.circuitLoad, ax + 82, loadY + 13, { width: aw - 88, ellipsis: true, height: 12 });

  // Visual image and the recommendations against it.
  y += panelHeight + 12;
  bar(doc, MARGIN, y, halfLeft, "Visual Image");
  bar(doc, MARGIN + halfLeft, y, CONTENT - halfLeft, "Recommendations", "center");
  y += 19;

  const visualHeight = 200;
  doc.rect(MARGIN, y, CONTENT, visualHeight).lineWidth(1).stroke(HAIR);
  doc.moveTo(MARGIN + halfLeft, y).lineTo(MARGIN + halfLeft, y + visualHeight).stroke(HAIR);
  if (finding.visual) {
    doc.image(finding.visual, MARGIN + 10, y + 10, {
      fit: [halfLeft - 20, visualHeight - 20],
      align: "center",
      valign: "center",
    });
  }
  doc.fillColor(INK).font("Helvetica").fontSize(10);
  let ry = y + 14;
  for (const recommendation of finding.recommendations) {
    doc.text(`•  ${recommendation}`, MARGIN + halfLeft + 12, ry, {
      width: CONTENT - halfLeft - 24,
      lineGap: 1.5,
    });
    ry = doc.y + 5;
  }

  // Comments, then the space the client signs off in.
  y += visualHeight + 12;
  bar(doc, MARGIN, y, CONTENT, "Comments");
  y += 19;
  const commentsHeight = 96;
  doc.rect(MARGIN, y, CONTENT, commentsHeight).lineWidth(1).stroke(HAIR);
  doc.fillColor(INK).font("Helvetica").fontSize(10);
  let cy = y + 10;
  for (const paragraph of finding.comments) {
    doc.text(paragraph, MARGIN + 10, cy, { width: CONTENT - 20, lineGap: 1.5 });
    cy = doc.y + 7;
  }

  y += commentsHeight + 12;
  bar(doc, MARGIN, y, CONTENT, "Corrective Action", "left", RED);
  y += 19;
  doc.rect(MARGIN, y, CONTENT, 64).lineWidth(1).stroke(RED);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5);
  doc.text("Date:", MARGIN + 170, y + 46);
  doc.text("Repaired By:", MARGIN + 270, y + 46);

  footer(doc, data);
}

/* --- the plant list ------------------------------------------------------- */

function plantInspected(doc: Doc, data: ReportData) {
  doc.addPage();
  sectionBar(doc, "Plant Inspected", MARGIN);

  const columns = [206, CONTENT - 206 - 128, 128];
  let y = MARGIN + 30;
  tableHead(doc, y, ["Equipment", "Notes", "Last Inspection Result"], columns);
  y += 20;

  doc.fontSize(9);
  data.plant.forEach((row, index) => {
    const notes = row.notes.length ? row.notes : ["—"];
    doc.font("Helvetica").fontSize(9);
    const notesHeight = notes.reduce(
      (total, note) => total + doc.heightOfString(note, { width: columns[1] - 12 }) + 2,
      0,
    );
    const height = Math.max(21, notesHeight + 10);

    if (y + height > PAGE.height - 80) {
      footer(doc, data);
      doc.addPage();
      y = MARGIN;
      tableHead(doc, y, ["Equipment", "Notes", "Last Inspection Result"], columns);
      y += 20;
    }

    doc.rect(MARGIN, y, CONTENT, height).fillAndStroke(index % 2 ? SOFT : "#ffffff", "#cccccc");
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .text(row.equipment, MARGIN + 8, y + 6, { width: columns[0] - 12 });

    doc.font("Helvetica");
    let ny = y + 6;
    for (const note of notes) {
      doc.text(note, MARGIN + columns[0] + 8, ny, { width: columns[1] - 12 });
      ny = doc.y + 2;
    }

    const chipX = MARGIN + columns[0] + columns[1];
    const ok = row.result === "OK";
    doc.rect(chipX + 4, y + 3, columns[2] - 8, height - 6).fill(ok ? "#c8f0c8" : "#ed1c24");
    doc
      .fillColor(ok ? INK : "#ffffff")
      .font("Helvetica-Bold")
      .text(row.result, chipX + 4, y + height / 2 - 5, { width: columns[2] - 8, align: "center" });
    y += height;
  });

  footer(doc, data);
}

/* --- shared furniture ----------------------------------------------------- */

function sectionBar(doc: Doc, title: string, y: number) {
  doc.rect(MARGIN, y, CONTENT, 22).fill(HEAD);
  doc.fillColor(HEAD_INK).font("Helvetica-Bold").fontSize(10.5).text(title, MARGIN + 10, y + 7);
  doc.fillColor(INK);
}

function bar(doc: Doc, x: number, y: number, width: number, title: string, align: "left" | "center" = "left", colour = HEAD) {
  doc.rect(x, y, width, 19).fill(colour);
  doc
    .fillColor(HEAD_INK)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(title, align === "center" ? x : x + 8, y + 5.5, {
      width: align === "center" ? width : width - 16,
      align,
    });
  doc.fillColor(INK);
}

function tableHead(doc: Doc, y: number, titles: string[], columns: number[]) {
  doc.rect(MARGIN, y, CONTENT, 20).fill(HEAD);
  doc.fillColor(HEAD_INK).font("Helvetica-Bold").fontSize(9.5);
  let x = MARGIN;
  titles.forEach((title, index) => {
    const centred = index > 0 && columns[index] < 140;
    doc.text(title, centred ? x : x + 8, y + 6, {
      width: centred ? columns[index] : columns[index] - 12,
      align: centred ? "center" : "left",
    });
    x += columns[index];
  });
  doc.fillColor(INK);
}

/**
 * Drawn at the very foot of the page, below where text is allowed to flow —
 * so the bottom margin is lifted for the duration, otherwise pdfkit reads the
 * last line as an overflow and starts a fresh page for it.
 */
function footer(doc: Doc, data: ReportData) {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const y = PAGE.height - 56;
  if (data.logo) doc.image(data.logo, MARGIN, y - 2, { fit: [92, 28] });
  doc.fillColor(HEAD).font("Helvetica-Bold").fontSize(9.5);
  doc.text(data.clientName, MARGIN + 110, y, { width: CONTENT - 220, align: "center" });
  doc.font("Helvetica").fontSize(9);
  doc.text(data.siteLocation || data.siteName, MARGIN + 110, y + 13, {
    width: CONTENT - 220,
    align: "center",
  });

  doc.page.margins.bottom = bottom;
  doc.fillColor(INK);
}

/** "Page 5 of 13", stamped once the document knows how long it turned out. */
function stampPageNumbers(doc: Doc) {
  const range = doc.bufferedPageRange();
  for (let index = 1; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(HEAD)
      .font("Helvetica")
      .fontSize(9)
      .text(`Page ${index + 1} of ${range.count}`, MARGIN + CONTENT - 150, PAGE.height - 49, {
        width: 150,
        align: "right",
      });
    doc.page.margins.bottom = bottom;
  }
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function longDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function time(date: Date): string {
  return date.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}
