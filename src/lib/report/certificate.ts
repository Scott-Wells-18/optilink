import { PDFDocument } from "pdf-lib";

/**
 * Binding a calibration certificate into a report without redrawing it.
 *
 * A certificate is somebody else's document and the only version of it worth
 * printing is the one they issued. Reading its text out and setting it again
 * in our own type would produce something that says the same words and proves
 * nothing, so the page itself goes in: pdf-lib embeds the certificate's pages
 * as drawable objects and stamps each one into a rectangle on our page, at
 * whatever scale fits. Vector text stays vector text, so it is still sharp and
 * still selectable at any zoom — better than a screenshot, and exact.
 *
 * The work happens in two passes because the report is drawn with pdfkit,
 * which cannot do this. First the page sizes are read so the layout knows what
 * shape it is fitting; pdfkit then draws everything around the gaps, including
 * their borders; and finally the certificate pages are stamped into them.
 */

export type Box = { x: number; y: number; width: number; height: number };

/** Where one certificate page goes: which report page, and where on it. */
export type Slot = Box & {
  /** Zero-based index into the finished report. */
  page: number;
  /** Zero-based index into the certificate. */
  source: number;
};

export type Certificate = {
  /** One entry per page, in points. */
  sizes: { width: number; height: number }[];
  bytes: Buffer;
};

/**
 * The certificate's page sizes, or null where the file will not open.
 *
 * A certificate that cannot be read is not worth failing a whole report over:
 * the report is built without it, and the equipment page says so.
 */
export async function readCertificate(bytes: Buffer): Promise<Certificate | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const sizes = doc.getPages().map((page) => {
      const { width, height } = page.getSize();
      return { width, height };
    });
    return sizes.length > 0 ? { sizes, bytes } : null;
  } catch {
    return null;
  }
}

/**
 * The largest rectangle of the certificate's own shape that fits the space,
 * centred in it.
 *
 * A portrait certificate in a wide gap is limited by the height and floats in
 * the middle of it; a landscape one is limited by the width. Nothing is ever
 * cropped or stretched, because a certificate with its margins trimmed off
 * looks like a certificate that has been tampered with.
 */
export function fitted(
  space: Box,
  size: { width: number; height: number },
): Box {
  const scale = Math.min(space.width / size.width, space.height / size.height);
  const width = size.width * scale;
  const height = size.height * scale;
  return {
    x: space.x + (space.width - width) / 2,
    y: space.y + (space.height - height) / 2,
    width,
    height,
  };
}

/**
 * Stamps each certificate page into the gap left for it.
 *
 * `slots` are in the coordinates pdfkit drew them in, with the origin at the
 * top-left of the page; a PDF's own origin is the bottom-left, so every y is
 * turned over on the way in. Getting that wrong puts the certificate off the
 * bottom of the page rather than producing anything that looks wrong, which is
 * why it is done in exactly one place.
 */
export async function stampCertificate(
  report: Buffer,
  certificate: Certificate,
  slots: Slot[],
  pageHeight: number,
): Promise<Buffer> {
  if (slots.length === 0) return report;

  const doc = await PDFDocument.load(report);
  const wanted = [...new Set(slots.map((slot) => slot.source))].sort((a, b) => a - b);
  const embedded = await doc.embedPdf(certificate.bytes, wanted);
  const byIndex = new Map(wanted.map((source, at) => [source, embedded[at]]));

  const pages = doc.getPages();
  for (const slot of slots) {
    const page = pages[slot.page];
    const held = byIndex.get(slot.source);
    if (!page || !held) continue;
    page.drawPage(held, {
      x: slot.x,
      y: pageHeight - slot.y - slot.height,
      width: slot.width,
      height: slot.height,
    });
  }

  return Buffer.from(await doc.save());
}
