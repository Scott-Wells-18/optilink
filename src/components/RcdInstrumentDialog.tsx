"use client";

import { useEffect, useState } from "react";

/**
 * Which instrument a visit's boards were tested with.
 *
 * Asked once per report rather than once per board, because a tester carries
 * one meter around a depot. Its calibration certificate is bound into the back
 * of the report, so the readings can be read against the thing that took them.
 */

type Instrument = {
  id: string;
  name: string;
  modelNo: string | null;
  serialNo: string | null;
};

export function RcdInstrumentDialog({
  reportId,
  instrumentId,
  onClose,
}: {
  reportId: string;
  instrumentId: string | null;
  onClose: () => void;
}) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [chosen, setChosen] = useState<string>(instrumentId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/test-equipment", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setInstruments)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(value: string) {
    setChosen(value);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rcd-reports/${reportId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instrumentId: value || null }),
      });
      if (!response.ok) throw new Error("That could not be saved.");
    } catch {
      setError("That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Instrument used">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Instrument used</h2>
            <p className="board-section-note">
              One meter for the visit. Its calibration certificate goes into the back of
              the report.
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            {instruments.length > 0 ? (
              <label className="dialog-field">
                <span className="dialog-label">Equipment used</span>
                <select
                  className="dialog-select"
                  value={chosen}
                  disabled={busy}
                  onChange={(event) => void save(event.target.value)}
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
            ) : (
              <p className="issue-empty">
                Nothing is on file yet. Add it under Equipment and it will appear here.
              </p>
            )}

            {error ? <p className="dialog-error">{error}</p> : null}
          </div>
        </div>

        <footer className="board-foot">
          <div className="dialog-actions">
            <button type="button" className="dialog-confirm" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
