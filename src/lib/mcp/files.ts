import sharp from "sharp";
import { saveUpload } from "@/lib/storage";
import { PHOTO_BUDGET } from "@/lib/jobs";

/**
 * Taking a picture handed over as text.
 *
 * An assistant has no file to post: it has the image as base64 in the middle
 * of a JSON message. So it arrives that way, is decoded, and goes through the
 * same door everything else does.
 *
 * It is resized on the way in, to the same budget the browser applies before
 * it uploads. A works photograph is printed about two inches across, so
 * eleven hundred pixels is already more than twice what the page can use, and
 * a run of them at full size is what fills a volume.
 */

/** The largest thing worth accepting in one message. */
const MAX_BYTES = 12 * 1024 * 1024;

export async function storeImage(data: string, name: string) {
  const bytes = decode(data);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("That image is too large to send this way. Keep it under 12 MB.");
  }

  const jpeg = await shrink(bytes);
  const file = new File([new Uint8Array(jpeg)], tidyName(name), { type: "image/jpeg" });
  return saveUpload(file);
}

/**
 * Anything that is not a picture — an instrument's export, a recording, a
 * quote — kept byte for byte, because what makes it worth having is that it
 * is the file as it was issued.
 */
export async function storeFile(data: string, name: string, mimeType: string) {
  const bytes = decode(data);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("That file is too large to send this way. Keep it under 12 MB.");
  }
  const file = new File([new Uint8Array(bytes)], tidyName(name), { type: mimeType });
  return saveUpload(file);
}

/** Base64, with or without the data: URL a model is just as likely to send. */
function decode(data: string): Buffer {
  const raw = data.trim();
  const base64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0) throw new Error("That image was empty once decoded.");
  return bytes;
}

async function shrink(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes)
      .rotate()
      .resize({
        width: PHOTO_BUDGET.maxEdge,
        height: PHOTO_BUDGET.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: Math.round(PHOTO_BUDGET.quality * 100) })
      .toBuffer();
  } catch {
    throw new Error("That did not decode as an image.");
  }
}

function tidyName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "").slice(0, 120);
  return cleaned || "upload";
}
