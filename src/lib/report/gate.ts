import PDFDocument from "pdfkit";
import { COMPANY } from "@/lib/company";
import { COLOURS, SEVERITY, safe, shortDate, timeOfDay } from "@/lib/report/theme";
import {
  mastheadLines,
  sectionBar,
  stampWideFeet,
  tableHead,
  type Doc,
  type PageMeta,
} from "@/lib/report/furniture";
import {
  ACCESSORY_LABELS,
  OUTCOME_LABELS,
  PREPARATION_LABELS,
  PREPARATIONS,
  PRIORITY_LABELS,
  RESULT_MARKS,
  SECTIONS,
  SERVICE_KIND_LABELS,
  defectsFrom,
  failedSafety,
  itemsFor,
  type Accessory,
  type Answers,
  type Defect,
  type Outcome,
  type Preparation,
  type Result,
  type ServiceKind,
} from "@/lib/gates/form";
import { GATE_TYPE_LABELS, findModel, provenanceOf, type GateType } from "@/lib/gates/models";
import type { Signatory } from "@/lib/profiles.server";

/**
 * The gate service and inspection report.
 *
 * Portrait, because it is a form rather than a register: a column of questions
 * with an answer beside each. Every section of the paper form it replaces is
 * here, and the fixed model subtitle it used to carry is not — the model is a
 * fact about the unit and belongs in the asset details with the serial number,
 * not in the title of every report whatever was serviced.
 *
 * What the report will not do:
 *
 *  - tick a preparation item nobody confirmed;
 *  - print a result for a check nobody answered;
 *  - print "Returned to service" over a failed safety test;
 *  - put a licence number under a name that does not hold one.
 */

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const CONTENT = PAGE.width - MARGIN * 2;
const FLOOR = PAGE.height - 72;

export type GateReport = PageMeta & {
  type: GateType;
  serviceDate: Date;
  completedAt: Date | null;
  reportDate: Date;

  gateLocation: string | null;
  assetNumber: string | null;
  jobNumber: string | null;
  reportNumber: string | null;
  model: string | null;
  serialNumber: string | null;
  controllerModel: string | null;
  controllerFirmware: string | null;
  armLengthMetres: number | null;
  accessories: Accessory[];
  accessoryNotes: string | null;
  previousService: string | null;
  reportedFaults: string | null;

  serviceKind: ServiceKind;
  weather: string | null;
  preparation: Preparation[];
  manualRef: string | null;

  answers: Answers;
  defects: Defect[];

  fields: Record<string, string | null>;

  outcome: Outcome | null;
  outcomeNotes: string | null;
  notifiedName: string | null;
  notifiedTime: string | null;
  nextServiceDue: Date | null;
  intervalBasis: string | null;

  technician: Signatory | null;
  clientRepName: string | null;
};

/* --- the document ---------------------------------------------------------- */

export async function buildGateReport(data: GateReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE.width, PAGE.height],
    margin: MARGIN,
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  cover(doc, data);
  preparation(doc, data);
  inspection(doc, data);
  measurements(doc, data);
  defectsPage(doc, data);
  closing(doc, data);
  signOff(doc, data);

  // stampWideFeet numbers the pages as it draws the foot bar; numbering them
  // again put "Page 7 of 7" on top of itself.
  stampWideFeet(doc, data, {
    width: PAGE.width,
    height: PAGE.height,
    margin: MARGIN,
  });
  doc.end();
  return done;
}

/* --- small helpers --------------------------------------------------------- */

/** A new page where what is coming will not fit on this one. */
function room(doc: Doc, data: GateReport, needed: number, title: string): number {
  if (doc.y + needed <= FLOOR) return doc.y;
  doc.addPage();
  return head(doc, data, title);
}

