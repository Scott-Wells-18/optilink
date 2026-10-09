import path from "node:path";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { notFound, pdfResponse, serverError } from "@/lib/api";
import { personName } from "@/lib/contacts";
import { signatories } from "@/lib/profiles.server";
import { safe } from "@/lib/report/theme";
import { buildGateReport, gateFileName, type GateReport } from "@/lib/report/gate";
import type { Accessory, Answers, Defect, Preparation } from "@/lib/gates/form";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The free-text fields the report reads straight off the record. */
const FIELDS = [
  "supplyVoltage",
  "earthTest",
  "balanceNotes",
  "lubrication",
  "partsReplaced",
  "testInstrument",
  "openingTime",
  "closingTime",
  "autoCloseDelay",
  "finalCycles",
  "controllerErrors",
  "safetyMethod",
  "forceEquipment",
  "workCompleted",
  "recommendations",
  "photoReferences",
] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const report = await prisma.gateReport.findUnique({
      where: { id },
      include: {
        notifiedContact: { select: { name: true } },
        clientContact: { select: { name: true } },
        site: {
          select: {
            name: true,
            location: true,
            client: { select: { name: true } },
          },
        },
      },
    });
    if (!report) return notFound("That report could not be found.");

    // The technician's name, credentials and signature are read off their
    // profile when the report is drawn, so renaming them renames them here.
    const [technician] = report.technicianId
      ? await signatories([report.technicianId])
      : [];

    const data: GateReport = {
      clientName: safe(report.site.client.name),
      siteName: safe(report.site.name),
      siteLocation: report.site.location ? safe(report.site.location) : null,
      logo: await brandBytes("logo.jpg"),
      // The gate report is signed by its technician alone; the shared
      // prepared-by block is not used on it.
      preparedBy: technician ? [technician] : [],

      type: report.kind,
      serviceDate: report.date,
      completedAt: report.completedAt,
      reportDate: new Date(),

      gateLocation: report.gateLocation ? safe(report.gateLocation) : null,
      assetNumber: report.assetNumber ? safe(report.assetNumber) : null,
      jobNumber: report.jobNumber ? safe(report.jobNumber) : null,
      reportNumber: report.reportNumber ? safe(report.reportNumber) : null,
      model: report.model ? safe(report.model) : null,
      serialNumber: report.serialNumber ? safe(report.serialNumber) : null,
      controllerModel: report.controllerModel ? safe(report.controllerModel) : null,
      controllerFirmware: report.controllerFirmware ? safe(report.controllerFirmware) : null,
      armLengthMetres: report.armLengthMetres,
      accessories: report.accessories as Accessory[],
      accessoryNotes: report.accessoryNotes ? safe(report.accessoryNotes) : null,
      previousService: report.previousService ? safe(report.previousService) : null,
      reportedFaults: report.reportedFaults ? safe(report.reportedFaults) : null,

      serviceKind: report.serviceKind,
      weather: report.weather ? safe(report.weather) : null,
      preparation: report.preparation as Preparation[],
      manualRef: report.manualRef ? safe(report.manualRef) : null,

      answers: (report.answers ?? {}) as Answers,
      defects: Array.isArray(report.defects) ? (report.defects as Defect[]) : [],

      presetBlocks: (
        ((report.preset ?? {}) as { blocks?: { id: string; heading: string; text: string }[] })
          .blocks ?? []
      ).map((block) => ({ ...block, heading: safe(block.heading), text: safe(block.text) })),

      fields: Object.fromEntries(
        FIELDS.map((key) => [key, report[key] ? safe(report[key] as string) : null]),
      ),

      outcome: report.outcome,
      outcomeNotes: report.outcomeNotes ? safe(report.outcomeNotes) : null,
      notifiedName: report.notifiedContact
        ? safe(personName(report.notifiedContact.name))
        : null,
      notifiedTime: report.notifiedTime ? safe(report.notifiedTime) : null,
      nextServiceDue: report.nextServiceDue,
      intervalBasis: report.intervalBasis ? safe(report.intervalBasis) : null,

      technician: technician ?? null,
      clientRepName: report.clientContact
        ? safe(personName(report.clientContact.name))
        : null,
    };

    const pdf = await buildGateReport(data);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    return pdfResponse(pdf, gateFileName(data), { inline: preview });
  } catch (error) {
    return serverError(error, "That report could not be built.");
  }
}

async function brandBytes(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}
