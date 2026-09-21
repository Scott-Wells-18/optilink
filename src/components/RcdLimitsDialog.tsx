"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The limits an RCD is judged against, opened from the RCD section.
 *
 * They are coded from AS/NZS 3017 Table 6.1 and that citation is printed
 * beside them, because the whole reason this screen exists is that a standard
 * gets revised: the numbers have to be able to be corrected against the
 * edition on the shelf, by the person holding it, without waiting on a deploy.
 * What they shipped as is always one button away.
 */

type Limits = {
  kindLabel: string;
  description: string;
  maxAtRatedMs: number;
  maxAt5xMs: number | null;
  minAtRatedMs: number | null;
};

type Held = {
  limits: Record<string, Limits>;
  concernPercent: number;
  defaults: Record<string, Limits>;
  source: string;
};

export function RcdLimitsDialog({ onClose }: { onClose: () => void }) {
  const [held, setHeld] = useState<Held | null>(null);
  const [limits, setLimits] = useState<Record<string, Limits>>({});
  const [percent, setPercent] = useState("80");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/rcd-settings", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Held;
      setHeld(data);
      setLimits(data.limits);
      setPercent(String(data.concernPercent));
    } catch {
      setError("Those limits could not be loaded.");
    }
  }, []);

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

  function set(key: string, field: keyof Limits, value: string) {
    setSaved(false);
    setLimits((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value === "" ? null : Number(value),
      },
    }));
  }

  async function save(reset = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rcd-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : { limits, concernPercent: Number(percent) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Those limits could not be saved.");
      }
      await load();
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const keys = Object.keys(limits);
  const changed =
    held !== null &&
    (String(held.concernPercent) !== percent ||
      keys.some((key) => !same(limits[key], held.defaults[key])));

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="RCD limits">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">What a device is judged against</h2>
            <p className="board-section-note">
              {held?.source ?? "AS/NZS 3017 Table 6.1 — maximum disconnection times."}
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            <div className="board-section-head">
              <h3 className="board-section-title">Maximum trip times</h3>
              <p className="board-section-note">
                In milliseconds, at the rated residual current and at five times it.
                Only a selective device has a minimum — leave the others empty. Check
                them against your own copy of the standard before issuing anything.
              </p>
            </div>

            <div className="rcd-limits">
              <div className="rcd-limit-head">
                <span>Device</span>
                <span>Max at I∆n</span>
                <span>Max at 5 × I∆n</span>
                <span>Min at I∆n</span>
              </div>
              {keys.map((key) => {
                const row = limits[key];
                return (
                  <div className="rcd-limit" key={key}>
                    <span className="rcd-limit-name">
                      <strong>{row.kindLabel}</strong>
                      <em>{row.description}</em>
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={row.maxAtRatedMs ?? ""}
                      onChange={(event) => set(key, "maxAtRatedMs", event.target.value)}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      value={row.maxAt5xMs ?? ""}
                      onChange={(event) => set(key, "maxAt5xMs", event.target.value)}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      value={row.minAtRatedMs ?? ""}
                      onChange={(event) => set(key, "minAtRatedMs", event.target.value)}
                    />
                  </div>
                );
              })}
            </div>

            <div className="board-section-head">
              <h3 className="board-section-title">When a pass is a concern</h3>
              <p className="board-section-note">
                A device that passes but sits at or above this share of its limit is
                raised as a concern. Operating times drift upward as a device ages, so
                the ones close to the line are the ones that fail next time.
              </p>
            </div>
            <label className="issue-temp">
              <span>Concern at</span>
              <input
                type="number"
                inputMode="numeric"
                min={10}
                max={100}
                value={percent}
                onChange={(event) => {
                  setSaved(false);
                  setPercent(event.target.value);
                }}
              />
            </label>
            <p className="issue-empty">
              {Number(percent) >= 10 && Number(percent) <= 100
                ? `A 30 mA device allowed 300 ms is a concern from ${Math.round(
                    (Number(percent) / 100) * 300,
                  )} ms.`
                : "Between 10% and 100%."}
            </p>

            {error ? <p className="dialog-error">{error}</p> : null}
            {saved && !error ? <p className="issue-empty">Saved.</p> : null}

            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-cancel"
                disabled={busy || !changed}
                onClick={() => void save(true)}
              >
                Back to AS/NZS 3017
              </button>
              <button
                type="button"
                className="dialog-confirm"
                disabled={busy || held === null}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>

        <footer className="board-foot">
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function same(a: Limits | undefined, b: Limits | undefined): boolean {
  if (!a || !b) return true;
  return (
    a.maxAtRatedMs === b.maxAtRatedMs &&
    a.maxAt5xMs === b.maxAt5xMs &&
    a.minAtRatedMs === b.minAtRatedMs
  );
}
