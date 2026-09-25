"use client";

import { useMemo, useState } from "react";
import {
  COLUMNS,
  isRcd,
  ownerOf,
  phaseOf,
  positionNumber,
  slotKey,
  spanAt,
  extrasOn,
  type Board,
  type BoardSection,
  type CellState,
  type Part,
} from "@/lib/board";
import { MainSwitchRow } from "@/components/MainSwitchRow";

/**
 * The board as it was drawn, to be clicked on.
 *
 * The same enclosure as the editor — the main switch across the top, the
 * additionals in the slots either side of it, the sections behind their tabs,
 * the ways in two rails with their numbers up the middle, and any sub-board
 * bolted on the end drawn as its own rail underneath. Somebody standing at the
 * board has to be able to find the device they are looking at, and a grid of
 * anonymous rectangles with the names left off is no help at all.
 *
 * Nothing here changes the board. It carries a mark on whichever device the
 * caller says, and hands back the slot that was clicked — which is always the
 * way a device was drawn into, never one of the ways it merely covers. A
 * three-phase device is one device however many modules it stands across.
 */

export type Pick = {
  slot: string;
  state: CellState;
  /** What was written on it, or "" where it was never labelled. */
  label: string;
  /** The ways it occupies, as printed on the board. Empty for an additional. */
  numbers: number[];
  /** The section it belongs to, named as it was drawn. */
  section: string;
};

