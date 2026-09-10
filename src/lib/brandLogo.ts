import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Where the logo comes from, in order of preference:
 *
 *  1. Artwork uploaded under Settings → Branding.
 *  2. A file dropped into `public/brand/` named `logo.<ext>` — the easiest
 *     route if you would rather commit the original artwork than upload it.
 *  3. The built-in SVG lockup.
 */

const CANDIDATES = ["logo.svg", "logo.png", "logo.webp", "logo.jpg", "logo.jpeg"];

let cached: string | null | undefined;

export function droppedLogoUrl(): string | null {
  if (cached !== undefined) return cached;
  const brandDir = path.join(process.cwd(), "public", "brand");
  cached = CANDIDATES.map((name) => (existsSync(path.join(brandDir, name)) ? `/brand/${name}` : null))
    .find((url): url is string => url !== null) ?? null;
  return cached;
}

/** Null means "draw the built-in SVG lockup". */
export function resolveLogoUrl(uploadedFileId: string | null | undefined): string | null {
  if (uploadedFileId) return `/api/files/${uploadedFileId}`;
  return droppedLogoUrl();
}
