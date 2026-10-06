"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/components/ImageUpload";
import { PHASE_LABELS, type Phases } from "@/lib/install/points";

/**
 * Starting an installation test from the tester's export.
 *
 * Two things are asked before the file: whether the installation is
 * single-phase or three-phase, because that decides how many insulation and
 * RCD records the scope expects and therefore what counts as a surplus worth
 * looking at.
 *
 * The file is read on the way in, so one that cannot be read is refused here
 * rather than at the bottom of a report that will not build.
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
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function start(file: File) {
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadFile(file);
      const response = await fetch("/api/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, fileId: stored.id, phases }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That export could not be read.");
      }
      const made = await response.json();
      onStarted(made.id);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "That upload failed.");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="New installation test">
      <button className="dialog-scrim" onClick={onCancel} aria-label="Close" tabIndex={-1} />

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
                        ? "One insulation test and one RCD sequence"
                        : "One insulation test and three RCD sequences"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="issue-empty">
            Upload the tester&rsquo;s own PDF export. It is read now, the records are kept with the
            report, and the file itself is bound into the back of it.
          </p>

          <input
            ref={picker}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void start(file);
            }}
          />

          <button
            type="button"
            className="issue-add"
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            {busy ? "Reading…" : "Choose the export"}
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
