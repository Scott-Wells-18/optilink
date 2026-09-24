"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FRAME_RATIOS,
  MAX_ITEMS,
  MIN_ITEM_H,
  MIN_ITEM_W,
  DEVICES,
  isThreePhase,
  STATE_LABELS,
  STATE_SHORT,
  createFreeBoard,
  createItem,
  isRcd,
  orderedItems,
  testsFor,
  type Board,
  type CellState,
  type FreeItem,
} from "@/lib/board";
import { DeviceMark } from "@/components/DeviceMark";
import { MainSwitchRow } from "@/components/MainSwitchRow";
import { SupplyFields } from "@/components/SupplyFields";
import { EMPTY_SUPPLY, type Supply } from "@/lib/supply";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Drawing a switchboard that is not a grid.
 *
 * Older boards are laid out however there was room: a bank of four down one
 * side, a main switch in a corner, two RCDs on their own somewhere else. The
 * grid editor cannot describe that, so this one places each device where it
 * actually is — drag it about, pull the corner to size it, and the board on
 * screen looks like the board on the wall.
 *
 * Everything is stored as a fraction of the frame rather than in pixels, so
 * the same drawing works on a laptop and on a phone at the switchboard.
 */

/**
 * What can be dropped on the board, in the order the palette offers them.
 *
 * A freehand board places each device where it really sits, so a three-phase
 * one is just a taller box rather than three ways on a grid — it is drawn to
 * whatever size it is on the wall.
 */
const PALETTE: CellState[] = DEVICES;

type Drag =
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "size"; id: string; fromX: number; fromY: number; w: number; h: number };

