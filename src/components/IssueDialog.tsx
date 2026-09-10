"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ISSUE_LABELS,
  ISSUE_NOTES,
  ISSUE_TYPES,
  photoSlotsFor,
  type IssueType,
  type PhotoKind,
} from "@/lib/issues";
import { uploadImage } from "@/components/ImageUpload";

/**
 * Reporting what was found at one position: pick what it is, then photograph
 * it. Dust ingress wants one photo; everything else wants the thermal image
 * and a plain one of the same thing, so the report can pair them.
 */

type Pending = { fileId: string; name: string };

export function IssueDialog({
  inspectionId,
  equipmentId,
  slot,
  where,
  kind,
  onCancel,
  onSaved,
}: {
  inspectionId: string;
  equipmentId: string;
  slot: string;
  /** What it is against, e.g. "3 · Lighting 1". */
  where: string;
  /** Breaker, RCD, contactor — or absent for a motor. */
  kind?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<IssueType | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<PhotoKind, Pending[]>>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<PhotoKind | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const slots = type ? photoSlotsFor(type) : [];
  const ready =
    type !== null && slots.every((entry) => (photos[entry.kind]?.length ?? 0) > 0);

  async function add(kindWanted: PhotoKind, files: FileList | null) {
    if (!files?.length) return;
    setBusy(kindWanted);
    setError(null);
    try {
      const added: Pending[] = [];
      for (const file of Array.from(files)) {
        const image = await uploadImage(file);
        added.push({ fileId: image.id, name: file.name });
      }
      setPhotos((current) => ({
        ...current,
        [kindWanted]: [...(current[kindWanted] ?? []), ...added],
      }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  function drop(kindWanted: PhotoKind, fileId: string) {
    setPhotos((current) => ({
      ...current,
      [kindWanted]: (current[kindWanted] ?? []).filter(
        (photo) => photo.fileId !== fileId,
      ),
    }));
  }

  async function save() {
    if (!ready || !type) return;
    setBusy("save");
    setError(null);
    try {
      const body = {
        inspectionId,
        equipmentId,
        slot,
        type,
        note: note.trim() || undefined,
        photos: slots.flatMap((entry) =>
          (photos[entry.kind] ?? []).map((photo) => ({
            kind: entry.kind,
            fileId: photo.fileId,
          })),
        ),
      };
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That finding could not be saved.");
      }
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
      setBusy(null);
    }
  }

  return (
    <div className="dialog-layer is-stacked" role="dialog" aria-modal aria-label="Report issue">
      <button className="dialog-scrim" onClick={onCancel} aria-label="Close" tabIndex={-1} />

      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">Report issue</h2>
          <p className="board-section-note">
            {where}
            {kind ? <span className="issue-kind">{kind}</span> : null}
          </p>
        </div>

        {type === null ? (
          <div className="issue-types">
            {ISSUE_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                className={`issue-type is-${option.toLowerCase()}`}
                onClick={() => setType(option)}
              >
                <span className="issue-type-label">{ISSUE_LABELS[option]}</span>
                <span className="issue-type-note">{ISSUE_NOTES[option]}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="issue-chosen">
              <span className={`issue-chip is-${type.toLowerCase()}`}>
                {ISSUE_LABELS[type]}
              </span>
              <button
                type="button"
                className="issue-change"
                onClick={() => {
                  setType(null);
                  setPhotos({});
                }}
              >
                Change
              </button>
            </div>

            <div className="issue-slots">
              {slots.map((entry) => {
                const held = photos[entry.kind] ?? [];
                return (
                  <section className="issue-slot" key={entry.kind}>
                    <div className="issue-slot-head">
                      <h3 className="board-section-title">{entry.label}</h3>
                      <label className="issue-add">
                        {busy === entry.kind ? "Uploading…" : held.length ? "Add another" : "Add photo"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          hidden
                          onChange={(event) => {
                            void add(entry.kind, event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>

                    {held.length ? (
                      <div className="issue-shots">
                        {held.map((photo) => (
                          <figure key={photo.fileId} className="issue-shot">
                            <Image
                              src={`/api/files/${photo.fileId}`}
                              alt={entry.label}
                              width={220}
                              height={165}
                            />
                            <button
                              type="button"
                              className="board-photo-remove"
                              aria-label="Remove photo"
                              onClick={() => drop(entry.kind, photo.fileId)}
                            >
                              ×
                            </button>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <p className="issue-empty">Nothing yet — one is required.</p>
                    )}
                  </section>
                );
              })}
            </div>

            <label className="issue-note">
              <span className="board-section-title">Note</span>
              <textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional — anything the photos do not show."
              />
            </label>
          </>
        )}

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={onCancel}>
            Cancel
          </button>
          {type !== null ? (
            <button
              type="button"
              className="dialog-confirm"
              disabled={!ready || busy !== null}
              onClick={() => void save()}
            >
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
