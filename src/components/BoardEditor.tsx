"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  COLUMNS,
  MAX_ROWS,
  MAX_SECTIONS,
  MIN_ROWS,
  STATE_LABELS,
  createBoard,
  createSection,
  createSubBoard,
  MAX_SUB_WAYS,
  withWays,
  emptyCell,
  nextFitting,
  nextState,
  ownerOf,
  phaseOf,
  positionNumber,
  spanAt,
  withRows,
  type Board,
  type BoardSection,
  type CellState,
  type Numbering,
  type Part,
} from "@/lib/board";
import { BoardLegend } from "@/components/BoardLegend";
import { MainSwitchRow } from "@/components/MainSwitchRow";
import { SupplyFields } from "@/components/SupplyFields";
import { EMPTY_SUPPLY, type Supply } from "@/lib/supply";
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
  initialSupply,
  siblings,
  stateKey,
  onCancel,
  onSave,
}: {
  title: string;
  initialName: string;
  initialBoard?: Board;
  /** What feeds this board, where it has been recorded before. */
  initialSupply?: Supply;
  /** The other switchboards at this site, to be fed from. */
  siblings: { id: string; name: string }[];
  /** Where an unsaved drawing is kept, so a reload does not lose it. */
  stateKey: string;
  onCancel: () => void;
  onSave: (name: string, board: Board, supply: Supply) => Promise<void>;
}) {
  const [name, setName] = usePersisted(`${stateKey}:name`, initialName);
  const [supply, setSupply] = usePersisted<Supply>(
    `${stateKey}:supply`,
    initialSupply ?? EMPTY_SUPPLY,
  );
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

  // Sub-boards bolted onto the ends are always on screen; the tabs are for
  // the board's own sections.
  const main = useMemo(
    () => board.sections.filter((section) => !section.side),
    [board.sections],
  );
  const subs = useMemo(
    () => board.sections.filter((section) => section.side),
    [board.sections],
  );

  const active = useMemo(
    () => main.find((section) => section.id === activeId) ?? main[0] ?? board.sections[0],
    [main, board.sections, activeId],
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
    clearSession(`${stateKey}:supply`);
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

  /**
   * One click along the cycle: nothing, blank, breaker, three-phase breaker,
   * RCD, and on round.
   *
   * A three-phase device is three modules tall and cannot go at the top or the
   * bottom of a column, or beside another one. There the cycle steps straight
   * over it rather than offering a device that could not physically be there.
   */
  function cycleCell(index: number) {
    editActive((section) => {
      // A way taken up by a three-phase device beside it is not its own to
      // change: the device above or below is what is in it.
      if (spanAt(section, index).part !== "whole") return section;

      const cells = [...section.cells];
      cells[index] = { ...cells[index], state: nextFitting(section, index) };
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
      // Out here nothing is stacked, so every device fits — and this is where
      // the RCDs and the contactors go, which a way on the rail will not take.
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

  function addExtra() {
    editActive((section) => ({ ...section, extras: [...section.extras, emptyCell()] }));
  }

  function addSection() {
    if (board.sections.length >= MAX_SECTIONS) return;
    const section = createSection();
    setBoard((current) => ({ ...current, sections: [...current.sections, section] }));
    setActiveId(section.id);
    setRenaming(section.id);
  }

  /**
   * A sub-board on the end of the enclosure.
   *
   * Its own little run of ways, fed from this board and with no main switch
   * of its own — the small board bolted onto the side of a big one. It is
   * drawn beside the enclosure rather than hidden behind a tab, because that
   * is where it is.
   */
  function addSubBoard(side: "LEFT" | "RIGHT") {
    if (board.sections.length >= MAX_SECTIONS) return;
    const section = createSubBoard(side);
    setBoard((current) => ({ ...current, sections: [...current.sections, section] }));
    setRenaming(section.id);
  }

  /** Applies a change to any section, by id. */
  function editSection(id: string, change: (section: BoardSection) => BoardSection) {
    setBoard((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === id ? change(section) : section,
      ),
    }));
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
      await onSave(name.trim(), board, supply);
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
        <nav className="board-tabs" aria-label="Board sections">
          {main.map((section) => {
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
                    {main.length > 1 ? (
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
          {/*
            * The board itself: an enclosure with the main switch across the
            * top, a slot either side of it for anything else up by the mains,
            * and the ways below in two rails with their numbers up the middle.
            * The dashed squares straddling the sides add a section alongside —
            * the little board bolted onto the end of a big one.
            */}
          <div className="board-run">
          {subs
            .filter((section) => section.side === "LEFT")
            .map((section) => (
              <SubBoard
                key={section.id}
                section={section}
                renaming={renaming === section.id}
                onRename={(value) => renameSection(section.id, value)}
                onDoneRenaming={() => setRenaming(null)}
                onStartRenaming={() => setRenaming(section.id)}
                onCycle={(index) =>
                  editSection(section.id, (current) => {
                    if (spanAt(current, index).part !== "whole") return current;
                    const cells = [...current.cells];
                    // A sub-board has a rail of its own, so its ways take what
                    // any way takes: a breaker or an RCBO. The RCDs and the
                    // contactors go in the slots by the main switch. The room
                    // is still checked — a three-phase device on a rail of six
                    // wants three ways along it, and four for an RCBO.
                    cells[index] = { ...cells[index], state: nextFitting(current, index) };
                    return { ...current, cells };
                  })
                }
                onLabel={(index, value) =>
                  editSection(section.id, (current) => {
                    const cells = [...current.cells];
                    cells[index] = { ...cells[index], label: value };
                    return { ...current, cells };
                  })
                }
                onWays={(ways) => editSection(section.id, (current) => withWays(current, ways))}
                onRemove={() => removeSection(section.id)}
              />
            ))}

          <section className="board-case">
            <button
              type="button"
              className="board-side-add is-left"
              onClick={() => addSubBoard("LEFT")}
              disabled={board.sections.length >= MAX_SECTIONS}
              title="Add a sub-board on this end"
              aria-label="Add a sub-board on this end"
            >
              +
            </button>
            <button
              type="button"
              className="board-side-add is-right"
              onClick={() => addSubBoard("RIGHT")}
              disabled={board.sections.length >= MAX_SECTIONS}
              title="Add a sub-board on this end"
              aria-label="Add a sub-board on this end"
            >
              +
            </button>

            <div className="board-top">
              <div className="board-extra-slot">
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
                <button type="button" className="board-add-extra" onClick={addExtra}>
                  +
                </button>
              </div>

              <MainSwitchRow />

              <div className="board-extra-slot">
                <button type="button" className="board-add-extra" onClick={addExtra}>
                  +
                </button>
              </div>
            </div>

            <p className="board-case-note">
              Click a way to walk it through breakers and RCBOs. {active.rows * COLUMNS}{" "}
              ways{active.name.trim() ? ` on ${active.name.trim()}` : ""}. RCDs and
              contactors go in the slots by the main switch.
            </p>

            <div className="board-grid">
              {rows.map((indexes, row) => (
                <div className="board-row" key={row}>
                  {indexes.map((index, column) => {
                    const span = spanAt(active, index);
                    // A way drawing part of the device beside it shows that
                    // device's name, not its own: there is only one device.
                    const owner = ownerOf(active, index, span.part);
                    const cell = (
                      <Cell
                        key={index}
                        state={span.state}
                        part={span.part}
                        label={active.cells[owner].label}
                        onCycle={() => cycleCell(index)}
                        onLabel={(value) => labelCell(owner, value)}
                      />
                    );
                    // The numbers run up the middle, between the two rails,
                    // the way they are printed on the escutcheon.
                    if (column === 0) {
                      return (
                        <Fragment key={index}>
                          {cell}
                          <span className="board-gutter">
                            <span>{positionNumber(active, index, board.numbering)}</span>
                            <span>
                              {positionNumber(active, index + 1, board.numbering)}
                            </span>
                          </span>
                        </Fragment>
                      );
                    }
                    return cell;
                  })}
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

          {subs
            .filter((section) => section.side === "RIGHT")
            .map((section) => (
              <SubBoard
                key={section.id}
                section={section}
                renaming={renaming === section.id}
                onRename={(value) => renameSection(section.id, value)}
                onDoneRenaming={() => setRenaming(null)}
                onStartRenaming={() => setRenaming(section.id)}
                onCycle={(index) =>
                  editSection(section.id, (current) => {
                    if (spanAt(current, index).part !== "whole") return current;
                    const cells = [...current.cells];
                    // A sub-board has a rail of its own, so its ways take what
                    // any way takes: a breaker or an RCBO. The RCDs and the
                    // contactors go in the slots by the main switch. The room
                    // is still checked — a three-phase device on a rail of six
                    // wants three ways along it, and four for an RCBO.
                    cells[index] = { ...cells[index], state: nextFitting(current, index) };
                    return { ...current, cells };
                  })
                }
                onLabel={(index, value) =>
                  editSection(section.id, (current) => {
                    const cells = [...current.cells];
                    cells[index] = { ...cells[index], label: value };
                    return { ...current, cells };
                  })
                }
                onWays={(ways) => editSection(section.id, (current) => withWays(current, ways))}
                onRemove={() => removeSection(section.id)}
              />
            ))}
          </div>

          <section className="board-supply">
            <SupplyFields supply={supply} siblings={siblings} onChange={setSupply} />
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

/**
 * A sub-board bolted onto the end of the enclosure.
 *
 * Fed from the board beside it, so it has no main switch of its own — which
 * is the whole reason it is drawn as its own little box rather than as
 * another run of ways inside the big one. It takes anything: it is off the
 * main rail, so an RCD or a contactor is as much at home in it as a breaker.
 */
/**
 * A sub-board bolted onto the end of the enclosure.
 *
 * One rail of ways read left to right with the modules standing upright,
 * which is what a little DB is. It is fed from the board beside it and has no
 * main switch of its own — the whole reason it is drawn as its own box rather
 * than as another run of ways inside the big one.
 *
 * It has a rail of its own, so its ways take what any way takes: a breaker or
 * an RCBO, single or three phase. The RCDs and the contactors belong in the
 * slots beside the main switch, which is what those are for.
 */
function SubBoard({
  section,
  renaming,
  onRename,
  onDoneRenaming,
  onStartRenaming,
  onCycle,
  onLabel,
  onWays,
  onRemove,
}: {
  section: BoardSection;
  renaming: boolean;
  onRename: (value: string) => void;
  onDoneRenaming: () => void;
  onStartRenaming: () => void;
  onCycle: (index: number) => void;
  onLabel: (index: number, value: string) => void;
  onWays: (ways: number) => void;
  onRemove: () => void;
}) {
  return (
    <section className={`board-sub is-${section.side?.toLowerCase()}`}>
      <header className="board-sub-head">
        {renaming ? (
          <input
            autoFocus
            className="board-sub-name"
            value={section.name}
            placeholder="Sub-board name"
            aria-label="Sub-board name"
            onChange={(event) => onRename(event.target.value)}
            onBlur={onDoneRenaming}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") onDoneRenaming();
            }}
          />
        ) : (
          <button type="button" className="board-sub-title" onClick={onStartRenaming}>
            {section.name.trim() || "Unnamed sub-board"}
          </button>
        )}
        <button
          type="button"
          className="board-sub-remove"
          aria-label="Remove this sub-board"
          onClick={onRemove}
        >
          ×
        </button>
      </header>

      <p className="board-sub-note">
        No main switch — fed from the board beside it. Breakers and RCBOs.
      </p>

      <div className="board-sub-rail">
        {section.cells.map((_, index) => {
          const span = spanAt(section, index);
          const owner = ownerOf(section, index, span.part);
          return (
            <div className="board-sub-way" key={index}>
              <span className="board-sub-no">{index + 1}</span>
              <Cell
                upright
                state={span.state}
                part={span.part}
                label={section.cells[owner].label}
                onCycle={() => onCycle(index)}
                onLabel={(value) => onLabel(owner, value)}
              />
            </div>
          );
        })}

        <div className="board-sub-way is-controls">
          <button
            type="button"
            className="board-sub-way-btn"
            onClick={() => onWays(section.cells.length + 1)}
            disabled={section.cells.length >= MAX_SUB_WAYS}
            title="Add a way"
            aria-label="Add a way"
          >
            +
          </button>
          <button
            type="button"
            className="board-sub-way-btn"
            onClick={() => onWays(section.cells.length - 1)}
            disabled={section.cells.length <= 1}
            title="Take a way off the end"
            aria-label="Take a way off the end"
          >
            −
          </button>
        </div>
      </div>
    </section>
  );
}

function Cell({
  state,
  part = "whole",
  upright = false,
  label,
  onCycle,
  onLabel,
  onRemove,
}: {
  state: CellState;
  /** Which part of a multi-way device this way is showing. */
  part?: Part;
  /**
   * Standing on end rather than lying on its side. A sub-board is one rail of
   * ways side by side, which is how a little DB looks with the door off.
   */
  upright?: boolean;
  label: string;
  onCycle: () => void;
  onLabel: (value: string) => void;
  onRemove?: () => void;
}) {
  /**
   * The whole position is the switch — a click anywhere on it puts down
   * whatever is in hand. Naming is deliberately behind its own control: an
   * always-live text box would swallow most of those clicks.
   */
  const [editing, setEditing] = useState(false);
  const spanned = part !== "whole" && part !== "middle";
  // The first module carries the circuit name, so its phase tag would sit on
  // top of it. The name says which device this is; the tags on the modules
  // below say which phase each one switches.
  const phase = part === "whole" || part === "top" ? null : phaseOf(part);

  return (
    <div
      className={`board-cell is-${state.toLowerCase()} is-part-${part} ${
        upright ? "is-upright" : ""
      } ${spanned ? "is-spanned" : ""}`}
      aria-disabled={spanned || undefined}
      onClick={() => {
        if (!editing && !spanned) onCycle();
      }}
      role="button"
      tabIndex={spanned ? -1 : 0}
      title={
        spanned
          ? `${STATE_LABELS[state]} — this way is part of the device beside it`
          : `${STATE_LABELS[state]} — click to change`
      }
      onKeyDown={(event) => {
        if (editing || spanned) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCycle();
        }
      }}
    >
      {phase ? <span className="board-cell-phase">{phase}</span> : null}

      {editing ? (
        <input
          autoFocus
          className="board-cell-label"
          value={label}
          placeholder="Name"
          aria-label="Circuit name"
          onChange={(event) => onLabel(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" || event.key === "Escape") setEditing(false);
          }}
        />
      ) : (part === "whole" || part === "top") &&
        state !== "EMPTY" &&
        state !== "BLANK" ? (
        <span className={`board-cell-text ${label ? "" : "is-blank"}`}>
          {label || "Unnamed"}
        </span>
      ) : null}

      <button
        type="button"
        className="board-cell-edit"
        aria-label="Name this way"
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
