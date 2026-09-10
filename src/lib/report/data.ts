import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { normaliseBoard, positionNumber, STATE_LABELS, type Board } from "@/lib/board";
import {
  BOARD_SLOT,
  CAUSE_LABELS,
  MAIN_SWITCH_SLOT,
  MOTOR_SLOT,
  REPAIRED_RECOMMENDATION,
  recommendationText,
  type IssueCause,
  type IssueType,
} from "@/lib/issues";
import { priorityFor, temperatureRise, PRIORITY_ORDER, type Priority } from "@/lib/priority";

/**
 * Everything one report needs, gathered in one go: the survey, the equipment
 * it covered, every finding with its photos already read off disk, and the
 * plant list that closes the report out.
 */

export type ReportFinding = {
  equipment: string;
  component: string;
  priority: Priority;
  refTemp: number | null;
  hotTemp: number | null;
  rise: number | null;
  circuitLoad: string;
  recommendations: string[];
  comments: string[];
  thermal: Buffer | null;
  visual: Buffer | null;
  takenAt: Date;
  /** Filled in once the pages are laid out. */
  page: number;
};

export type PlantRow = { equipment: string; notes: string[]; result: "REPORT" | "OK" };

export type ReportData = {
  clientName: string;
  siteName: string;
  siteLocation: string | null;
  contactName: string | null;
  inspectionDate: Date;
  reportDate: Date;
  nextSurveyDue: Date;
  /** The boards and equipment the survey covered, for the cover page. */
  scope: string[];
  findings: ReportFinding[];
  plant: PlantRow[];
  logo: Buffer | null;
  auspta: Buffer | null;
  badge: Buffer | null;
};

export async function loadReport(inspectionId: string): Promise<ReportData | null> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      site: {
        include: {
          client: { select: { name: true } },
          contacts: { orderBy: { createdAt: "asc" }, take: 1 },
          equipment: { orderBy: { createdAt: "asc" } },
        },
      },
      issues: {
        orderBy: { createdAt: "asc" },
        include: { photos: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!inspection) return null;

  const { site } = inspection;
  const byId = new Map(site.equipment.map((item) => [item.id, item]));

  const findings: ReportFinding[] = [];
  for (const issue of inspection.issues) {
    const item = byId.get(issue.equipmentId);
    if (!item) continue;

    const isMotor = item.kind === "MOTOR";
    const board = item.kind === "SWITCHBOARD" ? normaliseBoard(item.board) : null;
    const rise = temperatureRise(issue.refTemp, issue.hotTemp);
    const priority = priorityFor(issue.type as IssueType, rise);
    const where = describeSlot(board, issue.slot);
    const device = deviceWord(board, issue.slot, isMotor);

    findings.push({
      equipment: item.name,
      component: componentDescription(issue.type as IssueType, issue.cause, where, isMotor),
      priority,
      refTemp: issue.refTemp,
      hotTemp: issue.hotTemp,
      rise,
      circuitLoad: isMotor ? item.circuitLoading?.trim() || "Not Measured" : "Not Measured",
      recommendations:
        issue.type === "REPAIRED"
          ? [recommendationText(REPAIRED_RECOMMENDATION, device)]
          : issue.recommendations.map((key) => recommendationText(key, device)),
      comments: comments(issue.type as IssueType, issue.cause, where, item.name, priority),
      thermal: await photoBytes(issue.photos, ["THERMAL", "PLAIN"]),
      visual: await photoBytes(issue.photos, ["VISUAL"]),
      takenAt: issue.createdAt,
      page: 0,
    });
  }

  findings.sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
  );
  // The abnormalities table cites page numbers, so they are fixed here: the
  // cover, notes, terms and the table itself come first.
  findings.forEach((finding, index) => {
    finding.page = 5 + index;
  });

  const plant: PlantRow[] = site.equipment.map((item) => {
    const notes = findings
      .filter((finding) => finding.equipment === item.name)
      .map((finding) => finding.component);
    return { equipment: item.name, notes, result: notes.length ? "REPORT" : "OK" };
  });

  return {
    clientName: site.client.name,
    siteName: site.name,
    siteLocation: site.location,
    contactName: site.contacts[0]?.name ?? null,
    inspectionDate: inspection.date,
    reportDate: new Date(),
    nextSurveyDue: yearAfter(inspection.date),
    scope: site.equipment
      .filter((item) => item.kind !== "APPLIANCE")
      .map((item) => item.name),
    findings,
    plant,
    logo: await brandBytes("logo.jpg"),
    auspta: await brandBytes("auspta.png"),
    badge: await brandBytes("thermographer.png"),
  };
}

