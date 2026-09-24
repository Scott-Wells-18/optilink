import { isThreePhase, type CellState, type Part } from "@/lib/board";

/**
 * A device drawn as the thing it is.
 *
 * A board used to be a grid of coloured rectangles, and a colour has to be
 * looked up in a legend before it means anything. A picture does not: a
 * breaker has a toggle at one end, an RCD has a test button, a contactor has
 * terminals along the top and bottom and no toggle at all. An electrician
 * reads those at a glance, because they are what is in front of them when the
 * door is open.
 *
 * Everything is drawn on a 100 x 30 box, which is the shape of a way on
 * screen. The drawing is stretched to fill whatever it is put in, so the box
 * is kept close to that shape on purpose: at roughly three to one a unit
 * across and a unit down come out the same size, and a toggle drawn square
 * stays square.
 *
 * A three-phase device is three modules tall and is drawn a third at a time.
 * `part` says which third: the toggle runs through all three but is only
 * drawn once, the test button sits on the bottom module where it is on the
 * real thing, and the shell runs past the edges so the three meet with no
 * seam.
 */

const W = 100;
const H = 30;

/** The toggle at one end, the test button at the other. */
const TOGGLE = { x: 75, w: 15 };

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
      {state === "BLANK" ? <Hatching /> : null}
      {upright ? <g transform={`translate(0 ${W}) rotate(-90)`}>{drawn}</g> : drawn}
    </svg>
  );
}

/**
 * The diagonal fill a blank is marked with.
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
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line className="dm-hatch-line" x1="0" y1="0" x2="0" y2="5" />
      </pattern>
    </defs>
  );
}

function body(state: CellState, part: Part) {
  if (state === "BLANK") return blank(part);
  if (state === "CONTACTOR" || state === "CONTACTOR_3P") return contactor(part);
  return protective(state, part);
}

/**
 * A blank: the filler plate that closes an unused way.
 *
 * Nothing to operate — no toggle, no test button, no terminals — so it is
 * drawn hatched, the way a blank is marked up on a drawing. There is no
 * mistaking it for a device at any size.
 */
function blank(part: Part) {
  const y = top(part);
  const h = height(part);
  return (
    <>
      <rect className="dm-shell is-blank" x="1" y={y} width={W - 2} height={h} rx="2.5" />
      <rect x="1" y={y} width={W - 2} height={h} rx="2.5" fill="url(#dm-hatching)" stroke="none" />
      <rect className="dm-outline" x="1" y={y} width={W - 2} height={h} rx="2.5" />
    </>
  );
}

/**
 * A breaker, an RCD or an RCBO: the same module with different furniture.
 *
 * All three are a body with a toggle at one end. What separates them is the
 * test button, which only a device with a residual-current element carries,
 * and the overcurrent band, which only a device that also breaks an overload
 * carries. An RCD has the first and not the second; a breaker has the second
 * and not the first; an RCBO does both jobs in one module and so has both.
 */
function protective(state: CellState, part: Part) {
  // The toggle only runs the height of three modules where the device really
  // is standing across three. One drawn in its own way alone — because it
  // will not fit where it was saved — gets the toggle its own way can hold,
  // rather than one hanging off the end of the rail.
  const three = isThreePhase(state) && part === "middle";
  const isRcd = state === "RCD" || state === "RCD_3P";
  const isRcbo = state === "RCBO" || state === "RCBO_3P";

  const showToggle = part === "whole" || part === "middle";
  // The furniture goes on the bottom module of a three-phase device, which is
  // where it is on the real thing: under the toggle, not beside it.
  const showFace = part === "whole" || part === "bottom";

  return (
    <>
      <rect className="dm-shell" x="1" y={top(part)} width={W - 2} height={height(part)} rx="2.5" />

      {showFace ? (
        <>
          {/* The two lines moulded across the body of every one of these. */}
          <line className="dm-rule" x1="22" y1="12" x2="68" y2="12" />
          <line className="dm-rule" x1="22" y1="18" x2="68" y2="18" />

          {/* The test button. Big on an RCD, which does nothing else; small on
              an RCBO, which has a breaker in the same module. */}
          {isRcd ? (
            <rect className="dm-test is-large" x="5" y="6" width="12" height="18" rx="1.5" />
          ) : null}
          {isRcbo ? (
            <rect className="dm-test" x="6" y="9" width="10" height="12" rx="1.5" />
          ) : null}
          {/* The overcurrent side: a breaker has it, an RCD does not, and an
              RCBO has it as well as the test button. */}
          {!isRcd ? <rect className="dm-band" x="70" y="6" width="3" height="18" rx="1" /> : null}
        </>
      ) : null}

      {showToggle ? (
        <g>
          <rect
            className="dm-toggle"
            x={TOGGLE.x}
            y={three ? -H + 6 : 6}
            width={TOGGLE.w}
            height={three ? H * 3 - 22 : H - 12}
            rx="1.6"
          />
          <g className="dm-ribs">
            {[4, 7.5, 11].map((offset) => (
              <line
                key={offset}
                x1={TOGGLE.x + offset}
                y1={three ? -H + 10 : 10}
                x2={TOGGLE.x + offset}
                y2={three ? H * 2 - 16 : H - 10}
              />
            ))}
          </g>
        </g>
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
      <rect
        className="dm-shell is-contactor"
        x="1"
        y={top(part)}
        width={W - 2}
        height={height(part)}
        rx="2.5"
      />

      {/* The terminal screws, in two rows the way they are on the real thing. */}
      {poles.map((x) => (
        <g key={x}>
          <rect className="dm-hole" x={x - 3} y="4" width="6" height="6" rx="1.4" />
          <rect className="dm-hole" x={x - 3} y={H - 10} width="6" height="6" rx="1.4" />
        </g>
      ))}

      {/* The coil, in its own column down the end. Nothing to operate by hand:
          that is what makes a contactor unmistakable. */}
      <line className="dm-divide" x1="68" y1={top(part)} x2="68" y2={top(part) + height(part)} />
      <rect className="dm-hole" x="79" y="4" width="6" height="6" rx="1.4" />
      <rect className="dm-hole" x="79" y={H - 10} width="6" height="6" rx="1.4" />
      <rect className="dm-coil" x="74" y="12.5" width="16" height="5" rx="1.4" />
    </>
  );
}

/**
 * Where the shell starts and how tall it is.
 *
 * A third of a three-phase device runs past both edges of its own way, so the
 * rounded corners fall outside and the three parts meet with no seam. Only
 * the true top and bottom of the device get a corner.
 */
function top(part: Part): number {
  return part === "whole" || part === "top" ? 1 : -4;
}

function height(part: Part): number {
  if (part === "whole") return H - 2;
  if (part === "middle") return H + 8;
  return H + 3;
}
