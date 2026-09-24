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
        <svg className="board-main-switch-mark" viewBox="0 0 60 44" aria-hidden focusable="false">
          {/* The handle, and the three poles it makes and breaks. */}
          <rect className="dm-toggle" x="22" y="4" width="16" height="9" rx="2" />
          <line className="ms-pole" x1="17" y1="15" x2="17" y2="34" />
          <line className="ms-pole" x1="30" y1="15" x2="30" y2="34" />
          <line className="ms-pole" x1="43" y1="15" x2="43" y2="34" />
          <rect className="ms-base" x="6" y="34" width="48" height="6" rx="2" />
        </svg>
        <span className="board-main-switch-text">Main switch</span>
        {findings > 0 ? <span className="board-cell-count">{findings}</span> : null}
      </div>
    </div>
  );
}
