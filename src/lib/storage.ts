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
  // Quotes come out of the accounting software as CSV, and a power logger's
  // recording arrives as either a CSV or the spreadsheet someone saved it into.
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

/** The same story for a spreadsheet, which arrives under several names. */
const SHEET_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "application/zip",
  "",
]);

function declaredType(file: File): string {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".csv") && CSV_TYPES.has(type)) return "text/csv";
  if (name.endsWith(".xlsx") && SHEET_TYPES.has(type)) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return type;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export class UploadError extends Error {}

export async function saveUpload(file: File) {
  const mimeType = declaredType(file);
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw new UploadError(
      "That file type is not supported. Please upload a JPEG, PNG, WebP or AVIF image, a PDF, a CSV or a spreadsheet.",
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

/**
 * Every place a stored file can still be spoken for.
 *
 * Used to decide whether a file that has just lost one reference is now
 * unreferenced and can go. It has to name every relation: a file this misses
 * would be deleted out from under whatever still points at it.
 */
const REFERENCES = {
  thermalFor: true,
  visualFor: true,
  photos: true,
  observationPhotos: true,
  settingsLogo: true,
  settingsLogoMark: true,
  issuePhotos: true,
  jobPhotos: true,
  rcdSources: true,
  safetyTemplates: true,
  signatures: true,
  safetyDocSources: true,
  powerSources: true,
  equipmentCerts: true,
  equipmentPhotos: true,
} as const;

/**
 * Let go of files nothing points at any more.
 *
 * A works report is twenty-seven photographs an item, and deleting the report
 * used to leave every one of them on the volume for good: the row that joined
 * them to the job went, and the file itself stayed behind with nothing to find
 * it by. Visit after visit that is what fills the disk.
 *
 * So whoever removes the rows that referenced a file calls this afterwards
 * with its ids. A file that something else still holds — a photo also used on
 * a thermal finding, a certificate on a piece of gear — is counted and kept.
 */
export async function releaseFiles(ids: string[]): Promise<number> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return 0;

  const files = await prisma.uploadedFile.findMany({
    where: { id: { in: wanted } },
    select: { id: true, storedName: true, _count: { select: REFERENCES } },
  });

  let released = 0;
  for (const file of files) {
    const held = Object.values(file._count).reduce((total, count) => total + count, 0);
    if (held > 0) continue;
    try {
      await unlink(path.resolve(uploadDir(), file.storedName));
    } catch {
      // Already gone from disk — removing the row is still the right outcome.
    }
    await prisma.uploadedFile.delete({ where: { id: file.id } });
    released += 1;
  }
  return released;
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
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return ".xlsx";
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
