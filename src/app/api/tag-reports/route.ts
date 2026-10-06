import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { RegisterError, snapshotOf } from "@/lib/tagging/store";

export const runtime = "nodejs";

/**
 * Starting a register report.
 *
 * Our own register takes its rows from the reference file in Settings; a
 * client's takes them from the spreadsheet uploaded for that report. Either
 * way the rows are read now and kept on the report, so replacing the reference
 * file next month leaves this one saying what it says today.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      kind?: string;
      siteId?: string;
      fileId?: string;
      name?: string;
    };

    const kind = body.kind === "CLIENT" ? "CLIENT" : "INTERNAL";

    let fileId = body.fileId ?? null;
    if (kind === "INTERNAL") {
      if (!fileId) {
        const settings = await prisma.taggingSettings.findUnique({ where: { id: "singleton" } });
        fileId = settings?.fileId ?? null;
      }
      if (!fileId) {
        return badRequest(
          "There is no reference spreadsheet yet. Add one in the Equipment Tagging settings first.",
        );
      }
    } else {
      if (!body.siteId) return badRequest("Which site is this report for?");
      if (!fileId) return badRequest("Upload the equipment spreadsheet for this report.");
    }

    let snapshot;
    try {
      snapshot = await snapshotOf(fileId);
    } catch (error) {
      return badRequest(
        error instanceof RegisterError ? error.message : "That spreadsheet could not be read.",
      );
    }

    const report = await prisma.tagReport.create({
      data: {
        kind,
        siteId: kind === "CLIENT" ? body.siteId! : null,
        sourceId: fileId,
        name: body.name?.trim().slice(0, 180) || null,
        items: JSON.parse(JSON.stringify(snapshot.items)),
        customer: snapshot.customer,
        siteLabel: snapshot.siteLabel,
        notes: snapshot.notes,
        ...snapshot.counts,
      },
    });

    return NextResponse.json(report);
  } catch (error) {
    return serverError(error, "That report could not be started.");
  }
}
