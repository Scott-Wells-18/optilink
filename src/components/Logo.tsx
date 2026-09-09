/**
 * The OptiLink mark, drawn as SVG so it stays crisp from the 300px sign-in
 * screen down to the 40px header. If a logo file is uploaded in Settings that
 * image is used instead — this is the fallback.
 */

const SEGMENTS = 11;
/** The ring opens toward the wordmark, so it starts past 1 o'clock. */
const START_ANGLE = -56;
const SWEEP = 318;
const RADIUS = 38;
const THICKNESS = 9.5;
/**
 * Each segment is a short arc with a round cap, so the cap itself supplies most
 * of the visible length. Keeping the arc short is what leaves a clean gap
 * between segments instead of them fusing into a solid ring.
 */
const ARC_SPAN = 10;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mix(from: [number, number, number], to: [number, number, number], t: number) {
  return `rgb(${from.map((c, i) => Math.round(lerp(c, to[i], t))).join(",")})`;
}

const LIGHT: [number, number, number] = [92, 200, 238];
const DEEP: [number, number, number] = [21, 86, 152];

function arcPath(startDeg: number, endDeg: number) {
  const toPoint = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [50 + RADIUS * Math.cos(rad), 50 + RADIUS * Math.sin(rad)];
  };
  const [x1, y1] = toPoint(startDeg);
  const [x2, y2] = toPoint(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function LogoMark({ className }: { className?: string }) {
  const step = SWEEP / SEGMENTS;

  return (
    <svg viewBox="0 0 100 100" className={className} role="presentation">
      {Array.from({ length: SEGMENTS }, (_, index) => {
        const start = START_ANGLE + index * step;
        const end = start + ARC_SPAN;
        // Colour runs light at the top round to deep blue at the bottom left.
        const t = index / (SEGMENTS - 1);
        return (
          <path
            key={index}
            d={arcPath(start, end)}
            stroke={mix(LIGHT, DEEP, t)}
            strokeWidth={THICKNESS}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`ol-logo ${className ?? ""}`}>
      <LogoMark className="ol-logo-mark" />
      <div className="ol-logo-text">
        <span className="ol-logo-word">
          <span className="ol-logo-opti">Opti</span>
          <span className="ol-logo-link">Link</span>
        </span>
        <span className="ol-logo-tag">Electrical &amp; Communications</span>
      </div>
    </div>
  );
}
