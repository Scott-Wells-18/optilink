import { STATE_LABELS, type CellState } from "@/lib/board";

const STATES: CellState[] = ["EMPTY", "BLANK", "BREAKER", "RCD", "CONTACTOR"];

/** What each colour on a board means. Shown wherever a board is. */
export function BoardLegend() {
  return (
    <ul className="board-legend">
      {STATES.map((state) => (
        <li key={state}>
          <span className={`board-swatch is-${state.toLowerCase()}`} />
          {STATE_LABELS[state]}
        </li>
      ))}
    </ul>
  );
}