export function BoardPicker({
  board,
  marks,
  dim,
  onPick,
}: {
  board: Board;
  /** What to show on a device, by slot: "×2", "3", whatever the step needs. */
  marks?: Record<string, string | undefined>;
  /** True where the mark is only a suggestion rather than something chosen. */
  dim?: (slot: string) => boolean;
  onPick: (pick: Pick) => void;
}) {
  const main = useMemo(
    () => board.sections.filter((section) => !section.side),
    [board.sections],
  );
  const subs = useMemo(
    () => board.sections.filter((section) => section.side),
    [board.sections],
  );

  const [activeId, setActiveId] = useState(main[0]?.id ?? "");
  const active = main.find((section) => section.id === activeId) ?? main[0] ?? null;

  function pickCell(section: BoardSection, index: number) {
    const span = spanAt(section, index);
    // A module of a three-phase device belongs to the way the device was put
    // in, so clicking its second pole marks the device, not the pole.
    const owner = ownerOf(section, index, span.part);
    const cell = section.cells[owner];
    if (!cell || !isRcd(cell.state)) return;

    const numbers = occupied(section, owner, span.part === "whole" ? 1 : modules(span.part))
      .map((at) => positionNumber(section, at, board.numbering))
      .sort((a, b) => a - b);

    onPick({
      slot: slotKey(section.id, "cell", owner),
      state: cell.state,
      label: cell.label.trim(),
      numbers,
      section: sectionName(section),
    });
  }

  /** Every way a device covers, worked out from what is drawn around it. */
  function occupied(section: BoardSection, owner: number, _hint: number): number[] {
    const stride = section.side ? 1 : COLUMNS;
    const ways: number[] = [owner];
    for (let step = 1; step <= 2; step += 1) {
      const below = owner + step * stride;
      if (ownerAt(section, below) === owner) ways.push(below);
    }
    const above = owner - stride;
    if (ownerAt(section, above) === owner) ways.push(above);
    return ways;
  }

  function ownerAt(section: BoardSection, index: number): number | null {
    if (index < 0 || index >= section.cells.length) return null;
    const span = spanAt(section, index);
    if (span.part === "whole") return index;
    return ownerOf(section, index, span.part);
  }

  return (
    <section className="board-case is-picker">
      <div className="board-top">
        <PickSlot
          side="LEFT"
          section={active}
          board={board}
          marks={marks}
          dim={dim}
          onPick={onPick}
        />
        <MainSwitchRow />
        <PickSlot
          side="RIGHT"
          section={active}
          board={board}
          marks={marks}
          dim={dim}
          onPick={onPick}
        />
      </div>

      {main.length > 1 ? (
        <nav className="board-tabs" aria-label="Board sections">
          {main.map((section) => (
            <div
              key={section.id}
              className={`board-tab ${section.id === active?.id ? "is-active" : ""}`}
            >
              <button
                type="button"
                className="board-tab-name"
                onClick={() => setActiveId(section.id)}
              >
                {section.name.trim() || "Unnamed section"}
              </button>
            </div>
          ))}
        </nav>
      ) : null}

      {active ? (
        <div className="board-grid">
          {Array.from({ length: active.rows }, (_, row) => (
            <div className="board-row" key={row}>
              {Array.from({ length: COLUMNS }, (_, column) => {
                const index = row * COLUMNS + column;
                const span = spanAt(active, index);
                const owner = ownerOf(active, index, span.part);
                const slot = slotKey(active.id, "cell", owner);
                const cell = (
                  <PickCell
                    key={index}
                    state={span.state}
                    part={span.part}
                    label={active.cells[owner]?.label ?? ""}
                    mark={marks?.[slot]}
                    faded={dim?.(slot) ?? false}
                    onPick={() => pickCell(active, index)}
                  />
                );
                if (column === 0) {
                  return (
                    <span key={index} className="board-pick-pair">
                      {cell}
                      <span className="board-gutter">
                        <span>{positionNumber(active, index, board.numbering)}</span>
                        <span>{positionNumber(active, index + 1, board.numbering)}</span>
                      </span>
                    </span>
                  );
                }
                return cell;
              })}
            </div>
          ))}
        </div>
      ) : null}

      {subs.map((section) => (
        <div className="board-pick-sub" key={section.id}>
          <p className="rcd-extras-title">
            {section.name.trim() || "Sub-board"}
            <span className="board-pick-where">
              {section.side === "LEFT" ? "left-hand end" : "right-hand end"}
            </span>
          </p>
          <div className="board-sub-rail is-picker">
            {section.cells.map((_, index) => {
              const span = spanAt(section, index);
              const owner = ownerOf(section, index, span.part);
              const slot = slotKey(section.id, "cell", owner);
              return (
                <div className="board-sub-way" key={index}>
                  <span className="board-sub-no">
                    {positionNumber(section, index, board.numbering)}
                  </span>
                  <PickCell
                    upright
                    state={span.state}
                    part={span.part}
                    label={section.cells[owner]?.label ?? ""}
                    mark={marks?.[slot]}
                    faded={dim?.(slot) ?? false}
                    onPick={() => pickCell(section, index)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/** What a section is called, for a device that has to say where it lives. */
function sectionName(section: BoardSection): string {
  const written = section.name.trim();
  if (written) return written;
  return section.side ? "Sub-board" : "Main";
}

/** How many modules a part implies — only used to bound the search. */
function modules(part: Part): number {
  return part === "button" ? 4 : 3;
}

/** The devices up by the main switch, on one end of it. */
function PickSlot({
  side,
  section,
  board,
  marks,
  dim,
  onPick,
}: {
  side: "LEFT" | "RIGHT";
  section: BoardSection | null;
  board: Board;
  marks?: Record<string, string | undefined>;
  dim?: (slot: string) => boolean;
  onPick: (pick: Pick) => void;
}) {
  if (!section) return <div className="board-extra-slot" />;
  const held = extrasOn(section, side);

  return (
    <div className={`board-extra-slot is-${side.toLowerCase()}`}>
      {held.map(({ cell, index }) => {
        const slot = slotKey(section.id, "extra", index);
        return (
          <PickCell
            key={index}
            upright
            state={cell.state}
            label={cell.label}
            mark={marks?.[slot]}
            faded={dim?.(slot) ?? false}
            onPick={() =>
              onPick({
                slot,
                state: cell.state,
                label: cell.label.trim(),
                numbers: [],
                section: sectionName(section),
              })
            }
          />
        );
      })}
      {held.length === 0 ? <span className="board-pick-empty">Nothing here</span> : null}
      {/* The board's numbering does not reach out here, so nothing is drawn
          for it — an additional is named for what is written on it. */}
      <span hidden>{board.numbering}</span>
    </div>
  );
}

function PickCell({
  state,
  part = "whole",
  upright = false,
  label,
  mark,
  faded,
  onPick,
}: {
  state: CellState;
  part?: Part;
  upright?: boolean;
  label: string;
  mark?: string;
  faded?: boolean;
  onPick: () => void;
}) {
  const pickable = isRcd(state);
  const phase = part === "whole" || part === "top" ? null : phaseOf(part);
  // The first module of a device carries its name and its mark; the ones it
  // stands across carry the phase they switch, the way the editor draws them.
  const head = part === "whole" || part === "top";
  const named = head && state !== "EMPTY" && state !== "BLANK";

  return (
    <div
      className={`board-cell is-${state.toLowerCase()} is-part-${part} ${
        upright ? "is-upright" : ""
      } ${pickable ? "is-selectable" : "is-locked"} ${
        mark && head ? "is-marked" : ""
      } ${faded ? "is-faded" : ""}`}
      role={pickable ? "button" : undefined}
      tabIndex={pickable ? 0 : -1}
      onClick={() => pickable && onPick()}
      onKeyDown={(event) => {
        if (!pickable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick();
        }
      }}
      title={label || undefined}
    >
      {phase ? <span className="board-cell-phase">{phase}</span> : null}
      {named ? (
        <span className={`board-cell-text ${label ? "" : "is-blank"}`}>
          {label || "Unnamed"}
        </span>
      ) : null}
      {mark && head ? <span className="board-pick-mark">{mark}</span> : null}
    </div>
  );
}
