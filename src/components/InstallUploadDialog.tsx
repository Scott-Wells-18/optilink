"use client";

import { useEffect, useState } from "react";
import { PHASE_LABELS, type Phases } from "@/lib/install/points";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * Starting an installation test.
 *
 * Only the supply is asked here, because it sets the starting test
 * arrangement for every section: one phase block, or three. The tester files
 * are then added in the report itself, each into its own labelled section —
 * insulation, RCD, polarity / voltage — as many to a section as the tester
 * produced.
 */
export function InstallUploadDialog({
  siteId,
  siteName,
  onCancel,
  onStarted,
}: {
  siteId: string;
  siteName: string;
  onCancel: () => void;
  onStarted: (id: string) => void;
}) {
  const [phases, setPhases] = useState<Phases>("SINGLE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, phases }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That report could not be started.");
      }
      const made = await response.json();
      onStarted(made.id);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "That report could not be started.");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="New installation test">
      <DialogScrim />

      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">New installation test</h2>
          <p className="board-section-note">{siteName}</p>
        </div>

        <div className="dialog-fields">
          <div className="dialog-field">
            <span className="dialog-label">Is this installation single-phase or three-phase?</span>
            <div className="issue-picks is-row">
              {(["SINGLE", "THREE"] as Phases[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`issue-pick ${phases === option ? "is-on" : ""}`}
                  onClick={() => setPhases(option)}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{PHASE_LABELS[option]}</span>
                    <span className="issue-pick-note">
                      {option === "SINGLE"
                        ? "One phase block: A–N and A–PE insulation, L–PE / L–N / N–PE per outlet, one RCD sequence"
                        : "Three phase blocks: six insulation readings, nine voltage readings per group, three RCD sequences"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="issue-empty">
            The tester files are added next, each into its own section: Insulation Resistance, RCD
            Testing, and Polarity / Voltage Measurements. A section can take several files where the
            tester&rsquo;s connection dropped and the numbering restarted.
          </p>

          <button type="button" className="issue-add" disabled={busy} onClick={() => void start()}>
            {busy ? "Starting…" : "Start the report"}
          </button>
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
