"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STATE_SHORT,
  freeSlotKey,
  isFreeBoard,
  isRcd,
  normaliseBoard,
  type Board,
} from "@/lib/board";
import { BoardPicker } from "@/components/BoardPicker";
import { FreeBoardView } from "@/components/FreeBoardEditor";
import { checklistComplete, checklistFor } from "@/lib/rcd/checklist";
import {
  boardDevices,
  countRcds,
  countRcdTests,
  mapTests,
  walkPositions,
  type Device,
  type Place,
  type Scope,
} from "@/lib/rcd/map";
import type { RcdRow } from "@/lib/rcd/parse";
import { uploadFile } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";
import { personName } from "@/lib/contacts";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * Turning an instrument's export into a report.
 *
 * The instrument knows nothing about the board, so the operator supplies what
 * it cannot: which board this was, the order they worked it, and which ways
 * they ended up testing twice. Nothing is silently corrected — every step
 * shows what it is about to throw away.
 */

type Step = "upload" | "board" | "duplicates" | "mapping" | "checks";

/**
 * A record as it comes back off the stored parse.
 *
 * The same shape the parser produced, less the timestamp, which crosses as a
 * string once the parse has been through the database. Nothing here reads it.
 */
type Row = Omit<RcdRow, "takenAt">;

type Parsed = {
  boardName: string | null;
  siteName: string | null;
  circuitRange: string | null;
  rows: Row[];
  emptyCount: number;
};

