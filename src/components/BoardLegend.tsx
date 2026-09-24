"use client";

import { DEVICES, STATE_SHORT, type CellState } from "@/lib/board";
import { DeviceMark } from "@/components/DeviceMark";

/**
 * The devices, drawn, with one of them in hand.
 *
 * This used to be a legend: a row of coloured squares to be looked up before a
 * board meant anything. There is nothing to look up now, because the board
 * draws the devices themselves — so the same strip does a better job as the
 * thing you pick up a device from.
 *
 * Read-only boards still get it as a plain key, with nothing to pick.
 */
export function BoardLegend({
  picked,
  onPick,
}: {
  /** The device in hand. Leave it out for a key rather than a palette. */
  picked?: CellState;
  onPick?: (state: CellState) => void;
}) {
  const choosing = Boolean(onPick);
  const states: CellState[] = choosing ? ["EMPTY", ...DEVICES] : DEVICES;

  return (
    <div className={`device-palette ${choosing ? "is-choosing" : ""}`}>
      {choosing ? <span className="device-palette-label">Place</span> : null}
      <ul className="device-palette-list">
        {states.map((state) => (
          <li key={state}>
            {choosing ? (
              <button
                type="button"
                className={`device-chip ${picked === state ? "is-picked" : ""}`}
                onClick={() => onPick?.(state)}
                title={
                  state === "EMPTY"
                    ? "Clear a way back to nothing"
                    : `Place a ${STATE_SHORT[state].toLowerCase()}`
                }
                aria-pressed={picked === state}
              >
                <Face state={state} />
                <span className="device-chip-name">{STATE_SHORT[state]}</span>
              </button>
            ) : (
              <span className="device-chip is-static">
                <Face state={state} />
                <span className="device-chip-name">{STATE_SHORT[state]}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The picture on a chip.
 *
 * A three-phase device is shown as the three modules it really takes up,
 * stacked, so picking one is picking something of that size rather than a
 * label that says so.
 */
function Face({ state }: { state: CellState }) {
  if (state === "EMPTY") {
    return <span className="device-chip-face is-empty" aria-hidden />;
  }
  if (state.endsWith("_3P")) {
    return (
      <span className="device-chip-face is-tall" aria-hidden>
        <DeviceMark state={state} part="top" />
        <DeviceMark state={state} part="middle" />
        <DeviceMark state={state} part="bottom" />
      </span>
    );
  }
  return (
    <span className={`device-chip-face is-${state.toLowerCase()}`} aria-hidden>
      <DeviceMark state={state} />
    </span>
  );
}