function head(doc: Doc, data: GateReport, title: string): number {
  if (data.logo) doc.image(data.logo, MARGIN, 26, { fit: [104, 34] });
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOURS.ink);
  doc.text(title, MARGIN + 120, 32, { width: CONTENT - 120, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      [data.clientName, data.siteName, data.gateLocation].filter(Boolean).join("  ·  "),
    ),
    MARGIN + 120,
    48,
    { width: CONTENT - 120, lineBreak: false, ellipsis: true },
  );
  doc.rect(MARGIN, 66, CONTENT, 0.8).fill(COLOURS.hair);
  doc.y = 80;
  doc.fillColor(COLOURS.ink);
  return doc.y;
}

/** "Field | value" rows, wrapping and growing with the value. */
function rows(doc: Doc, data: GateReport, pairs: [string, string][], title: string) {
  const labelWidth = 186;
  for (const [name, value] of pairs) {
    doc.font("Helvetica-Bold").fontSize(9);
    const height = Math.max(
      20,
      // Measured the way it is drawn — bold, at the width it gets, with the
      // same line gap. Measuring it any other way left a four-line value
      // running under the label of the row beneath it.
      doc.heightOfString(safe(value) || "–", {
        width: CONTENT - labelWidth - 4,
        lineGap: 1.4,
      }) + 12,
    );
    const y = room(doc, data, height + 4, title);

    doc.rect(MARGIN, y, CONTENT, 0.5).fill(COLOURS.hair);
    doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9);
    doc.text(name, MARGIN + 2, y + 6, { width: labelWidth - 8 });
    doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(9);
    doc.text(safe(value) || "–", MARGIN + labelWidth, y + 6, {
      width: CONTENT - labelWidth - 4,
      lineGap: 1.4,
    });
    doc.y = y + height;
  }
  doc.rect(MARGIN, doc.y, CONTENT, 0.5).fill(COLOURS.hair);
  doc.y += 12;
  doc.fillColor(COLOURS.ink);
}

/** A tick box, drawn ticked or empty — never half. */
function tick(doc: Doc, x: number, y: number, on: boolean) {
  doc.rect(x, y, 9, 9).lineWidth(0.8).strokeColor(COLOURS.inkSoft).stroke();
  if (!on) return;
  doc
    .moveTo(x + 1.8, y + 4.6)
    .lineTo(x + 3.6, y + 6.8)
    .lineTo(x + 7.4, y + 2.2)
    .lineWidth(1.5)
    .strokeColor(COLOURS.bar)
    .stroke();
}

/* --- the cover -------------------------------------------------------------- */

function cover(doc: Doc, data: GateReport) {
  if (data.logo) doc.image(data.logo, MARGIN, 36, { fit: [136, 44] });
  mastheadLines(doc, MARGIN + 250, 36, CONTENT - 250);

  let y = 126;
  doc.rect(MARGIN, y, 4, 48).fill(COLOURS.accent);
  doc.fillColor(COLOURS.bar).font("Helvetica-Bold").fontSize(9);
  doc.text("GATE SERVICE", MARGIN + 16, y + 2, { characterSpacing: 1.6 });
  // No fixed model subtitle: the unit's own model is in the asset details.
  doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(21);
  doc.text("Service and Inspection Report", MARGIN + 16, y + 16, { width: CONTENT - 16 });

  y = 196;
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

  doc.y = y + 76;
  const model = findModel(data.model);

  rows(
    doc,
    data,
    [
      ["Gate type", GATE_TYPE_LABELS[data.type]],
      ["Gate location", data.gateLocation ?? ""],
      ["Asset number", data.assetNumber ?? ""],
      ["Job number", data.jobNumber ?? ""],
      ["Report number", data.reportNumber ?? ""],
      [
        data.type === "BOOM" ? "Barrier model" : "Operator model",
        data.model?.trim() ?? "",
      ],
      ["Serial number", data.serialNumber ?? ""],
      [
        "Controller model and firmware",
        [data.controllerModel, data.controllerFirmware].filter(Boolean).join("  ·  "),
      ],
      ...(data.type === "BOOM"
        ? ([["Boom length", data.armLengthMetres ? `${data.armLengthMetres} m` : ""]] as [
            string,
            string,
          ][])
        : []),
      [
        "Fitted accessories",
        [
          ...data.accessories.map((accessory) => ACCESSORY_LABELS[accessory]),
          data.accessoryNotes?.trim(),
        ]
          .filter(Boolean)
          .join(", "),
      ],
      ["Previous service", data.previousService ?? ""],
      ["Reported faults", data.reportedFaults ?? ""],
      ["Service date", shortDate(data.serviceDate)],
      ["Technician", data.technician?.name ?? ""],
    ],
    "Site and asset details",
  );

  /*
   * Where the model's details came from.
   *
   * A report that quotes a manual without saying whether it was confirmed to
   * apply to the unit in front of the technician is worse than one that says
   * it was not.
   */
  if (model) {
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOURS.inkSoft);
    doc.text(safe(provenanceOf(model)), MARGIN, doc.y, { width: CONTENT, lineGap: 1.4 });
    doc.y += 10;
  }

  doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      "This report covers the unit named above, as inspected on the service date and in the conditions " +
        "recorded. It does not certify the whole installation and does not guarantee future operation. " +
        "Items that were not accessible or not tested are identified inside.",
    ),
    MARGIN,
    Math.max(doc.y + 10, PAGE.height - MARGIN - 96),
    { width: CONTENT, lineGap: 1.8 },
  );
  doc.fillColor(COLOURS.ink);
}

