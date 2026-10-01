"use client";

import { useEffect, useState } from "react";
import { uploadImage } from "@/components/ImageUpload";
import { TITLE_LABELS, type Title } from "@/lib/profiles";

/**
 * Somebody who puts their name to the company's documents.
 *
 * What is on file decides what they can sign, so the form says so as it is
 * filled in rather than refusing the save at the end: a name and a signature
 * are enough for a SWMS or a JSA, and a contractor licence as well is what
 * lets somebody be named as having prepared a report.
 */

export type ProfileDraft = {
  id?: string;
  firstName: string;
  lastName: string;
  licence: string;
  supervisor: string;
  titles: Title[];
  director: boolean;
  signatureFileId: string | null;
};

export const EMPTY_PROFILE: ProfileDraft = {
  firstName: "",
  lastName: "",
  licence: "",
  supervisor: "",
  titles: [],
  director: false,
  signatureFileId: null,
};

const TITLES: Title[] = ["ELECTRICIAN", "APPRENTICE"];

export function ProfileDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: ProfileDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [busy, setBusy] = useState<null | "signature" | "save">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const named = Boolean(draft.firstName.trim() && draft.lastName.trim());
  const signed = Boolean(draft.signatureFileId);
  const licensed = Boolean(draft.licence.trim());

  async function takeSignature(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy("signature");
    setError(null);
    try {
      const stored = await uploadImage(file);
      setDraft((current) => ({ ...current, signatureFileId: stored.id }));
    } catch {
      setError("That signature could not be uploaded.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!named) {
      setError("A profile needs a first name and a last name.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(
        draft.id ? `/api/profiles/${draft.id}` : "/api/profiles",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That profile could not be saved.");
      }
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
      setBusy(null);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Profile">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">{draft.id ? "Edit profile" : "Add a profile"}</h2>
            <p className="board-section-note">
              Who can be named on the paperwork, and what they are licensed for.
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            <div className="dialog-fields">
              <div className="profile-pair">
                <label className="dialog-field">
                  <span className="dialog-label">First name</span>
                  <input
                    className="dialog-input"
                    autoFocus
                    value={draft.firstName}
                    onChange={(event) =>
                      setDraft({ ...draft, firstName: event.target.value })
                    }
                  />
                </label>
                <label className="dialog-field">
                  <span className="dialog-label">Last name</span>
                  <input
                    className="dialog-input"
                    value={draft.lastName}
                    onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                  />
                </label>
              </div>

              <div className="profile-pair">
                <label className="dialog-field">
                  <span className="dialog-label">Contractor licence</span>
                  <input
                    className="dialog-input"
                    placeholder="e.g. 91510C"
                    value={draft.licence}
                    onChange={(event) => setDraft({ ...draft, licence: event.target.value })}
                  />
                </label>
                <label className="dialog-field">
                  <span className="dialog-label">Qualified supervisor (optional)</span>
                  <input
                    className="dialog-input"
                    placeholder="e.g. 24046S"
                    value={draft.supervisor}
                    onChange={(event) => setDraft({ ...draft, supervisor: event.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="board-section-head">
              <h3 className="board-section-title">What they are</h3>
              <p className="board-section-note">
                Printed under their name on the reports they are on.
              </p>
            </div>
            <div className="issue-picks is-row">
              {TITLES.map((title) => (
                <button
                  key={title}
                  type="button"
                  className={`issue-pick is-phase ${draft.titles.includes(title) ? "is-on" : ""}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      titles: draft.titles.includes(title)
                        ? draft.titles.filter((other) => other !== title)
                        : [...draft.titles, title],
                    })
                  }
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{TITLE_LABELS[title]}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                className={`issue-pick is-phase ${draft.director ? "is-on" : ""}`}
                onClick={() => setDraft({ ...draft, director: !draft.director })}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">Director</span>
                </span>
              </button>
            </div>
            {draft.director ? (
              <p className="amp-hint is-standalone">
                Only one person is the director. Making this one the director takes it off
                whoever held it.
              </p>
            ) : null}

            <div className="board-section-head">
              <h3 className="board-section-title">Their signature</h3>
              <p className="board-section-note">
                A photograph or a scan of the signature, on white. The blank around it is
                trimmed off automatically.
              </p>
            </div>
            {draft.signatureFileId ? (
              <div className="profile-signature">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${draft.signatureFileId}`} alt="Signature" />
                <button
                  type="button"
                  className="dialog-cancel"
                  onClick={() => setDraft({ ...draft, signatureFileId: null })}
                >
                  Remove
                </button>
              </div>
            ) : null}
            <label className="rcd-drop">
              {busy === "signature"
                ? "Uploading…"
                : draft.signatureFileId
                  ? "Replace the signature"
                  : "Choose the signature image"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  void takeSignature(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            {/* --- what this profile will be allowed to do ------------------ */}
            <div className="board-section-head">
              <h3 className="board-section-title">What this profile can be used for</h3>
            </div>
            <ul className="profile-rules">
              <li className={named && signed ? "is-on" : ""}>
                <span className="profile-rule-mark" aria-hidden />
                <span>
                  <strong>SWMS and JSAs</strong> — a name and a signature.
                  {named && signed ? "" : " Add both to use this profile there."}
                </span>
              </li>
              <li className={named && signed && licensed ? "is-on" : ""}>
                <span className="profile-rule-mark" aria-hidden />
                <span>
                  <strong>Every report</strong> — a name, a signature and a contractor
                  licence.
                  {named && signed && licensed
                    ? draft.supervisor.trim()
                      ? ""
                      : " The supervisor number is left off, which is fine."
                    : " Add a contractor licence to use this profile there."}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <footer className="board-foot">
          {error ? <p className="dialog-error">{error}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-confirm"
              disabled={!named || busy !== null}
              onClick={() => void save()}
            >
              {busy === "save" ? "Saving…" : "Save profile"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
