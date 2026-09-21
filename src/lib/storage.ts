import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";

/**
 * Uploaded photos live on disk, not in the database. On Railway this should
 * point at a mounted Volume (set UPLOAD_DIR=/data/uploads) so images survive a
 * redeploy.
 */
export function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  // Test instruments export their own reports; those are kept as they came.
  "application/pdf",
  // Quotes come out of the accounting software as CSV.
  "text/csv",
]);

/**
 * What a CSV can arrive claiming to be.
 *
 * A browser reports a .csv by asking the operating system, and on Windows with
 * Excel installed the answer is "application/vnd.ms-excel"; on some Android
 * builds it is nothing at all. None of that changes what is in the file, so
 * the extension decides and the claim is corrected.
 */
const CSV_TYPES = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "",
]);

function declaredType(file: File): string {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".csv") && CSV_TYPES.has(type)) return "text/csv";
  return type;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export class UploadError extends Error {}

export async function saveUpload(file: File) {
  const mimeType = declaredType(file);
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw new UploadError(
      "That file type is not supported. Please upload a JPEG, PNG, WebP or AVIF image, a PDF, or a CSV.",
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("That image is larger than 20 MB. Please use a smaller file.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = extensionFor(mimeType);
  // Two levels of fan-out keeps directory listings small on a big installation.
  const id = randomUUID();
  const storedName = path.join(id.slice(0, 2), id.slice(2, 4), `${id}${extension}`);
  const destination = path.join(uploadDir(), storedName);

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);

  const dimensions = readDimensions(bytes, mimeType);

  return prisma.uploadedFile.create({
    data: {
      originalName: file.name?.slice(0, 200) || "upload",
      storedName,
      mimeType,
      sizeBytes: bytes.byteLength,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    },
  });
}

export async function readUpload(storedName: string): Promise<Buffer> {
  const resolved = path.resolve(uploadDir(), storedName);
  // Never read outside the upload directory, whatever is in the database.
  if (!resolved.startsWith(path.resolve(uploadDir()) + path.sep)) {
    throw new UploadError("Invalid file path.");
  }
  return readFile(resolved);
}

export async function deleteUpload(id: string) {
  const file = await prisma.uploadedFile.findUnique({ where: { id } });
  if (!file) return;
  try {
    await unlink(path.resolve(uploadDir(), file.storedName));
  } catch {
    // Already gone from disk — removing the row is still the right outcome.
  }
  await prisma.uploadedFile.delete({ where: { id } });
}

export function etagFor(buffer: Buffer): string {
  return `"${createHash("sha1").update(buffer).digest("hex")}"`;
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/avif":
      return ".avif";
    case "application/pdf":
      return ".pdf";
    case "text/csv":
      return ".csv";
    default:
      return ".jpg";
  }
}

/** Minimal header parsing — enough for sensible layout, no native dependency. */
function readDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png" && buffer.length > 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === "image/jpeg") {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        const isSizeMarker =
          marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isSizeMarker) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
    }
  } catch {
    // Dimensions are a nicety; failing to read them is not an error.
  }
  return null;
}
