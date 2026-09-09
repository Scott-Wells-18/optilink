/**
 * Pushes the saved brand colours into the CSS variables the whole app reads.
 * Rendered on the server so there is no flash of the default palette.
 */
export function BrandStyle({
  primary,
  accent,
}: {
  primary: string;
  accent: string;
}) {
  const safePrimary = sanitiseColour(primary, "#0B3B60");
  const safeAccent = sanitiseColour(accent, "#F5A623");
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `:root{--brand:${safePrimary};--brand-accent:${safeAccent};}`,
      }}
    />
  );
}

/** Only ever emits a hex colour, so saved settings cannot inject CSS. */
export function sanitiseColour(value: string | null | undefined, fallback: string): string {
  if (typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) {
    return value.trim();
  }
  return fallback;
}
