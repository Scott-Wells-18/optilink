import { isThreePhase, type CellState, type Part } from "@/lib/board";

/**
 * A device drawn as the thing it is.
 *
 * Line art, no colour. A board is a rail of modules: plain rectangles with an
 * outline, the operable parts hatched. A toggle is a hatched bar toward one
 * end; an RCD's push button is a hatched square at the other; a blank is
 * hatched all over, because there is nothing on it to operate. That is how a
 * board is drawn on paper, and it is what an electrician recognises.
 *
 * Nothing here is told apart by colour, so nothing is lost in a black and
 * white print, on a phone in the sun, or to anybody who does not separate red
 * from green.
 *
 * Everything is drawn on a 100 x 30 box, the shape of a way on screen, and
 * stretched to fill whatever it is put in. At roughly three to one a unit
 * across and a unit down come out about the same size, so a square drawn
 * square stays square.
 *
 * A three-phase device is three modules tall and is drawn a third at a time.
 * `part` says which third: the toggle bar runs through all three but is drawn
 * once, from the middle, and the push button sits on the bottom module where
 * it is on the real thing.
 */

const W = 100;
const H = 30;

/** The toggle bar, toward the far end of the module. */
const TOGGLE = { x: 72, w: 11 };

export function DeviceMark({
  state,
  part = "whole",
  upright = false,
  className,
}: {
  state: CellState;
  part?: Part;
  /**
   * Standing on end rather than lying on its side.
   *
   * A tall board reads as rows of modules lying down; a sub-board is one rail
   * of modules standing upright, which is how a small DB looks with the door
   * off. Same drawing, turned a quarter turn, so the toggle ends up at the
   * top where it belongs.
   */
  upright?: boolean;
  className?: string;
}) {
  if (state === "EMPTY") return null;

  const drawn = body(state, part);

  return (
    <svg
      className={`device-mark ${upright ? "is-upright" : ""} ${className ?? ""}`}
      viewBox={upright ? `0 0 ${H} ${W}` : `0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <Hatching />
      {upright ? <g transform={`translate(0 ${W}) rotate(-90)`}>{drawn}</g> : drawn}
    </svg>
  );
}

/**
 * The diagonal fill every operable part is marked with.
 *
 * Defined inside each drawing rather than once at the root: every copy is
 * identical, so nothing depends on which one the browser resolves, and a mark
 * never comes out unfilled because the page it was put on forgot the defs.
 */
function Hatching() {
  return (
    <defs>
      <pattern
        id="dm-hatching"
        width="4"
        height="4"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line className="dm-hatch-line" x1="0" y1="0" x2="0" y2="4" />
      </pattern>
    </defs>
  );
}

function body(state: CellState, part: Part) {
  if (state === "BLANK") return blank(part);
  if (state === "CONTACTOR" || state === "CONTACTOR_3P") return contactor(part);
  return protective(state, part);
}

/** Hatched, and outlined on top so the edge stays crisp. */
function Hatched({
  x,
  y,
  width,
  height: tall,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <>
      <rect x={x} y={y} width={width} height={tall} fill="url(#dm-hatching)" stroke="none" />
      <rect className="dm-line" x={x} y={y} width={width} height={tall} />
    </>
  );
}

/**
 * A blank: the filler plate that closes an unused way.
 *
 * Nothing to operate, so it is hatched right across. There is no mistaking it
 * for a device at any size.
 */
function blank(part: Part) {
  const y = top(part);
  const h = height(part);
  return (
    <>
      <rect className="dm-shell" x="0.5" y={y} width={W - 1} height={h} />
      <Hatched x={0.5} y={y} width={W - 1} height={h} />
    </>
  );
}

/**
 * A breaker, an RCD or an RCBO: the same module with different furniture.
 *
 * All three are a body with a toggle. What separates them is the push button,
 * which only a device with a residual-current element carries — big on an RCD,
 * which does nothing else, and small on an RCBO, which has a breaker in the
 * same module. A breaker has no push button at all.
 */
function protective(state: CellState, part: Part) {
  const isRcd = state === "RCD" || state === "RCD_3P";
  const isRcbo = state === "RCBO" || state === "RCBO_3P";

  // The bar runs the height of three modules only where the device really is
  // standing across three.
  const three = isThreePhase(state) && part === "middle";
  const showToggle = part === "whole" || part === "middle";
  // The push button goes on the bottom module of a three-phase device, which
  // is where it is on the real thing: under the bar, not beside it.
  const showButton = part === "whole" || part === "bottom";

  return (
    <>
      <rect className="dm-shell" x="0.5" y={top(part)} width={W - 1} height={height(part)} />

      {showButton && isRcd ? <Hatched x={5} y={6} width={13} height={18} /> : null}
      {showButton && isRcbo ? <Hatched x={6} y={9} width={9} height={12} /> : null}

      {showToggle ? (
        <Hatched
          x={TOGGLE.x}
          y={three ? -H + 5 : 5}
          width={TOGGLE.w}
          height={three ? H * 3 - 20 : H - 10}
        />
      ) : null}
    </>
  );
}

/**
 * A contactor: no toggle at all.
 *
 * It is switched by its coil, not by hand, so what shows on the face is rows
 * of terminals and the coil block down one end. That is what makes it
 * unmistakable on a board.
 */
function contactor(part: Part) {
  const poles = [14, 28, 42, 56];
  return (
    <>
      <rect className="dm-shell" x="0.5" y={top(part)} width={W - 1} height={height(part)} />

      {/* The terminal screws, in two rows the way they are on the real thing. */}
      {poles.map((x) => (
        <g key={x}>
          <rect className="dm-line" x={x - 3} y="4" width="6" height="6" />
          <rect className="dm-line" x={x - 3} y={H - 10} width="6" height="6" />
        </g>
      ))}

      {/* The coil, in its own column down the end. */}
      <line className="dm-line" x1="68" y1={top(part)} x2="68" y2={top(part) + height(part)} />
      <rect className="dm-line" x="79" y="4" width="6" height="6" />
      <rect className="dm-line" x="79" y={H - 10} width="6" height="6" />
      <Hatched x={74} y={12.5} width={16} height={5} />
    </>
  );
}

/**
 * Where the shell starts and how tall it is.
 *
 * A third of a three-phase device runs past both edges of its own way, so the
 * three parts meet with no seam and read as one device standing across three
 * ways.
 */
function top(part: Part): number {
  return part === "whole" || part === "top" ? 0.5 : -4;
}

function height(part: Part): number {
  if (part === "whole") return H - 1;
  if (part === "middle") return H + 8;
  return H + 3.5;
}