/* --- preparation ------------------------------------------------------------ */

function preparation(doc: Doc, data: GateReport) {
  doc.addPage();
  head(doc, data, "Preparation and scope");
  sectionBar(doc, "Preparation and scope", doc.y);
  doc.y += 34;

  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text("Service type", MARGIN, doc.y);
  let x = MARGIN + 90;
  const at = doc.y;
  for (const kind of ["SCHEDULED", "BREAKDOWN", "FOLLOW_UP"] as ServiceKind[]) {
    tick(doc, x, at + 1, data.serviceKind === kind);
    doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(9);
    doc.text(SERVICE_KIND_LABELS[kind], x + 14, at, { lineBreak: false });
    x += 14 + doc.widthOfString(SERVICE_KIND_LABELS[kind]) + 22;
  }
  doc.y = at + 20;

  rows(doc, data, [["Weather / site conditions", data.weather ?? ""]], "Preparation and scope");

  /*
   * The preparation checklist.
   *
   * Ticked only where the technician confirmed it. Nothing here is implied by
   * the report having been written: a report is not evidence that an isolation
   * happened, and the unticked boxes are the point of printing it.
   */
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOURS.ink);
  doc.text("Confirmed by the technician", MARGIN, doc.y);
  doc.y += 14;

  for (const step of PREPARATIONS) {
    const y = room(doc, data, 18, "Preparation and scope");
    tick(doc, MARGIN + 2, y + 1, data.preparation.includes(step));
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.ink);
    doc.text(PREPARATION_LABELS[step], MARGIN + 18, y, { width: CONTENT - 20 });
    doc.y = y + 16;
  }

  const missed = PREPARATIONS.filter((step) => !data.preparation.includes(step));
  if (missed.length > 0) {
    doc.y += 4;
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(
      safe(
        `${missed.length} of the ${PREPARATIONS.length} preparation items were not confirmed and are shown unticked. ` +
          "An unticked box means it was not recorded as done, not that it was not needed.",
      ),
      MARGIN,
      doc.y,
      { width: CONTENT, lineGap: 1.4 },
    );
    doc.y += 8;
  }

  doc.y += 10;
  rows(
    doc,
    data,
    [["Manual / revision and scope limitations", data.manualRef ?? ""]],
    "Preparation and scope",
  );
}

/* --- the inspection --------------------------------------------------------- */

const RESULT_TONE: Record<Result, { fill: string; ink: string }> = {
  PASS: SEVERITY.pass,
  FAIL: SEVERITY.fail,
  NA: SEVERITY.none,
  NOT_TESTED: SEVERITY.concern,
};

