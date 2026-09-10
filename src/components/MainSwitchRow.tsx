/**
 * Every board has one main switch, above the sections and belonging to none of
 * them. It is fixed: it cannot be renamed, recoloured or clicked through the
 * states the way a position can, so it reads the same on every board.
 */
export function MainSwitchRow({
  findings = 0,
  picked = false,
  onPick,
}: {
  /** Thermal only — how many findings this inspection filed against it. */
  findings?: number;
  picked?: boolean;
  onPick?: () => void;
}) {
  const selectable = Boolean(onPick);
  return (
    <div className="board-mains">
      <div
        className={`board-main-switch ${selectable ? "is-selectable" : ""} ${
          picked ? "is-picked" : ""
        } ${findings ? "is-flagged" : ""}`}
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : -1}
        onClick={onPick}
        onKeyDown={(event) => {
          if (!selectable) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPick?.();
          }
        }}
      >
        <span className="board-main-switch-text">Main switch</span>
        {findings > 0 ? <span className="board-cell-count">{findings}</span> : null}
      </div>
    </div>
  );
}
