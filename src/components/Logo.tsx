/**
 * The OptiLink mark and lockup, drawn as SVG so it is always present, always
 * sharp, and needs nothing uploaded. Artwork uploaded under Settings still
 * takes precedence wherever a logo is shown.
 *
 * Geometry is generated once and inlined — see public/brand/optilink-mark.svg
 * for the standalone file.
 */

const SEGMENTS: Array<{ d: string; fill: string }> = [
  { d: "M73.50 9.30A47.0 47.0 0 0 1 82.43 15.98L75.35 22.36A37.5 37.5 0 0 0 69.37 17.89Z", fill: "#66CEF2" },
  { d: "M86.33 20.18A47.0 47.0 0 0 1 92.33 29.58L83.46 33.06A37.5 37.5 0 0 0 79.44 26.77Z", fill: "#60C5EB" },
  { d: "M94.51 34.89A47.0 47.0 0 0 1 96.81 45.80L87.28 45.93A37.5 37.5 0 0 0 85.73 38.63Z", fill: "#5BBCE4" },
  { d: "M96.97 51.54A47.0 47.0 0 0 1 95.29 62.56L86.32 59.33A37.5 37.5 0 0 0 87.45 51.95Z", fill: "#55B3DC" },
  { d: "M93.42 67.99A47.0 47.0 0 0 1 87.96 77.71L80.71 71.52A37.5 37.5 0 0 0 84.36 65.01Z", fill: "#4FABD5" },
  { d: "M84.30 82.13A47.0 47.0 0 0 1 75.77 89.31L71.16 80.96A37.5 37.5 0 0 0 76.87 76.16Z", fill: "#4AA2CE" },
  { d: "M70.79 92.15A47.0 47.0 0 0 1 60.27 95.86L58.90 86.43A37.5 37.5 0 0 0 65.94 83.94Z", fill: "#4499C7" },
  { d: "M54.61 96.77A47.0 47.0 0 0 1 43.46 96.54L45.49 87.23A37.5 37.5 0 0 0 52.96 87.38Z", fill: "#3E90C0" },
  { d: "M37.84 95.40A47.0 47.0 0 0 1 27.48 91.26L32.67 83.26A37.5 37.5 0 0 0 39.60 86.03Z", fill: "#3987B8" },
  { d: "M22.62 88.20A47.0 47.0 0 0 1 14.39 80.68L22.07 75.02A37.5 37.5 0 0 0 27.58 80.06Z", fill: "#337EB1" },
  { d: "M10.92 76.11A47.0 47.0 0 0 1 5.87 66.17L15.04 63.58A37.5 37.5 0 0 0 18.43 70.23Z", fill: "#2D75AA" },
  { d: "M4.23 60.67A47.0 47.0 0 0 1 3.00 49.59L12.50 50.39A37.5 37.5 0 0 0 13.32 57.81Z", fill: "#286CA3" },
  { d: "M3.40 43.87A47.0 47.0 0 0 1 6.16 33.06L14.77 37.16A37.5 37.5 0 0 0 12.92 44.39Z", fill: "#22649C" },
  { d: "M8.55 27.84A47.0 47.0 0 0 1 14.94 18.70L21.55 25.57A37.5 37.5 0 0 0 17.27 31.69Z", fill: "#1C5B94" },
  { d: "M19.01 14.66A47.0 47.0 0 0 1 28.21 8.36L31.98 17.11A37.5 37.5 0 0 0 25.82 21.34Z", fill: "#17528D" },
  { d: "M33.44 6.01A47.0 47.0 0 0 1 44.27 3.35L44.72 12.87A37.5 37.5 0 0 0 37.47 14.66Z", fill: "#114986" },
];

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="presentation" focusable="false">
      {SEGMENTS.map((segment, index) => (
        <path key={index} d={segment.d} fill={segment.fill} />
      ))}
    </svg>
  );
}

export function Logo({
  className,
  tagline = true,
  tone = "dark",
  size,
}: {
  className?: string;
  tagline?: boolean;
  /** "light" swaps the wordmark to white, for placing on a dark background. */
  tone?: "dark" | "light";
  /**
   * Height of the wordmark in pixels; everything else scales from it. Left
   * unset the lockup sizes itself to the viewport.
   */
  size?: number;
}) {
  return (
    <span
      className={`ol-logo ${tone === "light" ? "is-light" : ""} ${className ?? ""}`}
      style={size ? { fontSize: `${size}px` } : undefined}
    >
      <LogoMark className="ol-logo-mark" />
      <span className="ol-logo-text">
        <span className="ol-logo-word">
          <span className="ol-logo-opti">Opti</span>
          <span className="ol-logo-link">Link</span>
        </span>
        {tagline ? (
          <span className="ol-logo-tag">Electrical &amp; Communications</span>
        ) : null}
      </span>
    </span>
  );
}
