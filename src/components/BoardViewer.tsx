"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COLUMNS,
  STATE_LABELS,
  isDevice,
  positionNumber,
  slotKey,
  type Board,
  type BoardCell,
} from "@/lib/board";
import { BoardLegend } from "@/components/BoardLegend";
import { IssueDialog } from "@/components/IssueDialog";
import { MainSwitchRow } from "@/components/MainSwitchRow";
import { usePersisted } from "@/lib/session";
import {
  BOARD_SLOT,
  ISSUE_LABELS,
  MAIN_SWITCH_SLOT,
  POSITION_ISSUE_TYPES,
  type IssueType,
  type PhotoKind,
} from "@/lib/issues";

/**
 * The board as drawn, read only, for reporting what an inspection turned up.
 *
 * Only positions carrying a device can be picked — a blank or an empty way has
 * nothing to look at.
 */

type Issue = {
  id: string;
  equipmentId: string;
  slot: string;
  type: IssueType;
  note: string | null;
  photos: { id: string; kind: PhotoKind; fileId: string }[];
};

export function BoardViewer({
  inspectionId,
  equipmentId,
  name,
  board,
  onClose,
}: {
  inspectionId: string;
  equipmentId: string;
  name: string;
  board: Board;
  onClose: () => void;
}) {
  const key = `view:${inspectionId}:${equipmentId}`;
  const [issues, setIssues] = useState<Issue[]>([]);
  const [slot, setSlot] = usePersisted<string | null>(`${key}:slot`, null);
  const [reporting, setReporting] = usePersisted(`${key}:reporting`, false);
  const [activeId, setActiveId] = usePersisted(
    `${key}:tab`,
    board.sections[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/issues`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const all = (await response.json()) as Issue[];
      setIssues(all.filter((issue) => issue.equipmentId === equipmentId));
    } catch {
      // Leaving the list as-is is better than blanking it on a hiccup.
    }
  }, [inspectionId, equipmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || reporting) return;
      if (slot) setSlot(null);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slot, reporting, onClose]);

  async function removeIssue(id: string) {
    const response = await fetch(`/api/issues/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("That finding could not be removed.");
      return;
    }
    await refresh();
  }

  const active = useMemo(
    () => board.sections.find((section) => section.id === activeId) ?? board.sections[0],
    [board.sections, activeId],
  );

  const countFor = (kind: "cell" | "extra", index: number) =>
    issues.filter((issue) => issue.slot === slotKey(active.id, kind, index)).length;

  const dustFindings = issues.filter((issue) => issue.slot === BOARD_SLOT).length;
  const selectedIssues = slot ? issues.filter((issue) => issue.slot === slot) : [];

  /**
   * What is being reported on. The main switch and the board itself are not
   * positions on the grid, so they answer for themselves rather than through a
   * cell — and dust is only ever reported against the board.
   */
  const picked: Picked | null =
    slot === MAIN_SWITCH_SLOT
      ? { title: "Main switch", kind: "Main switch", where: "Main switch", fixedType: null }
      : slot === BOARD_SLOT
        ? { title: "Dust ingress", kind: null, where: name, fixedType: "DUST_INGRESS" }
        : slot
          ? pickedCell(board, slot)
          : null;

  const rows = Array.from({ length: active.rows }, (_, row) =>
    Array.from({ length: COLUMNS }, (_, column) => row * COLUMNS + column),
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label={name}>
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">{name}</h2>
            <p className="board-section-note">
              Pick a breaker, RCD or contactor to report what you found on it.
              Blanks and empty ways cannot be picked.
            </p>
          </div>
          <div className="board-head-side">
            <button
              type="button"
              className={`board-dust ${slot === BOARD_SLOT ? "is-picked" : ""}`}
              onClick={() => setSlot(BOARD_SLOT)}
            >
              Report dust ingress
              {dustFindings > 0 ? (
                <span className="board-cell-count">{dustFindings}</span>
              ) : null}
            </button>
            <BoardLegend />
          </div>
        </header>

        <MainSwitchRow
          findings={issues.filter((issue) => issue.slot === MAIN_SWITCH_SLOT).length}
          picked={slot === MAIN_SWITCH_SLOT}
          onPick={() => setSlot(MAIN_SWITCH_SLOT)}
        />

        {board.sections.length > 1 ? (
          <nav className="board-tabs" aria-label="Board sections">
            {board.sections.map((section) => (
              <div
                key={section.id}
                className={`board-tab ${section.id === active.id ? "is-active" : ""}`}
              >
                <button
                  type="button"
                  className="board-tab-name"
                  onClick={() => {
                    setActiveId(section.id);
                    setSlot(null);
                  }}
                >
                  {section.name.trim() || "Unnamed section"}
                </button>
              </div>
            ))}
          </nav>
        ) : null}

        <div className="board-body">
          {active.extras.length > 0 ? (
            <section className="board-extras">
              <div className="board-section-head">
                <h3 className="board-section-title">Additional</h3>
              </div>
              <div className="board-extra-row">
                {active.extras.map((cell, index) => (
                  <ViewCell
                    key={index}
                    cell={cell}
                    slot={slotKey(active.id, "extra", index)}
                    active={slot === slotKey(active.id, "extra", index)}
                    findings={countFor("extra", index)}
                    onPick={setSlot}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="board-section-head">
              <h3 className="board-section-title">{active.name.trim() || "Board"}</h3>
            </div>
            <div className="board-grid">
              {rows.map((indexes, row) => (
                <div className="board-row" key={row}>
                  {indexes.map((index) => (
                    <ViewCell
                      key={index}
                      cell={active.cells[index]}
                      number={positionNumber(active, index, board.numbering)}
                      slot={slotKey(active.id, "cell", index)}
                      active={slot === slotKey(active.id, "cell", index)}
                      findings={countFor("cell", index)}
                      onPick={setSlot}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>

        {slot && picked ? (
          <section className="board-picked">
            <div className="board-picked-head">
              <div>
                <p className="board-picked-title">
                  {picked.title}{" "}
                  {picked.kind ? (
                    <span className="board-picked-kind">{picked.kind}</span>
                  ) : null}
                </p>
                <p className="board-section-note">
                  {selectedIssues.length
                    ? `${selectedIssues.length} finding${selectedIssues.length === 1 ? "" : "s"} this inspection`
                    : "Nothing reported here yet"}
                </p>
              </div>
              <button
                type="button"
                className="dialog-confirm"
                onClick={() => setReporting(true)}
              >
                {picked.fixedType ? "Report dust ingress" : "Report issue"}
              </button>
            </div>

            {error ? <p className="dialog-error">{error}</p> : null}

            {selectedIssues.length ? (
              <div className="board-findings">
                {selectedIssues.map((issue) => (
                  <article className="board-finding" key={issue.id}>
                    <div className="board-finding-head">
                      <span className={`issue-chip is-${issue.type.toLowerCase()}`}>
                        {ISSUE_LABELS[issue.type]}
                      </span>
                      <button
                        type="button"
                        className="board-finding-remove"
                        onClick={() => void removeIssue(issue.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="board-picked-photos">
                      {issue.photos.map((photo) => (
                        <figure key={photo.id} className="board-photo">
                          <Image
                            src={`/api/files/${photo.fileId}`}
                            alt={photo.kind.toLowerCase()}
                            width={280}
                            height={210}
                          />
                          {photo.kind === "PLAIN" ? null : (
                            <figcaption>
                              {photo.kind === "THERMAL" ? "Thermal" : "Visual"}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <footer className="board-foot">
          <div className="dialog-actions">
            <button type="button" className="dialog-confirm" onClick={onClose}>
              Save
            </button>
          </div>
        </footer>
      </div>

      {reporting && slot && picked ? (
        <IssueDialog
          inspectionId={inspectionId}
          equipmentId={equipmentId}
          slot={slot}
          where={picked.where}
          kind={picked.kind ?? undefined}
          title={picked.fixedType ? "Report dust ingress" : "Report issue"}
          types={POSITION_ISSUE_TYPES}
          fixedType={picked.fixedType}
          onCancel={() => setReporting(false)}
          onSaved={() => {
            setReporting(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ViewCell({
  cell,
  number,
  slot,
  active,
  findings,
  onPick,
}: {
  cell: BoardCell;
  number?: number;
  slot: string;
  active: boolean;
  findings: number;
  onPick: (slot: string) => void;
}) {
  const selectable = isDevice(cell.state);
  return (
    <div
      className={`board-cell is-${cell.state.toLowerCase()} ${
        selectable ? "is-selectable" : "is-locked"
      } ${active ? "is-picked" : ""} ${findings ? "is-flagged" : ""}`}
      onClick={() => selectable && onPick(slot)}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : -1}
      title={STATE_LABELS[cell.state]}
      onKeyDown={(event) => {
        if (!selectable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(slot);
        }
      }}
    >
      <span className="board-cell-no">{number ?? "R"}</span>
      <span className={`board-cell-text ${cell.label ? "" : "is-blank"}`}>
        {cell.label || (selectable ? "Unnamed" : "")}
      </span>
      {findings > 0 ? <span className="board-cell-count">{findings}</span> : null}
    </div>
  );
}

type Picked = {
  title: string;
  /** Breaker, RCD, contactor — or nothing, when it is not a device. */
  kind: string | null;
  /** How the report names the place it is filed against. */
  where: string;
  /** Set when there is nothing to choose. */
  fixedType: IssueType | null;
};

function pickedCell(board: Board, slot: string): Picked | null {
  const cell = cellForSlot(board, slot);
  if (!cell) return null;
  return {
    title: cell.label || "Unnamed",
    kind: STATE_LABELS[cell.state],
    where: describeSlot(board, slot, cell),
    fixedType: null,
  };
}

function cellForSlot(board: Board, slot: string): BoardCell | null {
  const [sectionId, kind, raw] = slot.split(":");
  const section = board.sections.find((entry) => entry.id === sectionId);
  const index = Number(raw);
  if (!section || Number.isNaN(index)) return null;
  return kind === "extra" ? (section.extras[index] ?? null) : (section.cells[index] ?? null);
}

/** "Lighting section · 3 · Level 1 lights" — where a finding is being filed. */
function describeSlot(board: Board, slot: string, cell: BoardCell): string {
  const [sectionId, kind, raw] = slot.split(":");
  const section = board.sections.find((entry) => entry.id === sectionId);
  const index = Number(raw);
  const parts: string[] = [];
  if (section && board.sections.length > 1 && section.name.trim()) {
    parts.push(section.name.trim());
  }
  parts.push(
    kind === "extra"
      ? "Additional"
      : String(section ? positionNumber(section, index, board.numbering) : index + 1),
  );
  parts.push(cell.label || "Unnamed");
  return parts.join("  ·  ");
}
