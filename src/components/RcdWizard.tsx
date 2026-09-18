"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COLUMNS,
  isRcd,
  normaliseBoard,
  positionNumber,
  slotKey,
  type Board,
  type CellState,
} from "@/lib/board";
import { CHECKLIST, checklistComplete } from "@/lib/rcd/checklist";
import { countRcdTests } from "@/lib/rcd/map";
import { uploadFile } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Turning an instrument's export into a report.
 *
 * The instrument knows nothing about the board, so the operator supplies what
 * it cannot: which board this was, the order they worked it, and which ways
 * they ended up testing twice. Nothing is silently corrected — every step
 * shows what it is about to throw away.
 */

type Step = "upload" | "board" | "duplicates" | "checks";

type Parsed = {
  boardName: string | null;
  siteName: string | null;
  circuitRange: string | null;
  rows: { name: string }[];
  emptyCount: number;
};

type Run = {
  id: string;
  sourceFileId: string | null;
  equipment: { id: string; name: string; board: unknown } | null;
  site: { name: string; equipment: { id: string; name: string; board: unknown }[] };
  parsed: Parsed | null;
  mismatches: string[];
};

/** An additional RCD, as the operator picks the order they tested them in. */
type Extra = { slot: string; label: string; state: CellState };

export function RcdWizard({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const key = `rcd:${runId}`;
  const [run, setRun] = useState<Run | null>(null);
  const [step, setStep] = usePersisted<Step>(`${key}:step`, "upload");
  const [equipmentId, setEquipmentId] = usePersisted<string>(`${key}:board`, "");
  const [order, setOrder] = usePersisted<"COLUMNS" | "ROWS">(`${key}:order`, "COLUMNS");
  const [extrasFirst, setExtrasFirst] = usePersisted(`${key}:extrasfirst`, true);
  const [extraOrder, setExtraOrder] = usePersisted<string[]>(`${key}:extraorder`, []);
  const [extras, setExtras] = usePersisted<Record<string, number>>(`${key}:extras`, {});
  const [answers, setAnswers] = usePersisted<Record<string, boolean | string>>(
    `${key}:checks`,
    {},
  );
  const [mismatches, setMismatches] = useState<string[]>([]);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/rcd-tests/${runId}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as Run;
    setRun(data);
    if (data.parsed) setParsed(data.parsed);
    if (data.mismatches?.length) setMismatches(data.mismatches);
    if (data.equipment?.id) setEquipmentId((current) => current || data.equipment!.id);
  }, [runId, setEquipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const boards = run?.site.equipment ?? [];
  const chosen = boards.find((board) => board.id === equipmentId) ?? null;
  const board: Board | null = chosen ? normaliseBoard(chosen.board) : null;
  const realTests = parsed ? parsed.rows.length - parsed.emptyCount : 0;
  const rcdTests = board ? countRcdTests(board) : 0;

  /** The RCDs sitting outside the grid — the ones with no numbering to follow. */
  const extraDevices = useMemo<Extra[]>(
    () =>
      board
        ? board.sections.flatMap((section) =>
            section.extras.flatMap((cell, index) =>
              isRcd(cell.state)
                ? [
                    {
                      slot: slotKey(section.id, "extra", index),
                      label: cell.label.trim() || `Additional ${index + 1}`,
                      state: cell.state,
                    },
                  ]
                : [],
            ),
          )
        : [],
    [board],
  );

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadFile(file);
      const response = await fetch(`/api/rcd-tests/${runId}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: stored.id, equipmentId: equipmentId || undefined }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That export could not be read.");
      }
      const result = (await response.json()) as { parsed: Parsed; mismatches: string[] };
      setParsed(result.parsed);
      setMismatches(result.mismatches);
      await load();
      // Deliberately stays on this step: the operator should see what was read
      // out of the file — and anything that disagrees — before moving on.
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  /** Re-runs the cross-check once a board has been chosen. */
  async function recheck(nextBoard: string) {
    if (!run?.sourceFileId) return;
    const response = await fetch(`/api/rcd-tests/${runId}/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: run.sourceFileId, equipmentId: nextBoard || undefined }),
    });
    if (!response.ok) return;
    const result = (await response.json()) as { parsed: Parsed; mismatches: string[] };
    setParsed(result.parsed);
    setMismatches(result.mismatches);
  }

  async function finalise() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rcd-tests/${runId}/finalise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walk: { order, extrasFirst, extraOrder },
          extras,
          checklist: answers,
          mismatches,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Those results could not be saved.");
      }
      for (const part of [
        "step",
        "board",
        "order",
        "extrasfirst",
        "extraorder",
        "extras",
        "checks",
      ]) {
        clearSession(`${key}:${part}`);
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
      setBusy(false);
    }
  }

  const extraTotal = Object.values(extras).reduce((total, count) => total + count, 0);
  const ready = checklistComplete(answers);

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="RCD test">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">RCD test</h2>
            <p className="board-section-note">
              {run?.site.name ?? ""}
              {chosen ? ` · ${chosen.name}` : ""}
            </p>
          </div>
          <div className="board-head-side">
            <nav className="rcd-steps" aria-label="Steps">
              {(
                [
                  ["upload", "Export"],
                  ["board", "Board"],
                  ["duplicates", "Duplicates"],
                  ["checks", "Checks"],
                ] as [Step, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rcd-step ${step === id ? "is-on" : ""}`}
                  disabled={id !== "upload" && !parsed}
                  onClick={() => setStep(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            {mismatches.length > 0 ? (
              <section className="rcd-warning">
                <h3 className="board-section-title">This does not line up</h3>
                {mismatches.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p className="issue-empty">
                  You can still use it. The report will then be issued under the
                  names on the export, not the ones it is filed against — these
                  readings came off whatever the instrument was standing in front
                  of, and the report has to say so.
                </p>
              </section>
            ) : null}

            {step === "upload" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">The instrument&rsquo;s export</h3>
                  <p className="board-section-note">
                    The PDF downloaded off the tester. It is kept exactly as it came and
                    bound into the back of the report.
                  </p>
                </div>
                <label className="rcd-drop">
                  {busy ? "Reading…" : parsed ? "Replace the export" : "Choose the PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(event) => {
                      void upload(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>

                {parsed ? (
                  <dl className="rcd-facts">
                    <div>
                      <dt>Board</dt>
                      <dd>{parsed.boardName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Site</dt>
                      <dd>{parsed.siteName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Ways</dt>
                      <dd>{parsed.circuitRange ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Tests</dt>
                      <dd>
                        {realTests} real, {parsed.emptyCount} empty
                      </dd>
                    </div>
                    <div>
                      <dt>Checks</dt>
                      <dd>{mismatches.length === 0 ? "All line up" : `${mismatches.length} to review`}</dd>
                    </div>
                  </dl>
                ) : null}
              </section>
            ) : null}

            {step === "board" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">Which board, and how you worked it</h3>
                  <p className="board-section-note">
                    The tests are dealt onto the ways in the order you walked them.
                  </p>
                </div>

                <div className="issue-picks">
                  {boards.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`issue-pick ${equipmentId === option.id ? "is-on" : ""}`}
                      onClick={() => {
                        setEquipmentId(option.id);
                        void recheck(option.id);
                      }}
                    >
                      <span className="issue-pick-mark is-one" aria-hidden />
                      <span className="issue-pick-body">
                        <span className="issue-pick-label">{option.name}</span>
                        <span className="issue-pick-note">
                          {countRcdTests(normaliseBoard(option.board))} RCD tests drawn
                        </span>
                      </span>
                    </button>
                  ))}
                  {boards.length === 0 ? (
                    <p className="issue-empty">
                      No switchboards are drawn at this site yet. Draw one under Clients
                      first.
                    </p>
                  ) : null}
                </div>

                <div className="board-section-head rcd-subhead">
                  <h3 className="board-section-title">Order worked</h3>
                  <p className="board-section-note">
                    The grid is always walked left to right. Only the RCDs take a
                    test — {rcdTests} of them on this board, counting a three-phase
                    device as three.
                  </p>
                </div>
                <div className="issue-picks">
                  {(
                    [
                      ["COLUMNS", "Down each column in turn"],
                      ["ROWS", "Across each row, then down"],
                    ] as ["COLUMNS" | "ROWS", string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`issue-pick ${order === id ? "is-on" : ""}`}
                      onClick={() => setOrder(id)}
                    >
                      <span className="issue-pick-mark is-one" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>

                {extraDevices.length > 0 ? (
                  <>
                    <div className="board-section-head rcd-subhead">
                      <h3 className="board-section-title">The additional RCDs</h3>
                      <p className="board-section-note">
                        Where these fall in the run decides which test lands on
                        which device, so it has to be the order you actually worked.
                      </p>
                    </div>
                    <div className="issue-picks">
                      {(
                        [
                          [true, "Tested before the grid"],
                          [false, "Tested after the grid"],
                        ] as [boolean, string][]
                      ).map(([value, label]) => (
                        <button
                          key={String(value)}
                          type="button"
                          className={`issue-pick ${extrasFirst === value ? "is-on" : ""}`}
                          onClick={() => setExtrasFirst(value)}
                        >
                          <span className="issue-pick-mark is-one" aria-hidden />
                          {label}
                        </button>
                      ))}
                    </div>

                    {extraDevices.length > 1 ? (
                      <ExtraOrder
                        devices={extraDevices}
                        picked={extraOrder}
                        onChange={setExtraOrder}
                      />
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}

            {step === "duplicates" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">RCDs you tested more than once</h3>
                  <p className="board-section-note">
                    Click an RCD to mark an extra test against it, again for two, again
                    for three. Those extra records are set aside rather than mapped.
                    Breakers take no test, so they cannot be marked.
                  </p>
                </div>
                {board ? (
                  <DuplicatePicker board={board} extras={extras} onChange={setExtras} />
                ) : (
                  <p className="issue-empty">Choose a board first.</p>
                )}
                <p className="issue-empty">
                  {realTests} real tests · {extraTotal} marked as repeats ·{" "}
                  {Math.max(0, realTests - extraTotal)} to map
                </p>
              </section>
            ) : null}

            {step === "checks" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">Before the report goes out</h3>
                  <p className="board-section-note">
                    The instrument cannot record these, so they are asked once and
                    printed on the report.
                  </p>
                </div>
                <div className="issue-picks">
                  {CHECKLIST.map((item) =>
                    item.freeText ? (
                      <label className="issue-note" key={item.key}>
                        <span className="board-section-title">{item.question}</span>
                        <textarea
                          rows={2}
                          value={String(answers[item.key] ?? "")}
                          placeholder="Leave blank if everything was tested."
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [item.key]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : (
                      <button
                        key={item.key}
                        type="button"
                        className={`issue-pick ${answers[item.key] === true ? "is-on" : ""}`}
                        onClick={() =>
                          setAnswers((current) => ({
                            ...current,
                            [item.key]: current[item.key] === true ? false : true,
                          }))
                        }
                      >
                        <span className="issue-pick-mark" aria-hidden />
                        {item.question}
                      </button>
                    ),
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <footer className="board-foot">
          {error ? <p className="dialog-error">{error}</p> : null}
          {step === "checks" && !ready ? (
            <p className="board-warning">
              Every check has to be confirmed before the results can be saved.
            </p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={onClose}>
              Close
            </button>
            {step === "checks" ? (
              <button
                type="button"
                className="dialog-confirm"
                disabled={!ready || busy || !parsed}
                onClick={() => void finalise()}
              >
                {busy ? "Saving…" : "Save results"}
              </button>
            ) : (
              <button
                type="button"
                className="dialog-confirm"
                disabled={!parsed || (step === "board" && !equipmentId)}
                onClick={() =>
                  setStep(step === "upload" ? "board" : step === "board" ? "duplicates" : "checks")
                }
              >
                Next
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * The additional RCDs, clicked into the order they were tested.
 *
 * They sit outside the grid and have no numbering of their own, so nothing but
 * the operator can say which of them the instrument's first test belongs to.
 * Anything left unclicked follows in the order it is drawn.
 */
function ExtraOrder({
  devices,
  picked,
  onChange,
}: {
  devices: Extra[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  const known = picked.filter((slot) => devices.some((device) => device.slot === slot));

  const toggle = (slot: string) =>
    onChange(
      known.includes(slot) ? known.filter((other) => other !== slot) : [...known, slot],
    );

  return (
    <>
      <p className="board-section-note rcd-order-note">
        Click them in the order you tested them.
        {known.length > 0 ? (
          <button type="button" className="rcd-order-clear" onClick={() => onChange([])}>
            Start again
          </button>
        ) : null}
      </p>
      <div className="board-extra-row">
        {devices.map((device, drawn) => {
          const at = known.indexOf(device.slot);
          return (
            <div
              key={device.slot}
              role="button"
              tabIndex={0}
              className={`board-cell is-${device.state.toLowerCase()} is-selectable ${
                at >= 0 ? "is-ranked" : ""
              }`}
              onClick={() => toggle(device.slot)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(device.slot);
                }
              }}
            >
              <span className="board-cell-no">{at >= 0 ? at + 1 : drawn + 1}</span>
              <span className="board-cell-text">{device.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The board, read-only, with a tally on any way that was tested more than once. */
function DuplicatePicker({
  board,
  extras,
  onChange,
}: {
  board: Board;
  extras: Record<string, number>;
  onChange: (next: (current: Record<string, number>) => Record<string, number>) => void;
}) {
  const bump = (slot: string) =>
    onChange((current) => {
      const next = { ...current };
      const value = (next[slot] ?? 0) + 1;
      if (value > 3) delete next[slot];
      else next[slot] = value;
      return next;
    });

  return (
    <>
      {board.sections.map((section) => (
        <div key={section.id}>
          {board.sections.length > 1 ? (
            <div className="board-section-head">
              <h3 className="board-section-title">{section.name || "Section"}</h3>
            </div>
          ) : null}

          {section.extras.some((cell) => isRcd(cell.state)) ? (
            <div className="rcd-extras">
              <p className="rcd-extras-title">Additional RCDs</p>
              <div className="board-extra-row">
                {section.extras.map((cell, index) =>
                  isRcd(cell.state) ? (
                    <DuplicateCell
                      key={index}
                      label={cell.label || "Unnamed"}
                      state={cell.state}
                      number={null}
                      count={extras[slotKey(section.id, "extra", index)] ?? 0}
                      onClick={() => bump(slotKey(section.id, "extra", index))}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ) : null}

          <div className="board-grid">
            {Array.from({ length: section.rows }, (_, row) => (
              <div className="board-row" key={row}>
                {Array.from({ length: COLUMNS }, (_, column) => {
                  const index = row * COLUMNS + column;
                  const cell = section.cells[index];
                  const slot = slotKey(section.id, "cell", index);
                  const state = cell?.state ?? "EMPTY";
                  return (
                    <DuplicateCell
                      key={index}
                      label={cell?.label || (isRcd(state) ? "Unnamed" : "")}
                      state={state}
                      number={positionNumber(section, index, board.numbering)}
                      count={extras[slot] ?? 0}
                      onClick={() => isRcd(state) && bump(slot)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function DuplicateCell({
  label,
  state,
  number,
  count,
  onClick,
}: {
  label: string;
  state: string;
  number: number | null;
  count: number;
  onClick: () => void;
}) {
  const selectable = isRcd(state as never);
  return (
    <div
      className={`board-cell is-${state.toLowerCase()} ${
        selectable ? "is-selectable" : "is-locked"
      } ${count ? "is-flagged" : ""}`}
      onClick={onClick}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : -1}
      onKeyDown={(event) => {
        if (selectable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span className="board-cell-no">{number ?? "R"}</span>
      <span className={`board-cell-text ${label ? "" : "is-blank"}`}>{label}</span>
      {count > 0 ? <span className="board-cell-count">×{count}</span> : null}
    </div>
  );
}
