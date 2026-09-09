import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notFound, pickFields, readJson, serverError } from "@/lib/api";
import { REPORT_FIELDS } from "@/lib/fieldSpecs";
import { analyseReport, draftExecutiveSummary, draftRecommendations, reportInclude } from "@/lib/report";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = pickFields(await readJson(request), REPORT_FIELDS);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    // Stamp the issue date the first time a report is marked as issued.
    if (data.status === "ISSUED") {
      const current = await prisma.report.findUnique({
        where: { id },
        select: { issuedDate: true },
      });
      if (current && !current.issuedDate) data.issuedDate = new Date();
    }

    const report = await prisma.report.update({
      where: { id },
      data,
      select: { id: true, updatedAt: true, status: true, issuedDate: true },
    });
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return serverError(error, "Those changes could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.report.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The report could not be deleted.");
  }
}

/** Regenerates the auto-drafted summary and recommendations from the findings. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const report = await prisma.report.findUnique({ where: { id }, include: reportInclude });
    if (!report) return notFound("Report not found");

    const analysis = analyseReport(report);
    const executiveSummary = draftExecutiveSummary(report, analysis);
    const recommendations = draftRecommendations(analysis);

    await prisma.report.update({
      where: { id },
      data: { executiveSummary, recommendations },
    });

    return NextResponse.json({ ok: true, executiveSummary, recommendations });
  } catch (error) {
    return serverError(error, "The summary could not be regenerated.");
  }
}