function inspection(doc: Doc, data: GateReport) {
  for (const section of SECTIONS) {
    doc.addPage();
    head(doc, data, section.title);
    sectionBar(doc, section.title, doc.y);
    doc.y += 32;

    if (section.note) {
      doc.font("Helvetica").fontSize(8.5).fillColor(COLOURS.inkSoft);
      doc.text(safe(section.note), MARGIN, doc.y, { width: CONTENT, lineGap: 1.5 });
      doc.y += 10;
    }

    doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLOURS.inkSoft);
    doc.text(
      "P = pass, F = fail, NA = not applicable, NT = not tested. An item with no result was not answered.",
      MARGIN,
      doc.y,
      { width: CONTENT },
    );
    doc.y += 16;

    const columns = [CONTENT - 54 - 180, 54, 180];
    tableHead(doc, doc.y, ["Inspection or test", "Result", "Notes or defect reference"], columns);
    doc.y += 20;

    // Every item for this gate and its accessories, answered or not, plus any
    // item that was answered even though its accessory is not listed — a
    // recorded result is never dropped because of a tick box elsewhere.
    const listed = itemsFor(section, data.type, data.accessories);
    const extra = itemsFor(section, data.type, data.accessories, true).filter(
      (item) => !listed.includes(item) && data.answers[item.id],
    );

    for (const item of [...listed, ...extra]) {
      const answer = data.answers[item.id];
      const note = answer?.note?.trim() ?? "";

      doc.font("Helvetica").fontSize(8.5);
      const height = Math.max(
        22,
        doc.heightOfString(item.label, { width: columns[0] - 10, lineGap: 1.2 }) + 11,
        doc.heightOfString(note || " ", { width: columns[2] - 10, lineGap: 1.2 }) + 11,
      );

      if (doc.y + height > FLOOR) {
        doc.addPage();
        head(doc, data, `${section.title} (continued)`);
        tableHead(doc, doc.y, ["Inspection or test", "Result", "Notes or defect reference"], columns);
        doc.y += 20;
      }

      const y = doc.y;
      doc.rect(MARGIN, y + height, CONTENT, 0.5).fill(COLOURS.hair);

      doc.fillColor(COLOURS.ink).font("Helvetica").fontSize(8.5);
      doc.text(safe(item.label), MARGIN + 4, y + 5, { width: columns[0] - 10, lineGap: 1.2 });

      if (answer) {
        const tone = RESULT_TONE[answer.result];
        doc.roundedRect(MARGIN + columns[0] + 9, y + 5, 36, 13, 3).fill(tone.fill);
        doc.fillColor(tone.ink).font("Helvetica-Bold").fontSize(7.5);
        doc.text(RESULT_MARKS[answer.result], MARGIN + columns[0] + 9, y + 8.4, {
          width: 36,
          align: "center",
          lineBreak: false,
        });
      } else {
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLOURS.inkSoft);
        doc.text("not answered", MARGIN + columns[0], y + 8, {
          width: columns[1],
          align: "center",
          lineBreak: false,
        });
      }

      if (note) {
        doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
        doc.text(safe(note), MARGIN + columns[0] + columns[1] + 4, y + 5, {
          width: columns[2] - 10,
          lineGap: 1.2,
        });
      }

      doc.y = y + height;
      doc.fillColor(COLOURS.ink);
    }

    doc.y += 8;
    const unanswered = listed.filter((item) => !data.answers[item.id]).length;
    if (unanswered > 0) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLOURS.inkSoft);
      doc.text(
        safe(
          `${unanswered} ${unanswered === 1 ? "item was" : "items were"} not answered on this visit and ` +
            `${unanswered === 1 ? "is" : "are"} shown without a result. An unanswered item is not a pass.`,
        ),
        MARGIN,
        doc.y,
        { width: CONTENT, lineGap: 1.4 },
      );
      doc.y += 10;
    }
  }
}

