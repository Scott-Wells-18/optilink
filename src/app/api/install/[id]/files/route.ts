import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, notFound, readJson, serverError } from "@/lib/api";
import { SECTIONS, type Section } from "@/lib/install/session";
import { filesOf, marksOf } from "@/lib/install/stored";
import { readTestFile } from "@/lib/install/upload";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Adding a tester PDF to one section of a report.
 *
 * It goes on the end of that section; the order can be changed afterwards. A
 * report from before the sections existed is converted on its first new file:
 * its single export is kept as it was, and its exclusions come with it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as { fileId?: string; section?: string };
    const section = SECTIONS.includes(body.section as Section) ? (body.section as Section) : null;
    if (!section) return badRequest("Which section is that file for?");
    if (!body.fileId) return badRequest("Upload the tester's PDF export.");

    const report = await prisma.installReport.findUnique({
      where: { id },
      include: { source: { select: { originalName: true } } },
    });
    if (!report) return notFound("That report could not be found.");

    const files = filesOf(report);
    if (files.some((file) => file.fileId === body.fileId)) {
      return badRequest("That file is already on this report.");
    }

    const first = !files.some((file) => file.section === section);
    const read = await readTestFile(body.fileId, section, first);
    if ("error" in read) return badRequest(read.error);

    const next = [...files, read.file];
    await prisma.installReport.update({
      where: { id },
      data: {
        files: JSON.parse(JSON.stringify(next)),
        marks: JSON.parse(JSON.stringify(marksOf(report))),
        recordCount: next.reduce((total, file) => total + file.rows.length, 0),
      },
    });

    return NextResponse.json({ ok: true, count: read.file.rows.length });
  } catch (error) {
    return serverError(error, "That file could not be added.");
  }
}
