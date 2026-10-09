"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/components/ImageUpload";
import { DialogScrim } from "@/components/DialogScrim";

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

  /**
   * Point the settings at a file, or at nothing.
   *
   * On a failure the saved reference is reloaded rather than cleared: what was
   * saved a moment ago is still what the next report should be made from, and
   * showing an empty panel after a failed upload is how somebody ends up
   * uploading the file twice.
   */
  async function save(fileId: string | null, failure: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tagging/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? failure);
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : failure);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function replace(file: File) {
    setBusy(true);
    setError(null);
    let stored: { id: string };
    try {
      stored = await uploadFile(file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "That upload failed.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await save(stored.id, "That spreadsheet could not be saved.");
  }

  const held = settings?.file;

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Equipment tagging settings">
      <DialogScrim />

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
                      ? `last updated ${new Date(settings.uploadedAt).toLocaleDateString("en-AU", {
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
                No reference file yet. Add the export from the tagging software — the one
                with the &ldquo;Test &amp; Tag Register&rdquo; sheet in it, as a spreadsheet
                or as CSV.
              </p>
            )}
          </div>

          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void replace(file);
            }}
          />

          <div className="tagging-actions">
            <button
              type="button"
              className="issue-add"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? "Reading…" : held ? "Replace the file" : "Add the file"}
            </button>
            {held ? (
              <button
                type="button"
                className="tagging-remove"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Remove ${held.originalName}? Reports already generated keep their own rows.`)) return;
                  void save(null, "That reference could not be removed.");
                }}
              >
                Delete
              </button>
            ) : null}
          </div>

          <p className="amp-hint is-standalone">
            This stays saved until it is replaced or deleted here. Replacing it changes what
            the next report is made from and nothing else. Every report already generated
            keeps its own copy of the rows it was made from, so an earlier register still
            says exactly what it said.
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
