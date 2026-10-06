import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readUpload, releaseFiles } from "@/lib/storage";
import { readRegister, RegisterError } from "@/lib/tagging/register";

export const runtime = "nodejs";

/**
 * The reference spreadsheet behind our own equipment register.
 *
 * One file, replaced whenever a fresh export comes out of the tagging
 * software. Replacing it changes what the next report is made from and nothing
 * else — every report already generated holds its own copy of the rows.
 */

async function settings() {
  return prisma.taggingSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
    include: { file: { select: { id: true, originalName: true, sizeBytes: true } } },
  });
}

export async function GET() {
  const held = await settings();

  // What is in the file, so the settings screen can show it rather than just
  // naming a file nobody can see inside.
  let summary: { items: number; customers: string[]; notes: string[] } | null = null;
  if (held.file) {
    try {
      const file = await prisma.uploadedFile.findUnique({ where: { id: held.file.id } });
      if (file) {
        const register = readRegister(await readUpload(file.storedName));
        summary = {
          items: register.items.length,
          customers: register.groups.map((group) => `${group.customer} — ${group.site}`),
          notes: register.notes,
        };
      }
    } catch (error) {
      summary = {
        items: 0,
        customers: [],
        notes: [
          error instanceof RegisterError
            ? error.message
            : "That file could not be read. Upload it again.",
        ],
      };
    }
  }

  return NextResponse.json({ ...held, summary });
}

/** Replacing the reference file. The one it replaces is handed back. */
export async function PATCH(request: Request) {
  try {
    const body = (await readJson(request)) as { fileId?: string | null };
    if (body.fileId === undefined) return badRequest("No file was supplied.");

    if (body.fileId) {
      const file = await prisma.uploadedFile.findUnique({ where: { id: body.fileId } });
      if (!file) return badRequest("That file could not be found.");
      // Read before it is saved, so a file that cannot be read is refused
      // while the person who chose it is still looking at it.
      try {
        readRegister(await readUpload(file.storedName));
      } catch (error) {
        return badRequest(
          error instanceof RegisterError
            ? error.message
            : "That spreadsheet could not be read.",
        );
      }
    }

    const held = await settings();
    const previous = held.fileId;

    const saved = await prisma.taggingSettings.update({
      where: { id: "singleton" },
      data: {
        fileId: body.fileId || null,
        uploadedAt: body.fileId ? new Date() : null,
      },
      include: { file: { select: { id: true, originalName: true, sizeBytes: true } } },
    });

    // The old reference is let go only if no report is holding on to it.
    if (previous && previous !== body.fileId) await releaseFiles([previous]);

    return NextResponse.json(saved);
  } catch (error) {
    return serverError(error, "That reference file could not be saved.");
  }
}
