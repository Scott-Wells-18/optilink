import sharp from "sharp";
import { extractImages, getDocumentProxy } from "unpdf";
import { ocrWorker } from "@/lib/ocr";

/**
 * Reading a certificate that was scanned rather than typed.
 *
 * A laboratory that prints its certificate, signs it and puts it through a
 * scanner produces a PDF with no text in it at all — every word on the page is
 * part of a photograph. Searching such a file for "Calibration Date" finds
 * nothing, which is exactly how a certificate that plainly shows the date came
 * back with the date blank.
 *
 * So where a certificate has no text layer, the picture is taken back out of
 * it and read. The page is not re-rendered — the scan is already in there as
 * an image, and pulling it out is both faster and sharper than drawing the
 * page again would be.
 */

/** No more than this many pages are read. A certificate's facts are at the front. */
const PAGES = 2;

/** Below this, an image is a logo or a signature rather than a scanned page. */
const MIN_PIXELS = 200_000;

export async function readScan(pdf: Buffer): Promise<string> {
  const pictures = await pagePictures(pdf);
  if (pictures.length === 0) return "";

  const instance = await ocrWorker("page");
  const found: string[] = [];
  for (const picture of pictures) {
    try {
      const { data } = await instance.recognize(picture);
      if (data.text?.trim()) found.push(data.text);
    } catch {
      // A page that will not read is not worth failing the certificate over.
    }
  }
  return found.join("\n");
}

/**
 * The scanned page out of each of the first few pages, as a PNG.
 *
 * Only the biggest image on a page is taken: a scan is one picture covering
 * the whole page, and anything smaller beside it is a logo, a stamp or a
 * signature, none of which carries the facts being looked for.
 */
async function pagePictures(pdf: Buffer): Promise<Buffer[]> {
  const out: Buffer[] = [];

  for (let page = 1; page <= PAGES; page += 1) {
    // A fresh proxy per page: the document is consumed as it is read, and
    // reusing one across pages returns nothing on the second.
    let document;
    try {
      document = await getDocumentProxy(new Uint8Array(pdf));
      if (page > document.numPages) break;
    } catch {
      break;
    }

    let biggest: Picture | null = null;
    try {
      for await (const image of await extractImages(document, page)) {
        const size = image.width * image.height;
        if (size < MIN_PIXELS) continue;
        if (!biggest || size > biggest.width * biggest.height) {
          biggest = {
            // Raw pixels either way; the typed array they arrive in varies
            // with how the page stored them.
            data: Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength),
            width: image.width,
            height: image.height,
            channels: image.channels as number,
          };
        }
      }
    } catch {
      continue;
    }
    if (!biggest) continue;

    const png = await toPng(biggest);
    if (png) out.push(png);
  }

  return out;
}

/**
 * The raw pixels, flattened to something the engine reads well.
 *
 * A scan is grey paper with dark ink on it, and normalising the contrast
 * before reading is what turns a tired photocopy into words. The width is held
 * at what a scan usually is: reading a huge image is slow, and reading a small
 * one badly is worse.
 */
type Picture = { data: Buffer; width: number; height: number; channels: number };

async function toPng(image: Picture): Promise<Buffer | null> {
  const channels = image.channels === 1 || image.channels === 3 || image.channels === 4
    ? (image.channels as 1 | 3 | 4)
    : null;
  if (!channels) return null;
  if (image.data.length < image.width * image.height * channels) return null;

  try {
    return await sharp(image.data, {
      raw: { width: image.width, height: image.height, channels },
    })
      .removeAlpha()
      .greyscale()
      .resize({ width: Math.min(2400, Math.max(image.width, 1200)), kernel: "lanczos3" })
      .normalise()
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