type Run = {
  id: string;
  sourceFileId: string | null;
  equipment: { id: string; name: string; board: unknown } | null;
  /** The visit this board belongs to, which is what carries the contact. */
  report: { id: string; contactId: string | null } | null;
  site: {
    name: string;
    contacts: { id: string; name: string }[];
    equipment: { id: string; name: string; board: unknown }[];
  };
  parsed: Parsed | null;
  mismatches: string[];
};

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
  const [scope, setScope] = usePersisted<Scope>(`${key}:scope`, "BOARD");
  const [order, setOrder] = usePersisted<"COLUMNS" | "ROWS">(`${key}:order`, "COLUMNS");
  const [extrasFirst, setExtrasFirst] = usePersisted(`${key}:extrasfirst`, true);
  const [extraOrder] = usePersisted<string[]>(`${key}:extraorder`, []);
  const [sequence, setSequence] = usePersisted<string[]>(`${key}:sequence`, []);
  const [extras, setExtras] = usePersisted<Record<string, number>>(`${key}:extras`, {});
  const [answers, setAnswers] = usePersisted<Record<string, boolean | string>>(
    `${key}:checks`,
    {},
  );
  const [mismatches, setMismatches] = useState<string[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
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
    setContactId(data.report?.contactId ?? null);
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
  /** Every record the board would account for if the whole of it were tested. */
  const boardTests = board ? countRcdTests(board) : 0;

  /**
   * Every RCD on the board, in the run as it stands: the ones clicked into an
   * order first, then whatever is left in the order it is drawn.
   */
  const devices = useMemo<Device[]>(
    () => (board ? boardDevices(board, { scope, order, extrasFirst, extraOrder, sequence }) : []),
    [board, scope, order, extrasFirst, extraOrder, sequence],
  );

  /**
   * Every RCD drawn on the board, whether it is in this run or not.
   *
   * On a run of particular breakers the list above holds only the ones that
   * were picked, and there would be nothing left to pick the others from.
   */
  const drawn = useMemo<Device[]>(
    () =>
      board
        ? boardDevices(board, {
            scope: "BOARD",
            order,
            extrasFirst,
            extraOrder,
            sequence: [],
          })
        : [],
    [board, order, extrasFirst, extraOrder],
  );

  /** The ones that were picked, in the order they were picked. */
  const picked = useMemo<Device[]>(() => {
    const bySlot = new Map(drawn.map((device) => [device.slot, device]));
    return sequence
      .map((slot) => bySlot.get(slot))
      .filter((device): device is Device => Boolean(device));
  }, [drawn, sequence]);

  /**
   * How many of the instrument's records this run should account for.
   *
   * The whole board on a whole-board run; only what was picked on a run of
   * particular breakers, counting a three-phase device as three.
   */
  const rcdTests =
    scope === "PICKED"
      ? picked.reduce((total, device) => total + device.tests, 0)
      : boardTests;

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

  /** Saves the chosen person onto the visit this board belongs to. */
  async function chooseContact(value: string | null) {
    const reportId = run?.report?.id;
    if (!reportId) return;
    setContactId(value);
    await fetch(`/api/rcd-reports/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: value }),
    }).catch(() => setError("That contact could not be saved."));
  }

  async function finalise() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rcd-tests/${runId}/finalise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walk: { scope, order, extrasFirst, extraOrder, sequence },
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
        "scope",
        "order",
        "extrasfirst",
        "extraorder",
        "sequence",
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

  /**
   * The mapping as it will be saved — worked out here the same way the save
   * works it out, off the same walk, so what is reviewed is what is written.
   */
  const mapping = useMemo(() => {
    if (!board || !parsed) return null;
    const positions = walkPositions(board, { scope, order, extrasFirst, extraOrder, sequence });
    return mapTests(parsed.rows as RcdRow[], positions, extras);
  }, [board, parsed, scope, order, extrasFirst, extraOrder, sequence, extras]);

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="RCD test">
      <DialogScrim />

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
                  ["mapping", "Mapping"],
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

                {board ? (
                  <>
                    <div className="board-section-head rcd-subhead">
                      <h3 className="board-section-title">What did you test?</h3>
                      <p className="board-section-note">
                        A whole-board test walks every RCD drawn on it. A test of
                        particular circuit breakers covers only the ones you pick, in
                        the order you picked them, and says so on the report.
                      </p>
                    </div>
                    <div className="issue-picks">
                      {(
                        [
                          [
                            "BOARD",
                            "The whole switchboard",
                            `Every RCD on this board \u2014 ${boardTests} ${
                              boardTests === 1 ? "record" : "records"
                            }, counting a three-phase device as three.`,
                          ],
                          [
                            "PICKED",
                            "Specific circuit breakers",
                            "Pick them on the board below. The first one you pick takes the instrument's first test, the second its second, and so on.",
                          ],
                        ] as [Scope, string, string][]
                      ).map(([id, label, note]) => (
                        <button
                          key={id}
                          type="button"
                          className={`issue-pick ${scope === id ? "is-on" : ""}`}
                          onClick={() => setScope(id)}
                        >
                          <span className="issue-pick-mark is-one" aria-hidden />
                          <span className="issue-pick-body">
                            <span className="issue-pick-label">{label}</span>
                            <span className="issue-pick-note">{note}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {board && isFreeBoard(board) && scope === "BOARD" ? (
                  <>
                    <div className="board-section-head rcd-subhead">
                      <h3 className="board-section-title">The order you set</h3>
                      <p className="board-section-note">
                        This board was drawn freehand, so it carries its own
                        testing order — the one numbered when it was drawn. The
                        instrument&rsquo;s first reading goes to number 1, and so
                        on down. Check it against how you actually worked it
                        before going on.
                      </p>
                    </div>
                    <FreeBoardView board={board} showOrder />
                  </>
                ) : board && isFreeBoard(board) ? (
                  <>
                    <div className="board-section-head rcd-subhead">
                      <h3 className="board-section-title">
                        Which ones you tested, in order
                      </h3>
                      <p className="board-section-note rcd-order-note">
                        Click the RCDs you tested, in the order you tested them. Only
                        these go on the report.
                        {sequence.length > 0 ? (
                          <button
                            type="button"
                            className="rcd-order-clear"
                            onClick={() => setSequence([])}
                          >
                            Start again
                          </button>
                        ) : null}
                      </p>
                    </div>
                    <FreeBoardView
                      board={board}
                      selectable={(item) => isRcd(item.state)}
                      marks={Object.fromEntries(
                        (board.items ?? [])
                          .filter((item) => sequence.includes(freeSlotKey(item.id)))
                          .map((item) => [
                            item.id,
                            String(sequence.indexOf(freeSlotKey(item.id)) + 1),
                          ]),
                      )}
                      onPick={(item) =>
                        setSequence((current) => {
                          const slot = freeSlotKey(item.id);
                          return current.includes(slot)
                            ? current.filter((other) => other !== slot)
                            : [...current, slot];
                        })
                      }
                    />
                  </>
                ) : (
                <>
                {/*
                  * Only worth asking while something is still unclicked: once
                  * the whole board has been put in an order by hand there is
                  * nothing left for a default to decide.
                  */}
                {scope === "BOARD" &&
                devices.some((device) => !sequence.includes(device.slot)) ? (
                  <>
                    <div className="board-section-head rcd-subhead">
                      <h3 className="board-section-title">The default run</h3>
                      <p className="board-section-note">
                        How the ways are read for anything you do not put in an
                        order below. Only the RCDs take a test — {boardTests}{" "}
                        records on this board, counting a three-phase device as
                        three.
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

                    {devices.some((device) => device.place === "EXTRA") ? (
                      <div className="issue-picks rcd-picks-after">
                        {(
                          [
                            [true, "Additionals before the grid"],
                            [false, "Additionals after the grid"],
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
                    ) : null}
                  </>
                ) : null}

                {/*
                  * Clicked on the board rather than off a list: the run moves
                  * between the grid, the additionals by the main switch and a
                  * sub-board on the end, and only the board itself shows all
                  * three in one picture.
                  */}
                <div className="board-section-head rcd-subhead">
                  <h3 className="board-section-title">
                    {scope === "PICKED"
                      ? "Which circuit breakers, in order"
                      : "The order you tested them"}
                  </h3>
                  <p className="board-section-note rcd-order-note">
                    {scope === "PICKED"
                      ? "Click the circuit breakers you tested, in the order you tested them. The number on a device is where it falls in the instrument's run; nothing else on this board goes on the report."
                      : "Click the RCDs on the board in the order you worked them — the grid, the additionals and any sub-board in one run. The number on a device is where it falls; a faded one is where it would fall if you left it as drawn."}
                    {sequence.length > 0 ? (
                      <button
                        type="button"
                        className="rcd-order-clear"
                        onClick={() => setSequence([])}
                      >
                        Start again
                      </button>
                    ) : null}
                  </p>
                </div>

                {board ? (
                  <BoardPicker
                    board={board}
                    marks={Object.fromEntries(
                      (scope === "PICKED" ? picked : devices).map((device, at) => [
                        device.slot,
                        String(at + 1),
                      ]),
                    )}
                    dim={(slot) => !sequence.includes(slot)}
                    onPick={(pick) =>
                      setSequence((current) =>
                        current.includes(pick.slot)
                          ? current.filter((slot) => slot !== pick.slot)
                          : [...current, pick.slot],
                      )
                    }
                  />
                ) : null}

                <TestOrder
                  devices={scope === "PICKED" ? drawn : devices}
                  picked={sequence}
                  scope={scope}
                  onChange={setSequence}
                />
                </>
                )}
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
                  isFreeBoard(board) ? (
                    <FreeBoardView
                      board={board}
                      showOrder
                      selectable={(item) => isRcd(item.state)}
                      marks={Object.fromEntries(
                        (board.items ?? [])
                          .filter((item) => extras[freeSlotKey(item.id)])
                          .map((item) => [item.id, `\u00d7${extras[freeSlotKey(item.id)]}`]),
                      )}
                      onPick={(item) =>
                        setExtras((current) => {
                          const next = { ...current };
                          const slot = freeSlotKey(item.id);
                          const value = (next[slot] ?? 0) + 1;
                          if (value > 3) delete next[slot];
                          else next[slot] = value;
                          return next;
                        })
                      }
                    />
                  ) : (
                    // The board as it is drawn: the same enclosure, the same
                    // names, the same numbers. The RCD tested twice has to be
                    // findable on it.
                    <BoardPicker
                      board={board}
                      marks={Object.fromEntries(
                        Object.entries(extras)
                          .filter(([, count]) => count > 0)
                          .map(([slot, count]) => [slot, `×${count}`]),
                      )}
                      onPick={(pick) =>
                        setExtras((current) => {
                          const next = { ...current };
                          const value = (next[pick.slot] ?? 0) + 1;
                          if (value > 3) delete next[pick.slot];
                          else next[pick.slot] = value;
                          return next;
                        })
                      }
                    />
                  )
                ) : (
                  <p className="issue-empty">Choose a board first.</p>
                )}
                <p className="issue-empty">
                  {realTests} real tests · {extraTotal} marked as repeats ·{" "}
                  {Math.max(0, realTests - extraTotal)} to map
                </p>
              </section>
            ) : null}

            {step === "mapping" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">Which test landed on which device</h3>
                  <p className="board-section-note">
                    Every record the instrument kept, against the device it has been
                    dealt onto — named for every way that device occupies, and for a
                    three-phase device saying which phase of it this reading is. This
                    is exactly what goes on the report.
                  </p>
                </div>
                {scope === "PICKED" && sequence.length === 0 ? (
                  <p className="board-warning">
                    No circuit breakers have been picked yet. Go back to the board and
                    click the ones you tested, in the order you tested them.
                  </p>
                ) : null}
                {mapping && board ? (
                  <>
                    <p className="issue-empty">
                      {scope === "PICKED"
                        ? `${picked.length} of ${countRcds(board)} RCDs picked`
                        : `${countRcds(board)} RCDs`}{" "}
                      · {rcdTests} tests expected ·{" "}
                      {mapping.pairs.filter((pair) => pair.position).length} matched
                      {mapping.duplicates.length > 0
                        ? ` · ${mapping.duplicates.length} set aside as repeats`
                        : ""}
                      {mapping.dropped.length > 0
                        ? ` · ${mapping.dropped.length} empty ${
                            mapping.dropped.length === 1 ? "record" : "records"
                          } dropped`
                        : ""}
                    </p>
                    <table className="rcd-map">
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Device</th>
                          <th>Phase</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapping.pairs.map((pair) => (
                          <tr
                            key={pair.row.name}
                            className={pair.position ? "" : "is-loose"}
                          >
                            <td>{pair.row.name}</td>
                            <td>{pair.position?.label ?? "Nothing left on this board"}</td>
                            <td>{pair.position?.phase ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {mapping.untested.length > 0 ? (
                      <p className="board-warning">
                        No record reached{" "}
                        {mapping.untested
                          .map((position) =>
                            position.phase
                              ? `${position.label} ${position.phase}`
                              : position.label,
                          )
                          .join(", ")}
                        .
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="issue-empty">Choose a board first.</p>
                )}
              </section>
            ) : null}

            {step === "checks" ? (
              <section>
                {/*
                  * Who the report is addressed to. Asked here because this is
                  * where the visit is finished off, and taking whichever
                  * contact happened to be added first is not a choice anybody
                  * made. It is kept on the visit, so every board tested on it
                  * carries the same name.
                  */}
                <div className="board-section-head">
                  <h3 className="board-section-title">Who the report is for</h3>
                  <p className="board-section-note">
                    {run?.site.contacts.length
                      ? "The person named on the front of this RCD report."
                      : "Nobody is on file for this site yet. Add a contact under Clients and they will appear here."}
                  </p>
                </div>
                {run?.site.contacts.length ? (
                  <div className="issue-picks">
                    {run.site.contacts.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        className={`issue-pick ${contactId === person.id ? "is-on" : ""}`}
                        onClick={() => void chooseContact(contactId === person.id ? null : person.id)}
                      >
                        <span className="issue-pick-mark is-one" aria-hidden />
                        <span className="issue-pick-body">
                          <span className="issue-pick-label">{personName(person.name)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="board-section-head rcd-subhead">
                  <h3 className="board-section-title">Before the report goes out</h3>
                  <p className="board-section-note">
                    The instrument cannot record these, so they are asked once and
                    printed on the report.
                  </p>
                </div>
                <div className="issue-picks">
                  {checklistFor(scope === "BOARD").map((item) =>
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
                // A run of particular breakers cannot move on until at least
                // one has been picked: there would be nothing to deal the
                // instrument's tests onto.
                disabled={
                  !parsed ||
                  (step === "board" &&
                    (!equipmentId || (scope === "PICKED" && sequence.length === 0)))
                }
                onClick={() =>
                  setStep(
                    step === "upload"
                      ? "board"
                      : step === "board"
                        ? "duplicates"
                        : step === "duplicates"
                          ? "mapping"
                          : "checks",
                  )
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

/** Where a device sits, said the way somebody standing at the board would. */
const PLACES: Record<Place, string> = {
  GRID: "On the rail",
  EXTRA: "Beside the main switch",
  SUB: "Sub-board",
  FREE: "On the board",
};

/**
 * Every RCD on the board, clicked into the order they were tested.
 *
 * Nothing about how a board is drawn says which device the instrument's first
 * record belongs to: a job might start on a sub-board hanging off the end,
 * carry on down the grid and finish on the RCDs beside the main switch. So the
 * whole board is one list and the operator clicks their way down it in the
 * order they actually worked.
 *
 * Whatever is left unclicked follows behind in the order it is drawn, so a
 * board worked straight down needs no clicking at all. The list is always
 * shown in the run as it stands, which is the order the records will be dealt
 * in.
 */
function TestOrder({
  devices,
  picked,
  scope,
  onChange,
}: {
  devices: Device[];
  picked: string[];
  scope: Scope;
  onChange: (next: string[]) => void;
}) {
  const known = picked.filter((slot) => devices.some((device) => device.slot === slot));

  const toggle = (slot: string) =>
    onChange(
      known.includes(slot) ? known.filter((other) => other !== slot) : [...known, slot],
    );

  if (devices.length === 0) {
    return <p className="issue-empty">No RCDs are drawn on this board.</p>;
  }

  return (
    <>
      <div className="board-section-head rcd-subhead">
        <h3 className="board-section-title">
          {scope === "PICKED" ? "Which ones you tested" : "The order you tested them"}
        </h3>
        <p className="board-section-note rcd-order-note">
          {scope === "PICKED"
            ? "Every RCD on this board, wherever it is drawn. Click the ones you tested, in the order you tested them; the rest are not part of this test."
            : "Every RCD on this board, wherever it is drawn. Click them in the order you worked them — the grid, the additionals and any sub-board in one run. Anything you leave unclicked follows on as drawn."}
          {known.length > 0 ? (
            <button type="button" className="rcd-order-clear" onClick={() => onChange([])}>
              Start again
            </button>
          ) : null}
        </p>
      </div>
      <ol className="rcd-run">
        {devices.map((device, place) => {
          const at = known.indexOf(device.slot);
          // On a whole-board run every device has a place, whether it was
          // clicked or not. On a run of particular breakers only the ones
          // picked have one, and the rest are not in the run to be numbered.
          const rank = scope === "PICKED" ? (at >= 0 ? at + 1 : null) : place + 1;
          return (
            <li key={device.slot}>
              <button
                type="button"
                className={`rcd-run-item ${at >= 0 ? "is-ranked" : ""}`}
                onClick={() => toggle(device.slot)}
              >
                <span className="rcd-run-no">{rank ?? "\u2013"}</span>
                <span className={`board-cell is-${device.state.toLowerCase()} is-chip`}>
                  {STATE_SHORT[device.state]}
                </span>
                <span className="rcd-run-body">
                  <span className="rcd-run-name">{device.label}</span>
                  <span className="rcd-run-where">
                    {PLACES[device.place]}
                    {device.section ? ` · ${device.section}` : ""}
                    {device.numbers.length > 0
                      ? ` · ${
                          device.numbers.length === 1 ? "position" : "positions"
                        } ${device.numbers.join(", ")}`
                      : ""}
                    {device.tests > 1 ? ` · ${device.tests} records` : ""}
                  </span>
                </span>
                <span className="rcd-run-mark">
                  {at >= 0 ? "Picked" : scope === "PICKED" ? "Not tested" : "As drawn"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
