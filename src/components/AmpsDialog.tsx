"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { personName } from "@/lib/contacts";
import { uploadFile } from "@/components/ImageUpload";
import { PreparedByPicks } from "@/components/PreparedByPicks";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Building an amp reading report out of several short recordings.
 *
 * One clamp, one circuit, a minute at a second apiece — and then the same again
 * on the next circuit. So this is a list rather than a single upload: each
 * recording is named as it goes in, because "A-Phase PIT JACKS" is what the
 * report has to say and the meter's own file name never is, and each one can
 * carry the stated current rating of the device protecting that circuit.
 *
 * What the file says is read back straight away and shown under the name, so a
 * file that read wrongly is obvious here rather than in a report somebody has
 * already sent.
 */

type Device = "BREAKER" | "RCBO";
type Phase = "RED" | "WHITE" | "BLUE" | "NEUTRAL";

type Summary = {
  count: number;
  from: number;
  to: number;
  seconds: number;
  max: number;
  maxAt: number;
  average: number;
  zeros: number;
  intervalSeconds: number;
  notes: string[];
  checks: { what: string; declared: string; imported: string; agrees: boolean }[];
};

type Recording = {
  id: string;
  name: string;
  rating: number | null;
  device: Device | null;
  phase: Phase | null;
  position: number;
  summary: Summary | null;
  file: { id: string; originalName: string } | null;
};

type Report = {
  id: string;
  purpose: string | null;
  location: string | null;
  equipmentId: string | null;
  instrumentId: string | null;
  contactId: string | null;
  contactName: string | null;
  preparedBy: string[];
  recordings: Recording[];
  site: {
    name: string;
    location: string | null;
    equipment: { id: string; name: string }[];
    contacts: { id: string; name: string }[];
  };
};

type Instrument = { id: string; name: string; modelNo: string | null; serialNo: string | null };

/** A recording that has been chosen but not yet named, rated and added. */
type Pending = {
  fileName: string;
  name: string;
  rating: string;
  device: Device | null;
  phase: Phase | null;
};

const DEVICE_LABELS: Record<Device, string> = {
  BREAKER: "Circuit breaker",
  RCBO: "RCBO",
};

/** Named as they are called on site, in the order they are worked. */
const PHASES: Phase[] = ["RED", "WHITE", "BLUE", "NEUTRAL"];

const PHASE_LABELS: Record<Phase, string> = {
  RED: "Red phase",
  WHITE: "White phase",
  BLUE: "Blue phase",
  NEUTRAL: "Neutral",
};

