"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/components/ImageUpload";

/**
 * The reference spreadsheet behind our own equipment register.
 *
 * One file, kept and replaced rather than uploaded afresh for every report.
 * It is the export the tagging software writes, and it is read the moment it
 * is chosen so that a file which cannot be read is refused while the person
 * who chose it is still looking at it.
 *
 * Replacing it changes what the next report is made from and nothing else.
 * Every report already generated holds its own copy of the rows it was made
 * from, so last month's register still says what it said last month — which
 * is said here, because it is the thing somebody replacing the file would
 * otherwise worry about.
 */

type Settings = {
  fileId: string | null;
  uploadedAt: string | null;
  file: { id: string; originalName: string; sizeBytes: number } | null;
  summary: { items: number; customers: string[]; notes: string[] } | null;
};

export function TaggingSettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch("/api/tagging/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setSettings)
      .catch(() => setError("The settings could not be loaded."));

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function replace(file: File) {
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadFile(file);
      const response = await fetch("/api/tagging/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: stored.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That spreadsheet could not be saved.");
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const held = settings?.file;

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Equipment tagging settings">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">Equipment tagging settings</h2>
          <p className="board-section-note">
            The spreadsheet our own register is made from.
          </p>
        </div>

        <div className="dialog-fields">
          <div className="tagging-reference">
            {held ? (
              <>
                <p className="tagging-file">{held.originalName}</p>
                <p className="amp-figures">
                  {[
                    settings?.summary ? `${settings.summary.items} items` : null,
                    settings?.uploadedAt
                      ? `added ${new Date(settings.uploadedAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}`
                      : null,
                    `${Math.max(1, Math.round(held.sizeBytes / 1024))} KB`,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
                {settings?.summary?.customers.length ? (
                  <p className="amp-figures">{settings.summary.customers.join("  ·  ")}</p>
                ) : null}
                {settings?.summary?.notes.map((note) => (
                  <p className="amp-warning" key={note}>
                    {note}
                  </p>
                ))}
              </>
            ) : (
              <p className="issue-empty">
                No reference spreadsheet yet. Add the export from the tagging software — the
                one with the &ldquo;Test &amp; Tag Register&rdquo; sheet in it.
              </p>
            )}
          </div>

          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void replace(file);
            }}
          />

          <button
            type="button"
            className="issue-add"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "Reading…" : held ? "Replace the spreadsheet" : "Add the spreadsheet"}
          </button>

          <p className="amp-hint is-standalone">
            Replacing this changes what the next report is made from and nothing else. Every
            report already generated keeps its own copy of the rows it was made from, so an
            earlier register still says exactly what it said.
          </p>
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-confirm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
