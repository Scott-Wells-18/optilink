"use client";

import { useCallback, useEffect, useState } from "react";
import { CHANNEL_LABELS, SERIES, type Channel, type Summary } from "@/lib/power/channels";
import { BRIEFS, BRIEF_LABELS, BRIEF_NOTES, type Brief } from "@/lib/power/brief";
import { SupplyFields } from "@/components/SupplyFields";
import { EMPTY_SUPPLY, normaliseSupply, type Supply } from "@/lib/supply";
import { uploadFile } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Loading a logger's recording onto an analysis.
 *
 * The recording itself answers most of it — when it started, how long it ran,
 * how often it sampled and what each channel peaked at are all in the file, so
 * they are read out rather than asked for, and shown straight back so a file
 * that read wrongly is obvious before anything is sent to a client.
 *
 * What the file cannot say is why the logger went on, which board it went on,
 * and what feeds that board. Those three are what turn a set of currents into
 * an answer, so they are asked here — and the supply is written back onto the
 * board itself, where the next recording will already know it.
 */

type BoardRecord = { id: string; name: string; supply: unknown };

type Run = {
  id: string;
  location: string | null;
  equipmentId: string | null;
  brief: string | null;
  contactName: string | null;
  sourceFile: { id: string; originalName: string } | null;
  summary: Summary | null;
  site: {
    name: string;
    location: string | null;
    equipment: BoardRecord[];
    contacts: { name: string }[];
  };
};