/* --- measurements ----------------------------------------------------------- */

function measurements(doc: Doc, data: GateReport) {
  doc.addPage();
  head(doc, data, "Recorded measurements and service work");
  sectionBar(doc, "Recorded measurements and service work", doc.y);
  doc.y += 34;

  const field = (key: string) => data.fields[key]?.trim() ?? "";

  rows(
    doc,
    data,
    [
      ["Supply voltage and measurement point", field("supplyVoltage")],
      ["Protective earth / other electrical tests and method", field("earthTest")],
      ...(data.type === "BOOM"
        ? ([["Boom balance observation and adjustments", field("balanceNotes")]] as [
            string,
            string,
          ][])
        : []),
      ["Cleaning, fastener checks and lubrication if specified", field("lubrication")],
      ["Parts replaced and part numbers", field("partsReplaced")],
      ["Electrical test instrument / serial / calibration", field("testInstrument")],
    ],
    "Recorded measurements and service work",
  );

  doc.y += 6;
  const y = room(doc, data, 40, "Recorded measurements and service work");
  sectionBar(doc, "Operating record", y);
  doc.y = y + 34;

  rows(
    doc,
    data,
    [
      [
        "Opening time / closing time / auto-close delay",
        [field("openingTime"), field("closingTime"), field("autoCloseDelay")]
          .filter(Boolean)
          .join("  /  "),
      ],
      ["Number of final test cycles and observations", field("finalCycles")],
      ["Controller errors", field("controllerErrors")],
      ["Safety device test method and observed responses", field("safetyMethod")],
      ["Safety or force test equipment / readings / acceptance basis", field("forceEquipment")],
    ],
    "Operating record",
  );
}

/* --- defects ---------------------------------------------------------------- */

function defectsPage(doc: Doc, data: GateReport) {
  doc.addPage();
  head(doc, data, "Defects and rectification");
  sectionBar(doc, "Defects and rectification", doc.y);
  doc.y += 34;

  const defects = defectsFrom(
    SECTIONS,
    data.answers,
    data.defects,
    data.type,
    data.accessories,
  );

  if (defects.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(COLOURS.ink);
    doc.text("No defects were recorded on this service.", MARGIN, doc.y, { width: CONTENT });
    doc.y += 22;
  } else {
    const columns = [40, CONTENT - 40 - 86 - 150, 86, 150];
    tableHead(doc, doc.y, ["Ref", "Finding and location", "Priority", "Action / status"], columns);
    doc.y += 20;

    for (const defect of defects) {
      doc.font("Helvetica").fontSize(8.5);
      const height = Math.max(
        22,
        doc.heightOfString(defect.finding || " ", { width: columns[1] - 10, lineGap: 1.2 }) + 11,
        doc.heightOfString(defect.action || " ", { width: columns[3] - 10, lineGap: 1.2 }) + 11,
      );
      if (doc.y + height > FLOOR) {
        doc.addPage();
        head(doc, data, "Defects and rectification (continued)");
        tableHead(doc, doc.y, ["Ref", "Finding and location", "Priority", "Action / status"], columns);
        doc.y += 20;
      }

      const y = doc.y;
      doc.rect(MARGIN, y + height, CONTENT, 0.5).fill(COLOURS.hair);

      doc.fillColor(COLOURS.ink).font("Helvetica-Bold").fontSize(8.5);
      doc.text(defect.ref, MARGIN + 4, y + 5, { width: columns[0] - 8 });
      doc.font("Helvetica").fontSize(8.5);
      doc.text(safe(defect.finding), MARGIN + columns[0], y + 5, {
        width: columns[1] - 10,
        lineGap: 1.2,
      });

      const tone =
        defect.priority === "IMMEDIATE"
          ? SEVERITY.fail
          : defect.priority === "URGENT"
            ? SEVERITY.concern
            : SEVERITY.none;
      doc.roundedRect(MARGIN + columns[0] + columns[1] + 4, y + 5, 70, 13, 3).fill(tone.fill);
      doc.fillColor(tone.ink).font("Helvetica-Bold").fontSize(7);
      doc.text(
        PRIORITY_LABELS[defect.priority].toUpperCase(),
        MARGIN + columns[0] + columns[1] + 4,
        y + 8.6,
        { width: 70, align: "center", lineBreak: false },
      );

      doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(8);
      doc.text(safe(defect.action), MARGIN + columns[0] + columns[1] + columns[2] + 4, y + 5, {
        width: columns[3] - 10,
        lineGap: 1.2,
      });

      doc.y = y + height;
      doc.fillColor(COLOURS.ink);
    }
    doc.y += 10;
  }

  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      "Priority: Immediate = unsafe, keep out of service. Urgent = prompt rectification. " +
        "Routine = planned work. The reason and any temporary control are recorded against each defect.",
    ),
    MARGIN,
    doc.y,
    { width: CONTENT, lineGap: 1.5 },
  );
}