/** "Lighting 1", "Main switch", or the whole panel for dust. */
function describeSlot(board: Board | null, slot: string): string {
  if (slot === MAIN_SWITCH_SLOT) return "Main switch";
  if (slot === BOARD_SLOT) return "Inside panel";
  if (slot === MOTOR_SLOT) return "";
  if (!board) return "";

  const [sectionId, kind, raw] = slot.split(":");
  const section = board.sections.find((entry) => entry.id === sectionId);
  const index = Number(raw);
  if (!section || Number.isNaN(index)) return "";
  const cell = kind === "extra" ? section.extras[index] : section.cells[index];
  if (!cell) return "";
  if (cell.label.trim()) return cell.label.trim();
  return kind === "extra"
    ? `Additional ${index + 1}`
    : `Position ${positionNumber(section, index, board.numbering)}`;
}

/** How a recommendation names the thing: "Replace the breaker". */
function deviceWord(board: Board | null, slot: string, isMotor: boolean): string {
  if (isMotor) return "motor";
  if (slot === MAIN_SWITCH_SLOT) return "main switch";
  if (slot === BOARD_SLOT || !board) return "board";
  const [sectionId, kind, raw] = slot.split(":");
  const section = board.sections.find((entry) => entry.id === sectionId);
  const index = Number(raw);
  const cell =
    section && !Number.isNaN(index)
      ? kind === "extra"
        ? section.extras[index]
        : section.cells[index]
      : null;
  if (!cell) return "device";
  return cell.state === "RCD" ? "RCD" : STATE_LABELS[cell.state].toLowerCase();
}

/** The line that goes in the Component Description column. */
function componentDescription(
  type: IssueType,
  cause: IssueCause | null,
  where: string,
  isMotor: boolean,
): string {
  if (type === "REPAIRED") return `${where || "Equipment"} - REPAIRED`;
  if (type === "DUST_INGRESS") return "Dust & product - inside panel";
  const causeLabel = cause ? CAUSE_LABELS[cause] : "Raised temperature";
  if (isMotor) return `${causeLabel} - raised temperatures`;
  return `${where || "Component"} - ${causeLabel}`;
}

const SEVERITY: Record<Priority, string> = {
  P1: "The abnormal heating is severe and repairs or replacement need to be carried out immediately.",
  P2: "The operating temperatures are excessive and corrective work is advised as soon as possible.",
  P3: "The temperature rise indicates a deficiency which should be repaired as time permits.",
  P4: "The temperature rise is minor at this stage and warrants further monitoring.",
  INFO: "This thermogram has been taken for information and reference.",
  NONE: "",
};

function comments(
  type: IssueType,
  cause: IssueCause | null,
  where: string,
  equipment: string,
  priority: Priority,
): string[] {
  if (type === "REPAIRED") {
    return [
      "This report is for your information; no fault detected.",
      `This infrared image has been taken to indicate the equipment or connection temperature under normal load conditions. ${
        where || "This item"
      } on the ${equipment} was identified at the last survey as having thermal abnormalities; the fault has been successfully repaired.`,
    ];
  }
  if (type === "DUST_INGRESS") {
    return [
      `Dust and product build-up was found inside the ${equipment}.`,
      "Build-up of this kind traps heat and carries a fire risk. The panel should be cleaned out and the source of ingress addressed.",
    ];
  }
  const causeLabel = cause ? CAUSE_LABELS[cause].toLowerCase() : "an abnormal thermal pattern";
  return [
    `Thermogram indicates an abnormal thermal pattern at ${
      where ? `the ${where.toLowerCase()}` : "the equipment"
    } on the ${equipment}, consistent with ${causeLabel}.`,
    SEVERITY[priority],
  ].filter(Boolean);
}

async function photoBytes(
  photos: { kind: string; fileId: string }[],
  wanted: string[],
): Promise<Buffer | null> {
  for (const kind of wanted) {
    const photo = photos.find((entry) => entry.kind === kind);
    if (!photo) continue;
    const file = await prisma.uploadedFile.findUnique({ where: { id: photo.fileId } });
    if (!file) continue;
    try {
      return await readUpload(file.storedName);
    } catch {
      // A photo missing off disk should not sink the whole report.
    }
  }
  return null;
}

async function brandBytes(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}

function yearAfter(date: Date): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}
