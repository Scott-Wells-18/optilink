import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { SECTIONS, type Section } from "@/lib/install/session";
import { readTestFile } from "@/lib/install/upload";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Starting an installation report.
 *
 * The tester files are added afterwards, each into its own section, because a
 * dropped connection means a section can take more than one file. A file can
 * still be sent with the request, with the section it belongs to, and it is
 * read now so a file that cannot be read is said so while the person who chose
 * it is still looking at it.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      siteId?: string;
      fileId?: string;
      section?: string;
      phases?: string;
      name?: string;
    };
    if (!body.siteId) return badRequest("Which site is this installation at?");

    const files = [];
    if (body.fileId) {
      const section = SECTIONS.includes(body.section as Section) ? (body.section as Section) : null;
      if (!section) return badRequest("Which section is that file for?");
      const read = await readTestFile(body.fileId, section, true);
      if ("error" in read) return badRequest(read.error);
      files.push(read.file);
    }

    const report = await prisma.installReport.create({
      data: {
        siteId: body.siteId,
        phases: body.phases === "THREE" ? "THREE" : "SINGLE",
        name: body.name?.trim().slice(0, 180) || null,
        rows: [],
        recordCount: files.reduce((total, file) => total + file.rows.length, 0),
        files: JSON.parse(JSON.stringify(files)),
        pointNames: {},
        exclusions: [],
        circuits: {},
      },
    });

    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "That report could not be started.");
  }
}