/* --- work completed, and the outcome ---------------------------------------- */

function closing(doc: Doc, data: GateReport) {
  doc.addPage();
  head(doc, data, "Work completed and outcome");
  sectionBar(doc, "Work completed and recommendations", doc.y);
  doc.y += 34;

  rows(
    doc,
    data,
    [
      ["Work completed", data.fields.workCompleted?.trim() ?? ""],
      ["Recommended work / quotation reference", data.fields.recommendations?.trim() ?? ""],
      ["Photo references and descriptions", data.fields.photoReferences?.trim() ?? ""],
    ],
    "Work completed and recommendations",
  );

  doc.y += 8;
  const y = room(doc, data, 120, "Service outcome");
  sectionBar(doc, "Service outcome", y);
  doc.y = y + 34;

  /*
   * The outcome, with the two it is not also shown.
   *
   * And where a safety test failed the report says so here, next to the
   * outcome, rather than leaving a reader to find it four pages back.
   */
  for (const outcome of ["RETURNED", "RETURNED_WITH_DEFECTS", "ISOLATED"] as Outcome[]) {
    const at = doc.y;
    tick(doc, MARGIN + 2, at + 1, data.outcome === outcome);
    doc.font("Helvetica").fontSize(9.5).fillColor(COLOURS.ink);
    doc.text(OUTCOME_LABELS[outcome], MARGIN + 18, at, { width: CONTENT - 20 });
    doc.y = at + 17;
  }

  const failed = failedSafety(data.answers);
  if (failed.length > 0) {
    doc.y += 4;
    doc.rect(MARGIN, doc.y, 3, 30).fill(SEVERITY.fail.fill);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(SEVERITY.fail.fill);
    doc.text(
      safe(
        `${failed.length} safety ${failed.length === 1 ? "test" : "tests"} failed on this service. ` +
          "This unit has not been returned to unrestricted service.",
      ),
      MARGIN + 12,
      doc.y + 2,
      { width: CONTENT - 14, lineGap: 1.4 },
    );
    doc.y += 34;
  }

  doc.fillColor(COLOURS.ink);
  rows(
    doc,
    data,
    [
      ["Reason / restrictions / isolation details", data.outcomeNotes ?? ""],
      [
        "Client notified / time",
        [data.notifiedName, data.notifiedTime].filter(Boolean).join("  ·  "),
      ],
      ["Next service due", data.nextServiceDue ? shortDate(data.nextServiceDue) : ""],
      ["Proposed interval and basis", data.intervalBasis ?? ""],
    ],
    "Service outcome",
  );

  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      "Do not return the unit to service with failed safety protection, insecure mounting or a damaged " +
        "counterbalance. Who was notified and the arrangements for repair are recorded above.",
    ),
    MARGIN,
    doc.y,
    { width: CONTENT, lineGap: 1.5 },
  );
}

/* --- sign off ---------------------------------------------------------------- */

