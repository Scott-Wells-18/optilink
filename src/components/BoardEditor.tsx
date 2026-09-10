"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COLUMNS,
  MAX_ROWS,
  MAX_SECTIONS,
  MIN_ROWS,
  STATE_LABELS,
  createBoard,
  createSection,
  emptyCell,
  nextState,
  positionNumber,
  withRows,
  type Board,
  type BoardSection,
  type CellState,
  type Numbering,
} from "@/lib/board";
import { BoardLegend } from "@/components/BoardLegend";
import { MainSwitchRow } from "@/components/MainSwitchRow";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Draws a switchboard the way it actually looks: two columns of positions, one
 * click per position to walk it through nothing → blank → breaker → RCD, and a
 * strip for devices sitting outside the grid.
 *
 * A board can hold several sections — lighting, power, and so on — each its own
 * run of positions behind its own tab.
 */
export function BoardEditor({
  title,
  initialName,
  initialBoard,
  stateKey,
  onCancel,
  onSave,
}: {
  title: string;
  initialName: string;
  initialBoard?: Board;
  /** Where an unsaved drawing is kept, so a reload does not lose it. */
  stateKey: string;
  onCancel: () => void;
  onSave: (name: string, board: Board) => Promise<void>;
}) {
  const [name, setName] = usePersisted(`${stateKey}:name`, initialName);
  const [board, setBoard] = usePersisted<Board>(
    `${stateKey}:board`,
    initialBoard ?? createBoard(),
  );
  const [activeId, setActiveId] = usePersisted(
    `${stateKey}:tab`,
    (initialBoard ?? createBoard()).sections[0]?.id ?? "",
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(
    () => board.sections.find((section) => section.id === activeId) ?? board.sections[0],
    [board.sections, activeId],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // cancel() only drops the draft and calls the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  function forget() {
    clearSession(`${stateKey}:name`);
    clearSession(`${stateKey}:board`);
    clearSession(`${stateKey}:tab`);
  }

  function cancel() {
    forget();
    onCancel();
  }

  /** Applies a change to whichever section is on screen. */
  function editActive(change: (section: BoardSection) => BoardSection) {
    setBoard((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === active.id ? change(section) : section,
      ),
    }));
  }

  function cycleCell(index: number) {
    editActive((section) => {
      const cells = [...section.cells];
      cells[index] = { ...cells[index], state: nextState(cells[index].state) };
      return { ...section, cells };
    });
  }

  function labelCell(index: number, label: string) {
    editActive((section) => {
      const cells = [...section.cells];
      cells[index] = { ...cells[index], label };
      return { ...section, cells };
    });
  }

  function cycleExtra(index: number) {
    editActive((section) => {
      const extras = [...section.extras];
      // Contactors only exist out here, so this cycle has the extra stop.
      extras[index] = { ...extras[index], state: nextState(extras[index].state, true) };
      return { ...section, extras };
    });
  }

  function labelExtra(index: number, label: string) {
    editActive((section) => {
      const extras = [...section.extras];
      extras[index] = { ...extras[index], label };
      return { ...section, extras };
    });
  }

  function addSection() {
    if (board.sections.length >= MAX_SECTIONS) return;
    const section = createSection();
    setBoard((current) => ({ ...current, sections: [...current.sections, section] }));
    setActiveId(section.id);
    setRenaming(section.id);
  }

  function removeSection(id: string) {
    if (board.sections.length <= 1) return;
    const section = board.sections.find((entry) => entry.id === id);
    if (
      section &&
      !window.confirm(`Remove ${section.name || "this section"} and everything drawn on it?`)
    ) {
      return;
    }
    setBoard((current) => {
      const sections = current.sections.filter((entry) => entry.id !== id);
      if (id === activeId) setActiveId(sections[0].id);
      return { ...current, sections };
    });
  }

  function renameSection(id: string, value: string) {
    setBoard((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === id ? { ...section, name: value } : section,
      ),
    }));
  }

  const unnamed = board.sections.filter((section) => !section.name.trim());

  async function save() {
    if (!name.trim() || unnamed.length > 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), board);
      forget();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That could not be saved.");
      setBusy(false);
    }
  }

  // Laid out row by row, so the two columns stay level with each other.
  const rows = Array.from({ length: active.rows }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) => row * COLUMNS + column),
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label={title}>
      <button className="dialog-scrim" onClick={cancel} aria-label="Close" tabIndex={-1} />

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
              rows={active.rows}
              onChange={(numbering) => setBoard((current) => ({ ...current, numbering }))}
            />
            <BoardLegend />
          </div>
        </header>

        <div className="board-scroll">
        <MainSwitchRow />

        <nav className="board-tabs" aria-label="Board sections">
          {board.sections.map((section) => {
            const isActive = section.id === active.id;
            return (
              <div
                key={section.id}
                className={`board-tab ${isActive ? "is-active" : ""} ${
                  section.name.trim() ? "" : "is-unnamed"
                }`}
              >
                {renaming === section.id ? (
                  <input
                    autoFocus
                    className="board-tab-input"
                    value={section.name}
                    placeholder="Section name"
                    aria-label="Section name"
                    onChange={(event) => renameSection(section.id, event.target.value)}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="board-tab-name"
                      onClick={() => setActiveId(section.id)}
                      onDoubleClick={() => setRenaming(section.id)}
                    >
                      {section.name.trim() || "Unnamed section"}
                    </button>
                    {isActive ? (
                      <button
                        type="button"
                        className="board-tab-rename"
                        aria-label="Rename section"
                        onClick={() => setRenaming(section.id)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                          <path d="M11 2.5 13.5 5 6 12.5l-3 .5.5-3z" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : null}
                    {board.sections.length > 1 ? (
                      <button
                        type="button"
                        className="board-tab-close"
                        aria-label="Remove section"
                        onClick={() => removeSection(section.id)}
                      >
                        ×
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}

          {board.sections.length < MAX_SECTIONS ? (
            <button
              type="button"
              className="board-tab-add"
              onClick={addSection}
              aria-label="Add a section"
              title="Add a section"
            >
              +
            </button>
          ) : null}
        </nav>

        <div className="board-body">
          <section className="board-extras">
            <div className="board-section-head">
              <h3 className="board-section-title">Additional</h3>
              <p className="board-section-note">
                Anything outside the grid — beside the board, or up by the main switch.
              </p>
            </div>
            <div className="board-extra-row">
              {active.extras.map((cell, index) => (
                <Cell
                  key={index}
                  state={cell.state}
                  label={cell.label}
                  onCycle={() => cycleExtra(index)}
                  onLabel={(value) => labelExtra(index, value)}
                  onRemove={() =>
                    editActive((section) => ({
                      ...section,
                      extras: section.extras.filter((_, i) => i !== index),
                    }))
                  }
                />
              ))}
              <button
                type="button"
                className="board-add-extra"
                onClick={() =>
                  editActive((section) => ({
                    ...section,
                    extras: [...section.extras, emptyCell()],
                  }))
                }
              >
                + Add
              </button>
            </div>
          </section>

          <section className="board-grid-wrap">
            <div className="board-section-head">
              <h3 className="board-section-title">
                {active.name.trim() || "Section"}
              </h3>
              <p className="board-section-note">
                Click a position to change it. {active.rows * COLUMNS} positions.
              </p>
            </div>

            <div className="board-grid">
              {rows.map((indexes, row) => (
                <div className="board-row" key={row}>
                  {indexes.map((index) => (
                    <Cell
                      key={index}
                      number={positionNumber(active, index, board.numbering)}
                      state={active.cells[index].state}
                      label={active.cells[index].label}
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
                onClick={() => editActive((section) => withRows(section, section.rows - 1))}
                disabled={active.rows <= MIN_ROWS}
              >
                − Remove row
              </button>
              <span className="board-rows-count">{active.rows} rows</span>
              <button
                type="button"
                className="board-row-btn"
                onClick={() => editActive((section) => withRows(section, section.rows + 1))}
                disabled={active.rows >= MAX_ROWS}
              >
                + Add row
              </button>
            </div>
          </section>
        </div>
        </div>

        <footer className="board-foot">
          {error ? <p className="dialog-error">{error}</p> : null}
          {unnamed.length > 0 ? (
            <p className="board-warning">
              {unnamed.length === 1 ? "One section still needs" : `${unnamed.length} sections still need`}{" "}
              a name before this can be saved.
            </p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-confirm"
              onClick={() => void save()}
              disabled={busy || !name.trim() || unnamed.length > 0}
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
