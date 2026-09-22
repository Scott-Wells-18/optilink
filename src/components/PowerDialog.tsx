"use client";

import { useCallback, useEffect, useState } from "react";
import { CHANNEL_LABELS, SERIES, type Channel, type Summary } from "@/lib/power/channels";
import { uploadFile } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Loading a logger's recording onto an analysis.
 *
 * One upload and one question. Everything else the report needs — when the
 * recording started, how long it ran, how often it sampled and what each
 * channel peaked at — is in the file, so it is read out rather than asked for,
 * and shown straight back so a file that read wrongly is obvious before
 * anything is sent to a client.
 */

type Run = {
  id: string;
  location: string | null;
  sourceFile: { id: string; originalName: string } | null;
  summary: Summary | null;
};

const WHERE = [
  "Main switchboard",
  "Distribution board",
  "Submain",
  "Incoming supply",
];

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
  const [where, setWhere] = usePersisted<string>(`${key}:where`, "");
  const [typing, setTyping] = usePersisted<boolean>(`${key}:typing`, false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/power/${runId}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as Run;
    setRun(data);
    setWhere((current) => current || data.location || "");
  }, [runId, setWhere]);

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
    clearSession(`${key}:where`);
    clearSession(`${key}:typing`);
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
        body: JSON.stringify({ fileId: stored.id, location: where || undefined }),
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

  async function saveWhere(value: string) {
    setWhere(value);
    setTyping(false);
    await fetch(`/api/power/${runId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: value }),
    }).catch(() => {});
  }

  const summary = run?.summary ?? null;
  const days = summary ? Math.max(1, Math.round((summary.to - summary.from) / 86_400_000)) : 0;

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
              <h3 className="board-section-title">Where was the logger fitted?</h3>
            </div>
            <div className="issue-picks">
              {WHERE.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`issue-pick ${where === option ? "is-on" : ""}`}
                  onClick={() => void saveWhere(option)}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{option}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className={`issue-pick ${typing ? "is-on" : ""}`}
                onClick={() => {
                  setTyping(true);
                  setWhere("");
                }}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">Somewhere else</span>
                </span>
              </button>
            </div>
            {typing ? (
              <label className="dialog-field">
                <span className="dialog-label">Where</span>
                <input
                  className="dialog-input"
                  autoFocus
                  placeholder="e.g. DB-Workshop, submain to the crib room"
                  value={where}
                  onChange={(event) => setWhere(event.target.value)}
                  onBlur={(event) => void saveWhere(event.target.value)}
                />
              </label>
            ) : null}

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

            {error ? <p className="dialog-error">{error}</p> : null}

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
                    <dd>{Math.max(1, Math.ceil(days / 7))}</dd>
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
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={close}>
              Close
            </button>
            <button
              type="button"
              className="dialog-confirm"
              disabled={!summary}
              onClick={() => {
                const link = document.createElement("a");
                link.href = `/api/power/${runId}/report`;
                link.rel = "noopener";
                link.download = "";
                document.body.append(link);
                link.click();
                link.remove();
              }}
            >
              Download the report
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
