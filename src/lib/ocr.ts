import { existsSync } from "node:fs";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Reading words off a picture.
 *
 * Two things in this app need it and they need it differently: a thermal
 * camera's overlay is a handful of short lines burned into a busy image, and a
 * scanned calibration certificate is a whole page of ordinary document. Both
 * want the same engine started the same fiddly way, so the plumbing lives here
 * and each caller asks for the page layout that suits it.
 */

export const LANG_PATH = path.join(process.cwd(), "tessdata");

/**
 * Pointed at explicitly: the worker is started by absolute path, and the path
 * the library works out for itself is relative to the bundle rather than to
 * where the package actually lives.
 */
export function workerPath(): string | undefined {
  const candidates = [
    path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
    path.join(
      process.cwd(),
      "node_modules/.pnpm/node_modules/tesseract.js/src/worker-script/node/index.js",
    ),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * How the page is expected to be laid out. Tesseract's own numbering:
 * 3 is a full page of mixed text, 6 is one uniform block.
 */
export type PageLayout = "page" | "block";

const workers = new Map<PageLayout, Promise<Worker>>();

/**
 * One worker per layout, kept for the life of the process — starting one costs
 * seconds, and the mode cannot be changed per call without racing whatever
 * else is using it.
 */
export function ocrWorker(layout: PageLayout): Promise<Worker> {
  let held = workers.get(layout);
  if (!held) {
    held = (async () => {
      const instance = await createWorker("eng", 1, {
        langPath: LANG_PATH,
        workerPath: workerPath(),
        gzip: true,
        cachePath: path.join(process.cwd(), ".tesseract"),
        logger: () => {},
      });
      await instance.setParameters({
        tessedit_pageseg_mode: (layout === "page" ? "3" : "6") as never,
      });
      return instance;
    })();
    workers.set(layout, held);
  }
  return held;
}
