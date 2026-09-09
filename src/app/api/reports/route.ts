import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, serverError } from "@/lib/api";
import { getSettings, nextReportReference } from "@/lib/settings";
import { DEFAULT_LIMITATIONS } from "@/lib/report";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { clientId?: string; title?: string };
    const settings = await getSettings();
    const reference = await nextReportReference();

    const report = await prisma.report.create({
      data: {
        reference,
        title: body.title?.slice(0, 180) || "Electrical inspection report",
        clientId: body.clientId || null,
        inspectionDate: new Date(),
        technicianName: settings.defaultTechnicianName,
        technicianLicence: settings.defaultTechnicianLicence,
        limitations: DEFAULT_LIMITATIONS,
      },
    });

    return NextResponse.json({ id: report.id, reference: report.reference });
  } catch (error) {
    return serverError(error, "The report could not be created.");
  }
}
