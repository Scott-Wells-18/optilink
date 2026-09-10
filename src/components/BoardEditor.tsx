"use client";

import { useEffect, useState } from "react";
import {
  COLUMNS,
  MAX_ROWS,
  MIN_ROWS,
  STATE_LABELS,
  createBoard,
  emptyCell,
  nextState,
  positionNumber,
  withRows,
  type Board,
  type CellState,
  type Numbering,
} from "@/lib/board";

/**
 * Draws a switchboard the way it actually looks: two columns of positions, one
 * click per position to walk it through nothing → blank → breaker → RCD, and a
 * strip at the top for RCDs that live outside the grid.
 */
export function BoardEditor({
  title,
  initialName,
  initialBoard,
  onCancel,
  onSave,
}: {
  title: string;
  initialName: string;
  initialBoard?: Board;
  onCancel: () => void;
  onSave: (name: string, board: Board) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [board, setBoard] = useState<Board>(initialBoard ?? createBoard());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function cycleCell(index: number) {
    setBoard((current) => {
      const cells = [...current.cells];
      cells[index] = { ...cells[index], state: nextState(cells[index].state) };
      return { ...current, cells };
    });
  }

  function labelCell(index: number, label: string) {
    setBoard((current) => {
      const cells = [...current.cells];
      cells[index] = { ...cells[index], label };
      return { ...current, cells };
    });
  }

  function cycleExtra(index: number) {
    setBoard((current) => {
      const extras = [...current.extras];
      // Contactors only exist out here, so this cycle has the extra stop.
      extras[index] = { ...extras[index], state: nextState(extras[index].state, true) };
      return { ...current, extras };
    });
  }

  function labelExtra(index: number, label: string) {
    setBoard((current) => {
      const extras = [...current.extras];
      extras[index] = { ...extras[index], label };
      return { ...current, extras };
    });
  }

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), board);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That could not be saved.");
      setBusy(false);
    }
  }

  // Laid out row by row, so the two columns stay level with each other.
  const rows = Array.from({ length: board.rows }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) => row * COLUMNS + column),
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label={title}>
      <button className="dialog-scrim" onClick={onCancel} aria-label="Close" tabIndex={-1} />

      <div className="board">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">{title}</h2>
            <input
              className="board-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Board name, e.g. Main switchboard"
              aria-label="Board name"
            />
          </div>
          <div className="board-head-side">
            <NumberingPicker
              value={board.numbering}
              rows={board.rows}
              onChange={(numbering) => setBoard((current) => ({ ...current, numbering }))}
            />
            <Legend />
          </div>
        </header>

        <div className="board-body">
          <section className="board-extras">
            <div className="board-section-head">
              <h3 className="board-section-title">Additional RCDs</h3>
              <p className="board-section-note">
                Anything outside the grid — beside the board, or up by the main switch.
              </p>
            </div>
            <div className="board-extra-row">
              {board.extras.map((cell, index) => (
                <Cell
                  key={index}
                  state={cell.state}
                  label={cell.label}
                  onCycle={() => cycleExtra(index)}
                  onLabel={(value) => labelExtra(index, value)}
                  onRemove={() =>
                    setBoard((current) => ({
                      ...current,
                      extras: current.extras.filter((_, i) => i !== index),
                    }))
                  }
                />
              ))}
              <button
                type="button"
                className="board-add-extra"
                onClick={() =>
                  setBoard((current) => ({
                    ...current,
                    extras: [...current.extras, emptyCell()],
                  }))
                }
              >
                + Add
              </button>
            </div>
          </section>

          <section className="board-grid-wrap">
            <div className="board-section-head">
              <h3 className="board-section-title">Board</h3>
              <p className="board-section-note">
                Click a position to change it. {board.rows * COLUMNS} positions.
              </p>
            </div>

            <div className="board-grid">
              {rows.map((indexes, row) => (
                <div className="board-row" key={row}>
                  {indexes.map((index) => (
                    <Cell
                      key={index}
                      number={positionNumber(board, index)}
                      state={board.cells[index].state}
                      label={board.cells[index].label}
                      onCycle={() => cycleCell(index)}
                      onLabel={(value) => labelCell(index, value)}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="board-rows-control">
              <button
                type="button"
                className="board-row-btn"
                onClick={() => setBoard((current) => withRows(current, current.rows - 1))}
                disabled={board.rows <= MIN_ROWS}
              >
                − Remove row
              </button>
              <span className="board-rows-count">{board.rows} rows</span>
              <button
                type="button"
                className="board-row-btn"
                onClick={() => setBoard((current) => withRows(current, current.rows + 1))}
                disabled={board.rows >= MAX_ROWS}
              >
                + Add row
              </button>
            </div>
          </section>
        </div>

        <footer className="board-foot">
          {error ? <p className="dialog-error">{error}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-confirm"
              onClick={() => void save()}
              disabled={busy || !name.trim()}
            >
              {busy ? "Saving…" : "Save and exit"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Cell({
  number,
  state,
  label,
  onCycle,
  onLabel,
  onRemove,
}: {
  number?: number;
  state: CellState;
  label: string;
  onCycle: () => void;
  onLabel: (value: string) => void;
  onRemove?: () => void;
}) {
  /**
   * The whole position is the switch — a click anywhere on it moves to the next
   * state. Naming is deliberately behind its own control: an always-live text
   * box would swallow most of those clicks.
   */
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={`board-cell is-${state.toLowerCase()}`}
      onClick={() => {
        if (!editing) onCycle();
      }}
      role="button"
      tabIndex={0}
      title={`${STATE_LABELS[state]} — click to change`}
      onKeyDown={(event) => {
        if (editing) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCycle();
        }
      }}
    >
      <span className="board-cell-no">{number ?? "R"}</span>

      {editing ? (
        <input
          autoFocus
          className="board-cell-label"
          value={label}
          placeholder="Name"
          aria-label={number ? `Position ${number} name` : "RCD name"}
          onChange={(event) => onLabel(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" || event.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <span className={`board-cell-text ${label ? "" : "is-blank"}`}>
          {label || "Unnamed"}
        </span>
      )}

      <button
        type="button"
        className="board-cell-edit"
        aria-label={number ? `Name position ${number}` : "Name this RCD"}
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M11 2.5 13.5 5 6 12.5l-3 .5.5-3z" strokeLinejoin="round" />
        </svg>
      </button>

      {onRemove ? (
        <button
          type="button"
          className="board-cell-remove"
          aria-label="Remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function NumberingPicker({
  value,
  rows,
  onChange,
}: {
  value: Numbering;
  rows: number;
  onChange: (value: Numbering) => void;
}) {
  const options: Array<{ key: Numbering; label: string }> = [
    { key: "SEQUENTIAL", label: `1–${rows}, ${rows + 1}–${rows * COLUMNS}` },
    { key: "ODD_EVEN", label: "1, 3, 5 / 2, 4, 6" },
  ];
  return (
    <div className="board-numbering">
      <span className="board-numbering-label">Numbering</span>
      <div className="board-numbering-options">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`board-numbering-option ${value === option.key ? "is-on" : ""}`}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  const states: CellState[] = ["EMPTY", "BLANK", "BREAKER", "RCD", "CONTACTOR"];
  return (
    <ul className="board-legend">
      {states.map((state) => (
        <li key={state}>
          <span className={`board-swatch is-${state.toLowerCase()}`} />
          {STATE_LABELS[state]}
        </li>
      ))}
    </ul>
  );
}
