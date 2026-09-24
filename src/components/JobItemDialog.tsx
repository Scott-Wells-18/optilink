"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  JOB_STAGES,
  MAX_PHOTOS_PER_STAGE,
  PHOTO_BUDGET,
  STAGE_LABELS,
  STAGE_NOTES,
  type JobPhotoStage,
} from "@/lib/jobs";
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function forget() {
    clearSession(`${key}:fields`);
    clearSession(`${key}:photos`);
  }

  /**
   * Hand a photo back.
   *
   * A picture is uploaded the moment it is chosen, so one taken out of a draft
   * — or a draft abandoned altogether — has already cost a file on the volume.
   * The server only lets go of a file nothing else points at, so this is safe
   * to call for anything.
   */
  function release(fileIds: string[]) {
    for (const fileId of fileIds) {
      void fetch(`/api/files/${fileId}`, { method: "DELETE" }).catch(() => {});
    }
  }

  function cancel() {
    release(JOB_STAGES.flatMap((stage) => (photos[stage] ?? []).map((photo) => photo.fileId)));
    forget();
    onCancel();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // cancel() drops the draft, hands its photos back and calls the prop, so
    // it has to see the photos as they are now rather than as they were when
    // the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel, photos]);

  const filled = FIELDS.every((field) => values[field.key]?.trim());
  const ready =
    filled && (photos.BEFORE?.length ?? 0) > 0 && (photos.AFTER?.length ?? 0) > 0;

  /**
   * Take a selection — a handful of photos, or a whole folder off the phone or
   * the laptop — and put as many of them as the stage still has room for.
   *
   * A folder comes in as everything that is in it, so anything that is not a
   * picture is dropped rather than refused, and the ones that are come in the
   * order the folder lists them. Three upload at a time: one at a time makes a
   * folder of nine feel broken on a site connection, and all nine at once is
   * what makes a phone give up halfway.
   */
  async function add(stage: JobPhotoStage, selection: FileList | null) {
    const pictures = Array.from(selection ?? []).filter(
      (file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(file.name),
    );
    if (pictures.length === 0) return;

    const room = MAX_PHOTOS_PER_STAGE - (photos[stage]?.length ?? 0);
    if (room <= 0) {
      setError(`${STAGE_LABELS[stage]} already holds its ${MAX_PHOTOS_PER_STAGE} photos.`);
      return;
    }

    const taking = pictures.slice(0, room);
    setBusy(stage);
    setProgress({ done: 0, total: taking.length });
    const over = pictures.length - taking.length;
    setError(
      over > 0
        ? `${STAGE_LABELS[stage]} holds ${MAX_PHOTOS_PER_STAGE} photos — a page of three by three. ` +
          `The first ${taking.length} went in; the other ${over} did not.`
        : null,
    );

    try {
      const added: (Pending | null)[] = new Array(taking.length).fill(null);
      let next = 0;
      let finished = 0;

      async function worker() {
        for (let at = next++; at < taking.length; at = next++) {
          const file = taking[at];
          const image = await uploadImage(file, PHOTO_BUDGET);
          added[at] = { fileId: image.id, name: file.name };
          finished += 1;
          setProgress({ done: finished, total: taking.length });
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(3, taking.length) }, () => worker()),
      );

      const kept = added.filter((photo): photo is Pending => photo !== null);
      setPhotos((current) => ({
        ...current,
        [stage]: [...(current[stage] ?? []), ...kept].slice(0, MAX_PHOTOS_PER_STAGE),
      }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  function drop(stage: JobPhotoStage, fileId: string) {
    setPhotos((current) => ({
      ...current,
      [stage]: (current[stage] ?? []).filter((photo) => photo.fileId !== fileId),
    }));
    release([fileId]);
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
            const full = held.length >= MAX_PHOTOS_PER_STAGE;
            const uploading = busy === stage;
            return (
              <section className="issue-slot" key={stage}>
                <div className="issue-slot-head">
                  <h3 className="board-section-title">{STAGE_LABELS[stage]}</h3>
                  <span className="issue-count">
                    {held.length} of {MAX_PHOTOS_PER_STAGE}
                  </span>
                  {uploading ? (
                    <span className="issue-add is-busy">
                      {progress
                        ? `Uploading ${progress.done} of ${progress.total}…`
                        : "Uploading…"}
                    </span>
                  ) : (
                    <>
                      <label className={`issue-add${full ? " is-full" : ""}`}>
                        {held.length ? "Add photos" : "Add photos"}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          disabled={full || busy !== null}
                          onChange={(event) => {
                            void add(stage, event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <label className={`issue-add is-quiet${full ? " is-full" : ""}`}>
                        Add a folder
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          disabled={full || busy !== null}
                          // Chromium and Safari take a whole folder this way;
                          // a browser that does not understand it simply shows
                          // the ordinary picker, which is no worse than the
                          // button beside it.
                          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                          onChange={(event) => {
                            void add(stage, event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </>
                  )}
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
