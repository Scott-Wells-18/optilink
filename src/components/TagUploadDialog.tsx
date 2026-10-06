"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "@/components/ImageUpload";

/**
 * Starting a client's test & tag report.
 *
 * A spreadsheet per report and nothing saved between them: this is whatever
 * came off the tagging software for that client, on that visit. It is read as
 * soon as it is chosen, so a file that cannot be read is refused here rather
 * than at the bottom of a report that will not build.
 */
export function TagUploadDialog({
  siteId,
  siteName,
  onCancel,
  onStarted,
}: {
  siteId: string;
  siteName: string;
  onCancel: () => void;
  onStarted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
      const response = await fetch("/api/tag-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "CLIENT", siteId, fileId: stored.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That spreadsheet could not be read.");
      }
      onStarted();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "That upload failed.");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="New test and tag report">
      <button className="dialog-scrim" onClick={onCancel} aria-label="Close" tabIndex={-1} />

      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">New Test &amp; Tag report</h2>
          <p className="board-section-note">{siteName}</p>
        </div>

        <div className="dialog-fields">
          <p className="issue-empty">
            Upload the export from the tagging software for this visit. The equipment on it is
            read now and kept with the report, so the report never changes afterwards.
          </p>

          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            onClick={() => input.current?.click()}
          >
            {busy ? "Reading…" : "Choose the spreadsheet"}
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
