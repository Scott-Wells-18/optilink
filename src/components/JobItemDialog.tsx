"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { JOB_STAGES, STAGE_LABELS, STAGE_NOTES, type JobPhotoStage } from "@/lib/jobs";
import { uploadImage } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * One piece of work, written up on the spot: what it was, where, how it was
 * found and what was done about it — then photographed before, optionally
 * during, and after.
 */

type Pending = { fileId: string; name: string };

type Field = { key: string; label: string; placeholder: string; multiline?: boolean };

const FIELDS: Field[] = [
  { key: "title", label: "What was it", placeholder: "e.g. Meal room GPO replaced" },
  { key: "location", label: "Where", placeholder: "e.g. Meal room, north wall" },
  {
    key: "found",
    label: "How you found it",
    placeholder: "e.g. Socket loose in the wall, not retaining plugs",
    multiline: true,
  },
  {
    key: "done",
    label: "What you did",
    placeholder: "e.g. Replaced GPO and mounting block, retested",
    multiline: true,
  },
];

export function JobItemDialog({
  jobId,
  jobTitle,
  onCancel,
  onSaved,
}: {
  jobId: string;
  jobTitle: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const key = `jobitem:${jobId}`;
  const [values, setValues] = usePersisted<Record<string, string>>(`${key}:fields`, {});
  const [photos, setPhotos] = usePersisted<Partial<Record<JobPhotoStage, Pending[]>>>(
    `${key}:photos`,
    {},
  );
  const [busy, setBusy] = useState<JobPhotoStage | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function forget() {
    clearSession(`${key}:fields`);
    clearSession(`${key}:photos`);
  }

  function cancel() {
    forget();
    onCancel();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // cancel() only drops the draft and calls the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  const filled = FIELDS.every((field) => values[field.key]?.trim());
  const ready =
    filled && (photos.BEFORE?.length ?? 0) > 0 && (photos.AFTER?.length ?? 0) > 0;

  async function add(stage: JobPhotoStage, files: FileList | null) {
    if (!files?.length) return;
    setBusy(stage);
    setError(null);
    try {
      const added: Pending[] = [];
      for (const file of Array.from(files)) {
        const image = await uploadImage(file);
        added.push({ fileId: image.id, name: file.name });
      }
      setPhotos((current) => ({ ...current, [stage]: [...(current[stage] ?? []), ...added] }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  function drop(stage: JobPhotoStage, fileId: string) {
    setPhotos((current) => ({
      ...current,
      [stage]: (current[stage] ?? []).filter((photo) => photo.fileId !== fileId),
    }));
  }

  async function save() {
    if (!ready) return;
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/job-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId,
          ...values,
          photos: JOB_STAGES.flatMap((stage) =>
            (photos[stage] ?? []).map((photo) => ({ stage, fileId: photo.fileId })),
          ),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That work could not be saved.");
      }
      forget();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
      setBusy(null);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Add work">
      <button className="dialog-scrim" onClick={cancel} aria-label="Close" tabIndex={-1} />

      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">Add work</h2>
          <p className="board-section-note">{jobTitle}</p>
        </div>

        <div className="dialog-fields">
          {FIELDS.map((field) => (
            <label className="dialog-field" key={field.key}>
              <span className="dialog-label">{field.label}</span>
              {field.multiline ? (
                <textarea
                  rows={2}
                  className="dialog-input dialog-textarea"
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              ) : (
                <input
                  className="dialog-input"
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              )}
            </label>
          ))}
        </div>

        <div className="issue-slots">
          {JOB_STAGES.map((stage) => {
            const held = photos[stage] ?? [];
            return (
              <section className="issue-slot" key={stage}>
                <div className="issue-slot-head">
                  <h3 className="board-section-title">{STAGE_LABELS[stage]}</h3>
                  <label className="issue-add">
                    {busy === stage ? "Uploading…" : held.length ? "Add another" : "Add photo"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      hidden
                      onChange={(event) => {
                        void add(stage, event.target.files);
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
                          alt={STAGE_LABELS[stage]}
                          width={220}
                          height={165}
                        />
                        <button
                          type="button"
                          className="board-photo-remove"
                          aria-label="Remove photo"
                          onClick={() => drop(stage, photo.fileId)}
                        >
                          ×
                        </button>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="issue-empty">{STAGE_NOTES[stage]}</p>
                )}
              </section>
            );
          })}
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-confirm"
            disabled={!ready || busy !== null}
            onClick={() => void save()}
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
