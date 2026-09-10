"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  CAUSE_LABELS,
  CAUSE_NOTES,
  ISSUE_LABELS,
  ISSUE_NOTES,
  POSITION_ISSUE_TYPES,
  causesFor,
  needsSurvey,
  photoSlotsFor,
  recommendationsFor,
  type IssueCause,
  type IssueType,
  type PhotoKind,
} from "@/lib/issues";
import { bandFor, priorityFor, priorityLabel, temperatureRise } from "@/lib/priority";
import { uploadImage } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

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
  device = "device",
  title = "Report issue",
  types = POSITION_ISSUE_TYPES,
  fixedType = null,
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
  /** What the recommendations should call it: "breaker", "motor", … */
  device?: string;
  title?: string;
  /** Which findings are on offer here. */
  types?: readonly IssueType[];
  /** Set when there is nothing to choose — dust ingress off the board. */
  fixedType?: IssueType | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  // Photos are already on the server by the time they are held here, so all
  // that has to survive a reload are their ids and what was picked.
  const key = `issue:${inspectionId}:${equipmentId}:${slot}`;
  const [type, setType] = usePersisted<IssueType | null>(`${key}:type`, fixedType);
  const [photos, setPhotos] = usePersisted<Partial<Record<PhotoKind, Pending[]>>>(
    `${key}:photos`,
    {},
  );
  const [cause, setCause] = usePersisted<IssueCause | null>(`${key}:cause`, null);
  const [refTemp, setRefTemp] = usePersisted(`${key}:ref`, "");
  const [hotTemp, setHotTemp] = usePersisted(`${key}:hot`, "");
  const [picks, setPicks] = usePersisted<string[]>(`${key}:picks`, []);
  /** The survey is a second page, reached once the photos are in. */
  const [onSurvey, setOnSurvey] = usePersisted(`${key}:survey`, false);
  const [busy, setBusy] = useState<PhotoKind | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function forget() {
    for (const part of ["type", "photos", "cause", "picks", "survey", "ref", "hot"]) {
      clearSession(`${key}:${part}`);
    }
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

  const slots = type ? photoSlotsFor(type) : [];
  const survey = type !== null && needsSurvey(type);
  const photosIn =
    type !== null && slots.every((entry) => (photos[entry.kind]?.length ?? 0) > 0);
  const ref = Number.parseFloat(refTemp);
  const hot = Number.parseFloat(hotTemp);
  const rise = temperatureRise(
    Number.isFinite(ref) ? ref : null,
    Number.isFinite(hot) ? hot : null,
  );
  const band = type ? bandFor(priorityFor(type, rise)) : null;

  /** Everything the first page needs before it can be left. */
  const pageDone = photosIn && (!survey || (cause !== null && rise !== null));
  const ready = survey ? pageDone && picks.length > 0 : photosIn;
  const options = cause ? recommendationsFor(cause, device) : [];
  const causes = causesFor(device);

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
        cause: survey ? cause : undefined,
        recommendations: survey ? picks : undefined,
        refTemp: survey ? ref : undefined,
        hotTemp: survey ? hot : undefined,
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
      forget();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
      setBusy(null);
    }
  }

  return (
    <div className="dialog-layer is-stacked" role="dialog" aria-modal aria-label="Report issue">
      <button className="dialog-scrim" onClick={cancel} aria-label="Close" tabIndex={-1} />

      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">{title}</h2>
          <p className="board-section-note">
            {where}
            {kind ? <span className="issue-kind">{kind}</span> : null}
          </p>
        </div>

        {type === null ? (
          <div className="issue-types">
            {types.map((option) => (
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
            {fixedType || onSurvey ? null : (
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
            )}

            {onSurvey ? null : (
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
            )}

            {survey && !onSurvey ? (
              <>
                <section className="issue-survey">
                  <h3 className="board-section-title">Temperatures</h3>
                  <p className="issue-empty">
                    Off the thermogram, in °C. The rise between them sets the priority.
                  </p>
                  <div className="issue-temps">
                    <label className="issue-temp">
                      <span>Ref temp</span>
                      <input
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        value={refTemp}
                        placeholder="54.1"
                        onChange={(event) => setRefTemp(event.target.value)}
                      />
                    </label>
                    <label className="issue-temp">
                      <span>R1 temp</span>
                      <input
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        value={hotTemp}
                        placeholder="105.1"
                        onChange={(event) => setHotTemp(event.target.value)}
                      />
                    </label>
                    <div
                      className="issue-rise"
                      style={
                        rise !== null && band
                          ? ({ "--band": band.colour } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <span>Rise</span>
                      <strong>{rise === null ? "—" : `${rise}°C`}</strong>
                      {rise !== null && band ? (
                        <em>
                          {band.band} · {priorityLabel(band.priority)}
                        </em>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="issue-survey">
                  <h3 className="board-section-title">What is behind it</h3>
                  <p className="issue-empty">One of them.</p>
                  <div className="issue-picks">
                    {causes.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`issue-pick ${cause === option ? "is-on" : ""}`}
                        onClick={() => {
                          setCause(option);
                          setPicks([]);
                        }}
                      >
                        <span className="issue-pick-mark is-one" aria-hidden />
                        <span className="issue-pick-body">
                          <span className="issue-pick-label">{CAUSE_LABELS[option]}</span>
                          <span className="issue-pick-note">{CAUSE_NOTES[option]}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : null}

            {survey && onSurvey ? (
              <section className="issue-survey">
                <div className="issue-chosen">
                  <span className={`issue-chip is-${type.toLowerCase()}`}>
                    {ISSUE_LABELS[type]}
                  </span>
                  <span className="issue-chip is-cause">
                    {cause ? CAUSE_LABELS[cause] : ""}
                  </span>
                  <button
                    type="button"
                    className="issue-change"
                    onClick={() => setOnSurvey(false)}
                  >
                    Back
                  </button>
                </div>
                <h3 className="board-section-title">Recommendations</h3>
                <p className="issue-empty">As many as apply.</p>
                <div className="issue-picks">
                  {options.map((option) => {
                    const on = picks.includes(option.key);
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`issue-pick ${on ? "is-on" : ""}`}
                        onClick={() =>
                          setPicks((current) =>
                            on
                              ? current.filter((entry) => entry !== option.key)
                              : [...current, option.key],
                          )
                        }
                      >
                        <span className="issue-pick-mark" aria-hidden />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </>
        )}

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={cancel}>
            Cancel
          </button>
          {type !== null && survey && !onSurvey ? (
            <button
              type="button"
              className="dialog-confirm"
              disabled={!pageDone || busy !== null}
              onClick={() => setOnSurvey(true)}
            >
              Next
            </button>
          ) : type !== null ? (
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