function signOff(doc: Doc, data: GateReport) {
  const y = room(doc, data, 230, "Sign off");
  if (y === doc.y && doc.y > 120) doc.y += 10;
  sectionBar(doc, "Sign off", doc.y);
  doc.y += 40;

  const column = (CONTENT - 30) / 2;
  const top = doc.y;

  /* --- the technician ----------------------------------------------------- */
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.bar);
  doc.text("TECHNICIAN", MARGIN, top, { characterSpacing: 1.2 });

  const signTop = top + 54;
  if (data.technician?.signature) {
    try {
      doc.image(data.technician.signature, MARGIN + 4, signTop - 36, { fit: [column - 50, 44] });
    } catch {
      // A signature the renderer will not take is not worth a failed report.
    }
  }
  doc.rect(MARGIN, signTop, Math.min(210, column), 0.8).fill(COLOURS.inkSoft);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOURS.ink);
  doc.text(safe(data.technician?.name ?? ""), MARGIN, signTop + 10, {
    width: column,
    height: 13,
    ellipsis: true,
  });

  let at = signTop + 26;
  if (data.technician?.role) {
    doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
    doc.text(safe(data.technician.role), MARGIN, at, { width: column });
    at += 12;
  }
  /*
   * The licence.
   *
   * The company's contractor licence, in the form it is held in — it is the
   * licence the work is carried out under. A technician's own supervisor
   * certificate is printed where they hold one and left off where they do not,
   * because a report must not imply a credential nobody has.
   */
  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text(`Licence ${COMPANY.licence}`, MARGIN, at, { width: column });
  at += 12;
  if (data.technician?.supervisor) {
    doc.text(`Qualified Supervisor ${data.technician.supervisor}`, MARGIN, at, { width: column });
    at += 12;
  }

  doc.fillColor(COLOURS.inkSoft).font("Helvetica").fontSize(9);
  doc.text(
    `Date  ${shortDate(data.serviceDate)}${
      data.completedAt ? `    Time  ${timeOfDay(data.completedAt)}` : ""
    }`,
    MARGIN,
    at + 4,
    { width: column },
  );

  /* --- the client --------------------------------------------------------- */
  const right = MARGIN + column + 30;
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.bar);
  doc.text("CLIENT REPRESENTATIVE", right, top, { characterSpacing: 1.2 });

  // Their name is printed; the signature and the date are theirs to fill in.
  doc.rect(right, signTop, Math.min(210, column), 0.8).fill(COLOURS.inkSoft);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOURS.ink);
  doc.text(safe(data.clientRepName ?? ""), right, signTop + 10, {
    width: column,
    height: 13,
    ellipsis: true,
  });

  doc.font("Helvetica").fontSize(9).fillColor(COLOURS.inkSoft);
  doc.text("Signature", right, signTop + 28, { width: column });
  doc.rect(right, signTop + 56, Math.min(210, column), 0.8).fill(COLOURS.hair);
  doc.text("Date", right, signTop + 62, { width: column });
  doc.rect(right, signTop + 88, Math.min(130, column), 0.8).fill(COLOURS.hair);

  doc.y = signTop + 104;
  doc.font("Helvetica").fontSize(8).fillColor(COLOURS.inkSoft);
  doc.text(
    safe(
      "Acknowledgement confirms receipt of the findings and recommendations above. This inspection applies " +
        "to the recorded scope and the conditions on the service date; it does not certify the entire " +
        "installation or guarantee future operation.",
    ),
    MARGIN,
    doc.y,
    { width: CONTENT, lineGap: 1.5 },
  );
  doc.fillColor(COLOURS.ink);
}

/** What the report is called when it is saved. */
export function gateFileName(data: GateReport): string {
  const what = data.gateLocation?.trim() || data.assetNumber?.trim() || "Gate";
  return `Gate Service - ${data.clientName} - ${what} - ${
    data.serviceDate.toISOString().slice(0, 10)
  }.pdf`;
}
