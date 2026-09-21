import sharp from "sharp";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";

/**
 * The signatures the app holds.
 *
 * Kept in the file store rather than in the repository: a signature is the
 * thing that makes a document binding, and it has no business sitting in
 * source control. They are imported once from the company's own release (see
 * safety/library.ts) and read from here by everything that signs something —
 * a JSA, a SWMS, and the sign-off at the end of every report.
 *
 * Nothing here throws. A report with no signature on file prints the ruled
 * line it always printed, which is a document waiting for a pen rather than a
 * broken one.
 */
export async function signatureBytes(key: string): Promise<Buffer | null> {
  try {
    let held = await prisma.signature.findUnique({ where: { key }, include: { file: true } });
    if (!held) {
      // A fresh deployment has never fetched the library, so the first report
      // it draws is the one that goes and gets it. Imported through a dynamic
      // import because library.ts reaches back here for this same function.
      const { ensureLibrary } = await import("@/lib/safety/library");
      await ensureLibrary();
      held = await prisma.signature.findUnique({ where: { key }, include: { file: true } });
    }
    if (!held) return null;
    return trim(await readUpload(held.file.storedName));
  } catch {
    return null;
  }
}

/**
 * The blank around a signature, taken off.
 *
 * They were signed on a tablet and saved with whatever margin the app left
 * around them, so the mark itself can be half the image. Anything drawing one
 * fits it to a box, and an untrimmed image fits its padding rather than the
 * signature — which comes out a third the size it should be. Trimming once
 * here means every document gets the mark at the size it was asked for.
 */
async function trim(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes).trim({ threshold: 10 }).png().toBuffer();
  } catch {
    return bytes;
  }
}

/** Who signs a report: the director, whose name is already printed under it. */
export function reportSignature(): Promise<Buffer | null> {
  return signatureBytes("scott");
}
