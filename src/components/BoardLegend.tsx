import { DEVICES, STATE_LABELS, fitsTheGrid, polesOf } from "@/lib/board";

/** What each colour on a board means. Shown wherever a board is. */
export function BoardLegend() {
  return (
    <ul className="board-legend">
      {DEVICES.map((state) => (
        <li key={state}>
          <span className={`device-swatch is-${state.toLowerCase()}`} />
          {STATE_LABELS[state]}
          {polesOf(state) > 1 ? (
            <span className="board-legend-ways">{polesOf(state)} ways</span>
          ) : null}
          {fitsTheGrid(state) ? null : (
            <span className="board-legend-ways">by the mains</span>
          )}
        </li>
      ))}
    </ul>
  );
}