export function PowerDialog({
  runId,
  siteName,
  onClose,
}: {
  runId: string;
  siteName: string;
  onClose: () => void;
}) {
  const key = `power:${runId}`;
  const [run, setRun] = useState<Run | null>(null);
  const [namingContact, setNamingContact] = usePersisted<boolean>(`${key}:naming`, false);
  const [supply, setSupply] = useState<Supply>(EMPTY_SUPPLY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/power/${runId}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as Run;
    setRun(data);
    const board = data.site.equipment.find((item) => item.id === data.equipmentId);
    setSupply(normaliseSupply(board?.supply));
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close() only clears the draft and calls the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  function close() {
    clearSession(`${key}:naming`);
    onClose();
  }

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadFile(file);
      const response = await fetch(`/api/power/${runId}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: stored.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That recording could not be read.");
      }
      await load();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "That recording could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Anything that lives on the analysis itself. */
  async function patch(body: Record<string, unknown>) {
    setRun((current) => (current ? ({ ...current, ...body } as Run) : current));
    await fetch(`/api/power/${runId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  /**
   * Picking the board also picks up whatever is already recorded against it,
   * so the supply panel below fills in rather than having to be typed again.
   */
  async function chooseBoard(board: BoardRecord) {
    const next = run?.equipmentId === board.id ? null : board;
    setSupply(normaliseSupply(next?.supply));
    await patch({ equipmentId: next?.id ?? null, location: next?.name ?? null });
  }

  /**
   * The report, or the reason there is not one yet.
   *
   * Fetched rather than linked, because a board with half its details filled
   * in has no report to give and the server says which half. A plain link
   * would download that answer as a file nobody opens.
   */
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/power/${runId}/report`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That report could not be built.");
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(
        response.headers.get("content-disposition") ?? "",
      )?.[1];

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name ?? "Power Analysis.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "That report could not be built.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** The supply belongs to the board, not to this recording. */
  async function saveSupply(next: Supply) {
    setSupply(next);
    if (!run?.equipmentId) return;
    await fetch(`/api/equipment/${run.equipmentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supply: next }),
    }).catch(() => {});
  }

  const summary = run?.summary ?? null;
  const days = summary ? Math.max(1, Math.round((summary.to - summary.from) / 86_400_000)) : 0;
  const boards = run?.site.equipment ?? [];
  const contacts = run?.site.contacts ?? [];
  const brief = (run?.brief ?? null) as Brief | null;
  const channelCount = summary ? Object.keys(summary.peaks).length : 0;
  const weekCount = Math.max(1, Math.ceil(days / 7));

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Power analysis">
      <button className="dialog-scrim" onClick={close} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Power analysis</h2>
            <p className="board-section-note">{siteName}</p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            <div className="board-section-head">
              <h3 className="board-section-title">What was it recorded for?</h3>
              <p className="board-section-note">
                This is the objective printed at the front of the report.
              </p>
            </div>
            <div className="issue-picks">
              {BRIEFS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`issue-pick ${brief === option ? "is-on" : ""}`}
                  onClick={() => void patch({ brief: brief === option ? null : option })}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{BRIEF_LABELS[option]}</span>
                    <span className="issue-pick-note">{BRIEF_NOTES[option]}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="board-section-head">
              <h3 className="board-section-title">Who asked for it?</h3>
            </div>
            <div className="issue-picks">
              {contacts.map((contact) => (
                <button
                  key={contact.name}
                  type="button"
                  className={`issue-pick ${
                    run?.contactName === contact.name ? "is-on" : ""
                  }`}
                  onClick={() => {
                    setNamingContact(false);
                    void patch({
                      contactName:
                        run?.contactName === contact.name ? null : contact.name,
                    });
                  }}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{contact.name}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className={`issue-pick ${namingContact ? "is-on" : ""}`}
                onClick={() => {
                  setNamingContact(true);
                  void patch({ contactName: null });
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
                  defaultValue={run?.contactName ?? ""}
                  onBlur={(event) => void patch({ contactName: event.target.value || null })}
                />
              </label>
            ) : null}

            <div className="board-section-head">
              <h3 className="board-section-title">Which board was it on?</h3>
              <p className="board-section-note">
                {boards.length > 0
                  ? "Picking the board brings its supply details with it, and writes anything you change back onto the board."
                  : "No switchboards have been drawn at this site yet. Say where the logger went instead."}
              </p>
            </div>
            {boards.length > 0 ? (
              <div className="issue-picks">
                {boards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    className={`issue-pick ${run?.equipmentId === board.id ? "is-on" : ""}`}
                    onClick={() => void chooseBoard(board)}
                  >
                    <span className="issue-pick-mark is-one" aria-hidden />
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">{board.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {run?.equipmentId ? (
              <SupplyFields
                supply={supply}
                siblings={boards.filter((board) => board.id !== run.equipmentId)}
                onChange={(next) => void saveSupply(next)}
              />
            ) : (
              <p className="issue-empty">
                {boards.length > 0
                  ? "Pick the board above. A report is read against the board's own supply, so it cannot be issued without one."
                  : "Draw this site's switchboard under Clients first. A power analysis is read against the board's supply, so it needs a board to read against."}
              </p>
            )}

            <div className="board-section-head">
              <h3 className="board-section-title">The logger&rsquo;s recording</h3>
              <p className="board-section-note">
                The CSV or spreadsheet off the logger: a column of timestamps and a column
                of maximum current for each phase and the neutral.
              </p>
            </div>
            <label className="rcd-drop">
              {busy
                ? "Reading…"
                : run?.sourceFile
                  ? "Replace the recording"
                  : "Choose the file"}
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(event) => {
                  void upload(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            {summary ? (
              <>
                <dl className="rcd-facts">
                  <div>
                    <dt>Started</dt>
                    <dd>{stamp(summary.from)}</dd>
                  </div>
                  <div>
                    <dt>Ran for</dt>
                    <dd>
                      {days} {days === 1 ? "day" : "days"}
                    </dd>
                  </div>
                  <div>
                    <dt>Every</dt>
                    <dd>{summary.intervalMinutes || "—"} min</dd>
                  </div>
                  <div>
                    <dt>Readings</dt>
                    <dd>{summary.count.toLocaleString("en-AU")}</dd>
                  </div>
                  <div>
                    <dt>Pages</dt>
                    {/* Cover, the explainer, the brief, a combined chart per
                        week, then each conductor a week to a page. */}
                    <dd>{3 + weekCount + weekCount * channelCount}</dd>
                  </div>
                </dl>

                <div className="board-section-head">
                  <h3 className="board-section-title">Highest on each conductor</h3>
                </div>
                <div className="power-peaks">
                  {(Object.keys(summary.peaks) as Channel[]).map((channel) => {
                    const peak = summary.peaks[channel];
                    if (!peak) return null;
                    return (
                      <div className="power-peak" key={channel}>
                        <span
                          className="power-peak-mark"
                          style={{ background: SERIES[channel] }}
                          aria-hidden
                        />
                        <strong>{CHANNEL_LABELS[channel]}</strong>
                        <b>{peak.amps} A</b>
                        <em>{stamp(peak.at)}</em>
                      </div>
                    );
                  })}
                </div>

                {summary.skipped > 0 ? (
                  <p className="issue-empty">
                    {summary.skipped} rows carried no readable timestamp and were left out.
                    The report says so too.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="issue-empty">
                Nothing loaded yet. The report needs a recording before it can be drawn.
              </p>
            )}
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
              className="dialog-confirm"
              disabled={!summary || busy}
              onClick={() => void download()}
            >
              {busy ? "Working…" : "Download the report"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** "07/09 11:55" — the way it is read off a logger. */
function stamp(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}`;
}
