import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { etagFor, readUpload } from "@/lib/storage";

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