export function FreeBoardEditor({
  initialName,
  initialBoard,
  initialSupply,
  siblings,
  stateKey,
  onCancel,
  onSave,
}: {
  initialName: string;
  initialBoard?: Board;
  /** What feeds this board, where it has been recorded before. */
  initialSupply?: Supply;
  /** The other switchboards at this site, to be fed from. */
  siblings: { id: string; name: string }[];
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
    `${stateKey}:free`,
    initialBoard ?? createFreeBoard(),
  );
  const [chosen, setChosen] = useState<string | null>(null);
  /** The second pass: numbering the RCDs in the order they get tested. */
  const [sequencing, setSequencing] = usePersisted(`${stateKey}:seq`, false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  /** Set while a drag is running, so the listeners can be taken off again. */
  const dragging = useRef<(() => void) | null>(null);

  const items = useMemo(() => board.items ?? [], [board.items]);
  const selected = items.find((item) => item.id === chosen) ?? null;
  const rcdCount = items.filter((item) => isRcd(item.state)).length;
  const testCount = items
    .filter((item) => isRcd(item.state))
    .reduce((total, item) => total + testsFor(item.state), 0);

  const edit = useCallback(
    (id: string, change: (item: FreeItem) => FreeItem) => {
      setBoard((current) => ({
        ...current,
        items: (current.items ?? []).map((item) => (item.id === id ? change(item) : item)),
      }));
    },
    [setBoard],
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
    clearSession(`${stateKey}:free`);
    clearSession(`${stateKey}:seq`);
    clearSession(`${stateKey}:supply`);
  }

  function cancel() {
    forget();
    onCancel();
  }

  /** Where a pointer is, as a fraction of the frame. */
  function at(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  }

  /**
   * Drops a device somewhere clear.
   *
   * Straight down the left, under whatever is already there — nobody wants to
   * drag a new box out from under the last one before they can place it.
   */
  function add(state: CellState) {
    if (items.length >= MAX_ITEMS) {
      setError(`A board holds up to ${MAX_ITEMS} devices.`);
      return;
    }
    const lowest = items.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
    const y = lowest + 0.02 > 0.9 ? 0.02 : lowest + 0.02;
    const item = createItem(state, 0.04, y);
    setBoard((current) => ({ ...current, items: [...(current.items ?? []), item] }));
    setChosen(item.id);
    setError(null);
  }

  /**
   * A device beside the selected one.
   *
   * This is how a bank gets drawn: place the first, then add along from it.
   * It goes to the right while there is room, and wraps underneath when there
   * is not.
   */
  function addBeside(from: FreeItem) {
    if (items.length >= MAX_ITEMS) return;
    const gap = 0.012;
    const rightOf = from.x + from.w + gap;
    const fits = rightOf + from.w <= 1;
    const item: FreeItem = {
      ...createItem(from.state, fits ? rightOf : from.x, fits ? from.y : from.y + from.h + gap),
      w: from.w,
      h: from.h,
    };
    item.y = Math.min(item.y, 1 - item.h);
    setBoard((current) => ({ ...current, items: [...(current.items ?? []), item] }));
    setChosen(item.id);
  }

  function remove(id: string) {
    setBoard((current) => ({
      ...current,
      items: (current.items ?? []).filter((item) => item.id !== id),
    }));
    setChosen(null);
  }

  /* --- dragging and sizing ------------------------------------------------ */

  /**
   * A drag is followed on the window, not on the frame.
   *
   * Pointer capture is the usual answer, and it is the wrong one here: it
   * throws for a pointer the browser does not consider active, and a finger
   * that strays outside the frame mid-drag stops sending moves. Listening on
   * the window means the drag survives leaving the frame and always ends —
   * because a drag that never ends is a box that follows the cursor around
   * afterwards, which is far worse than one that stops short.
   */
  const follow = useCallback(() => {
    dragging.current?.();

    const onPointerMove = (event: PointerEvent) => {
      const held = drag.current;
      if (!held) return;
      event.preventDefault();
      const point = at(event);

      if (held.kind === "move") {
        edit(held.id, (item) => ({
          ...item,
          x: Math.min(1 - item.w, Math.max(0, point.x - held.dx)),
          y: Math.min(1 - item.h, Math.max(0, point.y - held.dy)),
        }));
        return;
      }

      edit(held.id, (item) => {
        const w = Math.max(MIN_ITEM_W, Math.min(1 - item.x, held.w + (point.x - held.fromX)));
        const h = Math.max(MIN_ITEM_H, Math.min(1 - item.y, held.h + (point.y - held.fromY)));
        return { ...item, w, h };
      });
    };

    const stop = () => {
      drag.current = null;
      dragging.current?.();
      dragging.current = null;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    dragging.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [edit]);

  // Nothing is left listening if the dialog closes mid-drag.
  useEffect(() => () => dragging.current?.(), []);

  function startMove(event: React.PointerEvent, item: FreeItem) {
    if (sequencing) return;
    event.stopPropagation();
    const point = at(event);
    drag.current = { kind: "move", id: item.id, dx: point.x - item.x, dy: point.y - item.y };
    setChosen(item.id);
    follow();
  }

  function startSize(event: React.PointerEvent, item: FreeItem) {
    event.stopPropagation();
    const point = at(event);
    drag.current = {
      kind: "size",
      id: item.id,
      fromX: point.x,
      fromY: point.y,
      w: item.w,
      h: item.h,
    };
    setChosen(item.id);
    follow();
  }

  /* --- the testing order -------------------------------------------------- */

  /**
   * Tapping an RCD gives it the next number; tapping a numbered one clears it
   * and closes the gap, so the run always reads 1, 2, 3 with nothing missing.
   */
  function bumpOrder(item: FreeItem) {
    if (!isRcd(item.state)) return;
    setBoard((current) => {
      const all = current.items ?? [];
      const taken = all
        .filter((other) => other.order !== null)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const without =
        item.order === null
          ? [...taken, item]
          : taken.filter((other) => other.id !== item.id);

      const ranked = new Map(without.map((other, index) => [other.id, index + 1]));
      return {
        ...current,
        items: all.map((other) => ({ ...other, order: ranked.get(other.id) ?? null })),
      };
    });
  }

  function clearOrder() {
    setBoard((current) => ({
      ...current,
      items: (current.items ?? []).map((item) => ({ ...item, order: null })),
    }));
  }

  const sequenced = items.filter((item) => item.order !== null).length;

  async function save() {
    if (!name.trim()) {
      setError("Give the switchboard a name.");
      return;
    }
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

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Custom switchboard">
      <button className="dialog-scrim" onClick={cancel} aria-label="Close" tabIndex={-1} />

      <div className="board is-free">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Custom switchboard</h2>
            <input
              className="board-name"
              value={name}
              placeholder="e.g. Main switchboard"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="board-head-side">
            <nav className="rcd-steps" aria-label="Steps">
              <button
                type="button"
                className={`rcd-step ${sequencing ? "" : "is-on"}`}
                onClick={() => setSequencing(false)}
              >
                Draw it
              </button>
              <button
                type="button"
                className={`rcd-step ${sequencing ? "is-on" : ""}`}
                disabled={rcdCount === 0}
                onClick={() => {
                  setSequencing(true);
                  setChosen(null);
                }}
              >
                Test order
              </button>
            </nav>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            <MainSwitchRow />

            {sequencing ? (
              <div className="board-section-head">
                <h3 className="board-section-title">The order you test them in</h3>
                <p className="board-section-note">
                  Tap the RCDs in the order you work them. The instrument numbers
                  its tests in the order they were taken, and nothing about where
                  a device sits says when you got to it — so this is what lines
                  its readings up with your board. {sequenced} of {rcdCount} set
                  {testCount === rcdCount ? "" : `, ${testCount} tests in all`}.
                </p>
              </div>
            ) : (
              <div className="free-palette" role="group" aria-label="Add a device">
                {PALETTE.map((state) => (
                  <button
                    key={state}
                    type="button"
                    className={`free-add is-${state.toLowerCase()}`}
                    onClick={() => add(state)}
                  >
                    <span className="free-add-swatch" aria-hidden>
                      <DeviceMark state={state} />
                    </span>
                    {STATE_SHORT[state]}
                  </button>
                ))}
              </div>
            )}

            <div
              className="free-frame"
              ref={frameRef}
              style={{ aspectRatio: String(board.frame ?? 1.6) }}
              onPointerDown={() => setChosen(null)}
            >
              {items.length === 0 ? (
                <p className="free-empty">
                  Add a device from above, then drag it to where it sits on the
                  board. Pull the corner to size it.
                </p>
              ) : null}

              {items.map((item) => {
                const on = item.id === chosen;
                return (
                  <div
                    key={item.id}
                    className={`free-item is-${item.state.toLowerCase()} ${on ? "is-on" : ""} ${
                      sequencing ? "is-sequencing" : ""
                    } ${sequencing && !isRcd(item.state) ? "is-locked" : ""}`}
                    style={{
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      width: `${item.w * 100}%`,
                      height: `${item.h * 100}%`,
                    }}
                    onPointerDown={(event) =>
                      sequencing ? event.stopPropagation() : startMove(event, item)
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (sequencing) bumpOrder(item);
                    }}
                  >
                    <DeviceMark state={item.state} />
                    {item.order !== null ? (
                      <span className="free-item-order">{item.order}</span>
                    ) : null}
                    <span className={`free-item-text ${item.label ? "" : "is-blank"}`}>
                      {item.label || STATE_LABELS[item.state]}
                    </span>
                    {isThreePhase(item.state) ? (
                      <span className="free-item-phase" aria-hidden>
                        3{"\u03c6"}
                      </span>
                    ) : null}

                    {on && !sequencing ? (
                      <>
                        <button
                          type="button"
                          className="free-item-beside"
                          title="Add one beside it"
                          aria-label="Add a device beside this one"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            addBeside(item);
                          }}
                        >
                          +
                        </button>
                        <span
                          className="free-item-handle"
                          role="presentation"
                          onPointerDown={(event) => startSize(event, item)}
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {sequencing ? (
              <div className="free-inspector">
                <button type="button" className="dialog-cancel" onClick={clearOrder}>
                  Start the order again
                </button>
              </div>
            ) : selected ? (
              <div className="free-inspector">
                <input
                  className="dialog-input"
                  placeholder="What is it? e.g. Meal room GPOs"
                  value={selected.label}
                  onChange={(event) =>
                    edit(selected.id, (item) => ({ ...item, label: event.target.value }))
                  }
                />
                <div className="free-types">
                  {PALETTE.map((state) => (
                    <button
                      key={state}
                      type="button"
                      className={`free-type is-${state.toLowerCase()} ${
                        selected.state === state ? "is-on" : ""
                      }`}
                      title={STATE_LABELS[state]}
                      aria-label={STATE_LABELS[state]}
                      onClick={() => edit(selected.id, (item) => ({ ...item, state }))}
                    >
                      <DeviceMark state={state} />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="free-delete"
                  onClick={() => remove(selected.id)}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="free-inspector">
                <span className="board-section-note">Shape of the board</span>
                <div className="free-types">
                  {FRAME_RATIOS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className={`free-ratio ${
                        (board.frame ?? 1.6) === option.ratio ? "is-on" : ""
                      }`}
                      onClick={() => setBoard((current) => ({ ...current, frame: option.ratio }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sequencing ? null : (
              <section className="board-supply">
                <SupplyFields supply={supply} siblings={siblings} onChange={setSupply} />
              </section>
            )}
          </div>
        </div>

        <footer className="board-foot">
          {error ? <p className="dialog-error">{error}</p> : null}
          {!sequencing && rcdCount > 0 && sequenced < rcdCount ? (
            <p className="board-warning">
              {rcdCount - sequenced} of the {rcdCount} RCDs have no place in the
              testing order yet. Set it under Test order, or the instrument&rsquo;s
              readings will be dealt on in the order they happen to be drawn.
            </p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-confirm"
              disabled={busy}
              onClick={() => void save()}
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
 * The same board, read-only — for pinning a thermal photo to, for marking a
 * retest against, and for showing the testing order before a run is filed.
 */
export function FreeBoardView({
  board,
  showOrder = false,
  selectable,
  marks,
  onPick,
}: {
  board: Board;
  /** Numbers each RCD with its place in the testing run. */
  showOrder?: boolean;
  /** Which items can be clicked. Everything, when not given. */
  selectable?: (item: FreeItem) => boolean;
  /** A badge drawn on an item — a retest tally, or a finding count. */
  marks?: Record<string, string>;
  onPick?: (item: FreeItem) => void;
}) {
  const items = showOrder ? orderedItems(board) : (board.items ?? []);
  // Dimming means "not this one" — it only makes sense where something else
  // IS pickable. A board shown purely to be looked at is drawn at full
  // strength, however little of it can be clicked.
  const picking = Boolean(selectable || onPick);
  let rank = 0;

  return (
    <div className="free-frame is-view" style={{ aspectRatio: String(board.frame ?? 1.6) }}>
      {items.map((item) => {
        const can = selectable ? selectable(item) : Boolean(onPick);
        if (showOrder && isRcd(item.state)) rank += 1;
        const badge = marks?.[item.id];
        return (
          <div
            key={item.id}
            className={`free-item is-${item.state.toLowerCase()} ${
              can ? "is-selectable" : picking ? "is-locked" : "is-static"
            } ${badge ? "is-flagged" : ""}`}
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.w * 100}%`,
              height: `${item.h * 100}%`,
            }}
            role={can ? "button" : undefined}
            tabIndex={can ? 0 : -1}
            onClick={() => can && onPick?.(item)}
            onKeyDown={(event) => {
              if (can && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onPick?.(item);
              }
            }}
          >
            <DeviceMark state={item.state} />
            {showOrder && isRcd(item.state) ? (
              <span className="free-item-order">{rank}</span>
            ) : null}
            <span className={`free-item-text ${item.label ? "" : "is-blank"}`}>
              {item.label || STATE_LABELS[item.state]}
            </span>
            {isThreePhase(item.state) ? (
              <span className="free-item-phase" aria-hidden>
                3{"\u03c6"}
              </span>
            ) : null}
            {badge ? <span className="board-cell-count">{badge}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
