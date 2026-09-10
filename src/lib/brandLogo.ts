import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The OptiLink artwork, committed at `public/brand/logo.jpg`. It is used
 * everywhere the logo appears, with no setup and nothing to upload.
 *
 * To replace it — a transparent PNG, or an SVG — drop a file into
 * `public/brand/` named `logo.svg`, `logo.png` or `logo.webp` and it takes
 * precedence. Artwork uploaded through the app takes precedence over both.
 */

const COMMITTED_LOGO = "/brand/logo.jpg";
const OVERRIDES = ["logo.svg", "logo.png", "logo.webp"];

let override: string | null | undefined;

function overrideLogoUrl(): string | null {
  if (override !== undefined) return override;
  const brandDir = path.join(process.cwd(), "public", "brand");
  override =
    OVERRIDES.map((name) => (existsSync(path.join(brandDir, name)) ? `/brand/${name}` : null)).find(
      (url): url is string => url !== null,
    ) ?? null;
  return override;
}

export function resolveLogoUrl(uploadedFileId?: string | null): string {
  if (uploadedFileId) return `/api/files/${uploadedFileId}`;
  return overrideLogoUrl() ?? COMMITTED_LOGO;
}