export function AmpsDialog({
  reportId,
  siteName,
  onClose,
}: {
  reportId: string;
  siteName: string;
  onClose: () => void;
}) {
  const key = `amps:${reportId}`;
  const [report, setReport] = useState<Report | null>(null);
  const [namingContact, setNamingContact] = usePersisted<boolean>(`${key}:naming`, false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const chosen = useRef<File | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/amps/${reportId}`, { cache: "no-store" });
    if (!response.ok) return;
    setReport((await response.json()) as Report);
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetch("/api/test-equipment", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setInstruments)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (preview) {
        closePreview();
        return;
      }
      close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close() only clears the draft and calls the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, preview]);

  // A preview is a blob held in this tab; it is handed back when it is done
  // with, so a long session does not leave a pile of them behind.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function close() {
    clearSession(`${key}:naming`);
    onClose();
  }

  function closePreview() {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  /** Anything that lives on the report itself. */
  async function patch(body: Record<string, unknown>) {
    setReport((current) => (current ? ({ ...current, ...body } as Report) : current));
    await fetch(`/api/amps/${reportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  /** Anything that lives on one recording. */
  async function patchRecording(id: string, body: Record<string, unknown>) {
    setReport((current) =>
      current
        ? {
            ...current,
            recordings: current.recordings.map((item) =>
              item.id === id ? ({ ...item, ...body } as Recording) : item,
            ),
          }
        : current,
    );
    await fetch(`/api/amps/${reportId}/recordings/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  async function add() {
    const file = chosen.current;
    if (!file || !pending) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadFile(file);
      const response = await fetch(`/api/amps/${reportId}/recordings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileId: stored.id,
          name: pending.name,
          rating: pending.rating,
          device: pending.device,
          phase: pending.phase,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That recording could not be read.");
      }
      chosen.current = null;
      setPending(null);
      await load();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "That recording could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(recording: Recording) {
    if (!window.confirm(`Take "${recording.name}" out of this report?`)) return;
    await fetch(`/api/amps/${reportId}/recordings/${recording.id}`, { method: "DELETE" }).catch(
      () => {},
    );
    await load();
  }

  /** Moving a recording up or down the order the report reads them in. */
  async function move(index: number, by: number) {
    if (!report) return;
    const order = report.recordings.map((item) => item.id);
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    [order[index], order[to]] = [order[to], order[index]];

    const moved = order.map(
      (id) => report.recordings.find((item) => item.id === id) as Recording,
    );
    setReport({ ...report, recordings: moved });
    await patch({ recordingOrder: order });
  }

  /** The report, or the reason there is not one yet. */
  async function build(mode: "preview" | "download") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/amps/${reportId}/report${mode === "preview" ? "?preview=1" : ""}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That report could not be built.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (mode === "preview") {
        closePreview();
        setPreview(url);
        return;
      }

      const name = /filename="([^"]+)"/.exec(
        response.headers.get("content-disposition") ?? "",
      )?.[1];
      const link = document.createElement("a");
      link.href = url;
      link.download = name ?? "Amp Readings.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (buildError) {
      setError(
        buildError instanceof Error ? buildError.message : "That report could not be built.",
      );
    } finally {
      setBusy(false);
    }
  }

  const recordings = report?.recordings ?? [];
  const contacts = report?.site.contacts ?? [];
  const boards = report?.site.equipment ?? [];

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Amp readings">
      <button className="dialog-scrim" onClick={close} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Amp readings</h2>
            <p className="board-section-note">{siteName}</p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            {/* --- the recordings themselves ------------------------------ */}
            <div className="board-section-head">
              <h3 className="board-section-title">The recordings</h3>
              <p className="board-section-note">
                One file per circuit, each with a name of its own. The report gives every
                recording its own chart and its own figures, and never averages one circuit
                against another.
              </p>
            </div>

            {recordings.length > 0 ? (
              <ol className="amp-list">
                {recordings.map((recording, index) => (
                  <li className="amp-row" key={recording.id}>
                    <div className="amp-row-head">
                      <span className="amp-row-number">{index + 1}</span>
                      <input
                        className="dialog-input amp-row-name"
                        defaultValue={recording.name}
                        aria-label="What this recording is called"
                        onBlur={(event) => {
                          const name = event.target.value.trim();
                          if (!name || name === recording.name) {
                            event.target.value = recording.name;
                            return;
                          }
                          void patchRecording(recording.id, { name });
                        }}
                      />
                      <div className="amp-row-tools">
                        <button
                          type="button"
                          className="amp-move"
                          aria-label="Move up"
                          disabled={index === 0}
                          onClick={() => void move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="amp-move"
                          aria-label="Move down"
                          disabled={index === recordings.length - 1}
                          onClick={() => void move(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="amp-move is-remove"
                          aria-label="Remove this recording"
                          onClick={() => void remove(recording)}
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    <p className="amp-figures">{describe(recording)}</p>
                    {recording.summary?.notes?.length ? (
                      <p className="amp-warning">{recording.summary.notes[0]}</p>
                    ) : null}

                    <div className="amp-phase">
                      <span className="dialog-label">Which phase was it on?</span>
                      <div className="issue-picks is-row">
                        {PHASES.map((phase) => (
                          <button
                            key={phase}
                            type="button"
                            className={`issue-pick is-phase ${recording.phase === phase ? "is-on" : ""}`}
                            onClick={() =>
                              void patchRecording(recording.id, {
                                phase: recording.phase === phase ? null : phase,
                              })
                            }
                          >
                            <span className="issue-pick-mark is-one" aria-hidden />
                            <span className="issue-pick-body">
                              <span className="issue-pick-label">{PHASE_LABELS[phase]}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="amp-device">
                      <label className="dialog-field amp-rating">
                        <span className="dialog-label">Device rating (A)</span>
                        <input
                          className="dialog-input"
                          inputMode="decimal"
                          placeholder="e.g. 20"
                          defaultValue={recording.rating ?? ""}
                          onBlur={(event) =>
                            void patchRecording(recording.id, {
                              rating: event.target.value.trim() || null,
                            })
                          }
                        />
                      </label>
                      <div className="amp-kind">
                        <span className="dialog-label">What it protects the circuit with</span>
                        <div className="issue-picks is-tight">
                          {(Object.keys(DEVICE_LABELS) as Device[]).map((device) => (
                            <button
                              key={device}
                              type="button"
                              className={`issue-pick ${recording.device === device ? "is-on" : ""}`}
                              onClick={() =>
                                void patchRecording(recording.id, {
                                  device: recording.device === device ? null : device,
                                })
                              }
                            >
                              <span className="issue-pick-mark is-one" aria-hidden />
                              <span className="issue-pick-body">
                                <span className="issue-pick-label">{DEVICE_LABELS[device]}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="issue-empty">
                Nothing added yet. A report needs at least one recording.
              </p>
            )}

            <p className="amp-hint is-standalone">
              A device rating is the stated current rating in amps — the number on the front of
              the breaker or RCBO. Not its trip setting, and for an RCBO not the residual-current
              rating in mA, which is a different thing entirely. Leave it empty and the report
              gives that recording&rsquo;s measurements without drawing any conclusion about them.
            </p>

            {/* --- adding one --------------------------------------------- */}
            {pending ? (
              <div className="amp-new">
                <p className="amp-new-file">{pending.fileName}</p>
                <label className="dialog-field">
                  <span className="dialog-label">What is this recording of?</span>
                  <input
                    className="dialog-input"
                    autoFocus
                    placeholder="e.g. A-Phase PIT JACKS"
                    value={pending.name}
                    onChange={(event) =>
                      setPending({ ...pending, name: event.target.value })
                    }
                  />
                </label>
                <div className="amp-phase">
                  <span className="dialog-label">Which phase was it on?</span>
                  <div className="issue-picks is-row">
                    {PHASES.map((phase) => (
                      <button
                        key={phase}
                        type="button"
                        className={`issue-pick is-phase ${pending.phase === phase ? "is-on" : ""}`}
                        onClick={() =>
                          setPending({
                            ...pending,
                            phase: pending.phase === phase ? null : phase,
                          })
                        }
                      >
                        <span className="issue-pick-mark is-one" aria-hidden />
                        <span className="issue-pick-body">
                          <span className="issue-pick-label">{PHASE_LABELS[phase]}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="amp-device">
                  <label className="dialog-field amp-rating">
                    <span className="dialog-label">Device rating (A), if known</span>
                    <input
                      className="dialog-input"
                      inputMode="decimal"
                      placeholder="e.g. 20"
                      value={pending.rating}
                      onChange={(event) =>
                        setPending({ ...pending, rating: event.target.value })
                      }
                    />
                  </label>
                  <div className="amp-kind">
                    <span className="dialog-label">What it protects the circuit with</span>
                    <div className="issue-picks is-tight">
                      {(Object.keys(DEVICE_LABELS) as Device[]).map((device) => (
                        <button
                          key={device}
                          type="button"
                          className={`issue-pick ${pending.device === device ? "is-on" : ""}`}
                          onClick={() =>
                            setPending({
                              ...pending,
                              device: pending.device === device ? null : device,
                            })
                          }
                        >
                          <span className="issue-pick-mark is-one" aria-hidden />
                          <span className="issue-pick-body">
                            <span className="issue-pick-label">{DEVICE_LABELS[device]}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="dialog-cancel"
                    onClick={() => {
                      chosen.current = null;
                      setPending(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={busy || !pending.name.trim()}
                    onClick={() => void add()}
                  >
                    {busy ? "Reading…" : "Add this recording"}
                  </button>
                </div>
              </div>
            ) : (
              <label className="rcd-drop">
                {busy ? "Reading…" : "Add a recording"}
                <input
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    chosen.current = file;
                    setError(null);
                    setPending({
                      fileName: file.name,
                      name: stem(file.name),
                      rating: "",
                      device: null,
                      phase: null,
                    });
                  }}
                />
              </label>
            )}

            {/* --- the report's own details -------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">What were they taken for?</h3>
              <p className="board-section-note">
                A line or two, printed at the front of the report.
              </p>
            </div>
            <label className="dialog-field">
              <span className="dialog-label">The reason</span>
              <textarea
                className="dialog-input"
                rows={2}
                placeholder="e.g. Taken while the pit jacks were cycled, to see what each phase draws in service."
                defaultValue={report?.purpose ?? ""}
                onBlur={(event) => void patch({ purpose: event.target.value || null })}
              />
            </label>

            <div className="board-section-head">
              <h3 className="board-section-title">Who recorded them?</h3>
              <p className="board-section-note">
                Their name, credentials and signature go on the report.
              </p>
            </div>
            <PreparedByPicks
              chosen={report?.preparedBy ?? []}
              onChange={(next) => void patch({ preparedBy: next })}
            />

            <div className="board-section-head">
              <h3 className="board-section-title">Who asked for them?</h3>
            </div>
            <div className="issue-picks">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className={`issue-pick ${report?.contactId === contact.id ? "is-on" : ""}`}
                  onClick={() => {
                    setNamingContact(false);
                    const off = report?.contactId === contact.id;
                    void patch({
                      contactId: off ? null : contact.id,
                      contactName: off ? null : contact.name,
                    });
                  }}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{personName(contact.name)}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className={`issue-pick ${namingContact ? "is-on" : ""}`}
                onClick={() => {
                  setNamingContact(true);
                  void patch({ contactId: null, contactName: null });
                }}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">Someone else</span>
                </span>
              </button>
            </div>
            {namingContact ? (
              <label className="dialog-field">
                <span className="dialog-label">Their name</span>
                <input
                  className="dialog-input"
                  autoFocus
                  placeholder="e.g. Dave Mitchell, site manager"
                  defaultValue={report?.contactName ?? ""}
                  onBlur={(event) =>
                    void patch({ contactId: null, contactName: event.target.value || null })
                  }
                />
              </label>
            ) : null}

            <div className="board-section-head">
              <h3 className="board-section-title">What were they taken with?</h3>
              <p className="board-section-note">
                {instruments.length > 0
                  ? "The instrument is named on the report."
                  : "Nothing is on file yet. Add it under Equipment and it will appear here."}
              </p>
            </div>
            {instruments.length > 0 ? (
              <label className="dialog-field">
                <span className="dialog-label">Equipment used</span>
                <select
                  className="dialog-select"
                  value={report?.instrumentId ?? ""}
                  onChange={(event) => void patch({ instrumentId: event.target.value || null })}
                >
                  <option value="">Not recorded</option>
                  {instruments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {[item.name, item.modelNo, item.serialNo ? `S/N ${item.serialNo}` : null]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="board-section-head">
              <h3 className="board-section-title">Where were they taken?</h3>
              <p className="board-section-note">
                {boards.length > 0
                  ? "The board the circuits come off, where it has been drawn at this site."
                  : "No switchboards have been drawn at this site yet, so say where in your own words."}
              </p>
            </div>
            {boards.length > 0 ? (
              <div className="issue-picks">
                {boards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    className={`issue-pick ${report?.equipmentId === board.id ? "is-on" : ""}`}
                    onClick={() => {
                      const off = report?.equipmentId === board.id;
                      void patch({ equipmentId: off ? null : board.id });
                    }}
                  >
                    <span className="issue-pick-mark is-one" aria-hidden />
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">{board.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <label className="dialog-field">
              <span className="dialog-label">Where on site</span>
              <input
                className="dialog-input"
                placeholder="e.g. Pit jacks distribution board, workshop"
                defaultValue={report?.location ?? ""}
                onBlur={(event) => void patch({ location: event.target.value || null })}
              />
            </label>
          </div>
        </div>

        <footer className="board-foot">
          {error ? <p className="dialog-error">{error}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={close}>
              Close
            </button>
            <button
              type="button"
              className="dialog-cancel"
              disabled={recordings.length === 0 || busy}
              onClick={() => void build("preview")}
            >
              {busy ? "Working…" : "Preview"}
            </button>
            <button
              type="button"
              className="dialog-confirm"
              disabled={recordings.length === 0 || busy}
              onClick={() => void build("download")}
            >
              {busy ? "Working…" : "Download the report"}
            </button>
          </div>
        </footer>
      </div>

      {preview ? (
        <div className="amp-preview" role="dialog" aria-modal aria-label="Report preview">
          <div className="amp-preview-bar">
            <strong>Report preview</strong>
            <div className="dialog-actions">
              <button type="button" className="dialog-cancel" onClick={closePreview}>
                Close
              </button>
              {/* Some phone browsers will not draw a PDF inside a frame, so
                  there is always a way to open it on its own. */}
              <a className="dialog-cancel" href={preview} target="_blank" rel="noreferrer">
                Open in a new tab
              </a>
              <button
                type="button"
                className="dialog-confirm"
                onClick={() => void build("download")}
              >
                Download
              </button>
            </div>
          </div>
          <iframe className="amp-preview-page" src={preview} title="Report preview" />
        </div>
      ) : null}
    </div>
  );
}

/** "40 readings · 08:23:32–08:24:11 · highest 58 A · average 26.66 A" */
function describe(recording: Recording): string {
  const summary = recording.summary;
  if (!summary) return recording.file?.originalName ?? "Not read yet";
  return [
    `${summary.count.toLocaleString("en-AU")} readings`,
    `${clock(summary.from)}–${clock(summary.to)}`,
    `highest ${trim(summary.max)} A`,
    `average ${summary.average.toFixed(2)} A`,
    summary.intervalSeconds > 0 ? `every ${summary.intervalSeconds} s` : "interval varied",
  ].join("  ·  ");
}

/** "08:23:32" — the clock, which is all a recording of a minute needs. */
function clock(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** The file's name without its extension, as a first go at a name. */
function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "").slice(0, 120);
}
