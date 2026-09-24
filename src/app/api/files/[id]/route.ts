import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { etagFor, readUpload, releaseFiles } from "@/lib/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = await prisma.uploadedFile.findUnique({ where: { id } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readUpload(file.storedName);
  } catch {
    return new NextResponse("File is no longer on disk", { status: 404 });
  }

  const etag = etagFor(bytes);
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": file.mimeType,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, max-age=31536000, immutable",
      ETag: etag,
      "content-disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
    },
  });
}

/**
 * Give back a file that was uploaded and then not used.
 *
 * A photo is uploaded the moment it is chosen, so a dialog that is cancelled,
 * or a photo taken out of a draft before it was saved, leaves a file on the
 * volume that nothing will ever ask for again. This is how the dialog hands
 * one back.
 *
 * It only ever lets go of a file nothing points at: if the same picture is
 * also on a thermal finding or a piece of gear, it is counted and kept.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const released = await releaseFiles([id]);
  return NextResponse.json({ ok: true, released });
}
