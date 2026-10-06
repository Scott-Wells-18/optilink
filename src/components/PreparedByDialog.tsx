"use client";

import { useEffect, useState } from "react";
import { TITLE_LABELS, canPrepareReports, canSignSafety, fullName, type Title } from "@/lib/profiles";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * Choosing who a document is prepared by, or who signed it.
 *
 * More than one person can be on a piece of work, so this is a multiple
 * choice: whoever is picked has their name, their credentials and their
 * signature printed on what comes out. Only the people who may be named on
 * this kind of document are offered — a profile with no contractor licence
 * cannot be named as having prepared a report, and rather than letting it be
 * chosen and leaving a blank line on the page, it is listed with the reason
 * it cannot be used.
 */

export type PreparedByChoice = {
  /** Where the choice is saved: the report's own record. */
  path: string;
  /** What kind of document this is, said in the dialog. */
  what: string;
  /** "reports" needs a licence; "safety" needs only a name and a signature. */
  needs: "reports" | "safety";
  chosen: string[];
};

type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  licence: string | null;
  supervisor: string | null;
  titles: Title[];
  director: boolean;
  signatureFileId: string | null;
};

export function PreparedByDialog({
  choice,
  onClose,
  onSaved,
}: {
  choice: PreparedByChoice;
  onClose: () => void;
  onSaved: (chosen: string[]) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [chosen, setChosen] = useState<string[]>(choice.chosen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/profiles", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setProfiles)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allowed = (profile: Profile) =>
    choice.needs === "safety" ? canSignSafety(profile) : canPrepareReports(profile);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(choice.path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preparedBy: chosen }),
      });
      if (!response.ok) throw new Error("That could not be saved.");
      onSaved(chosen);
    } catch {
      setError("That could not be saved.");
      setBusy(false);
    }
  }

  const usable = profiles.filter(allowed);
  const rest = profiles.filter((profile) => !allowed(profile));

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Prepared by">
      <DialogScrim />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">
              {choice.needs === "safety" ? "Who signed it" : "Who prepared it"}
            </h2>
            <p className="board-section-note">
              Their name, credentials and signature go on the {choice.what}.
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            <div className="issue-picks">
              {usable.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`issue-pick ${chosen.includes(profile.id) ? "is-on" : ""}`}
                  onClick={() =>
                    setChosen((current) =>
                      current.includes(profile.id)
                        ? current.filter((id) => id !== profile.id)
                        : [...current, profile.id],
                    )
                  }
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{fullName(profile)}</span>
                    <span className="issue-pick-note">
                      {[
                        profile.director ? "Director" : null,
                        ...profile.titles.map((title) => TITLE_LABELS[title]),
                        profile.licence ? `Lic ${profile.licence}` : null,
                        profile.supervisor ? `Supervisor ${profile.supervisor}` : null,
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </span>
                  </span>
                </button>
              ))}
              {usable.length === 0 ? (
                <p className="issue-empty">
                  {choice.needs === "safety"
                    ? "No profile has a signature on file yet. Add one under Profiles."
                    : "No profile has both a signature and a contractor licence yet. Add one under Profiles."}
                </p>
              ) : null}
            </div>

            {rest.length > 0 ? (
              <>
                <div className="board-section-head">
                  <h3 className="board-section-title">Not available for this</h3>
                </div>
                <ul className="profile-rules">
                  {rest.map((profile) => (
                    <li key={profile.id}>
                      <span className="profile-rule-mark" aria-hidden />
                      <span>
                        <strong>{fullName(profile)}</strong> —{" "}
                        {!profile.signatureFileId
                          ? "no signature on file"
                          : "no contractor licence on file"}
                        . Add it under Profiles.
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {chosen.length === 0 ? (
              <p className="amp-hint is-standalone">
                With nobody chosen, the {choice.what} is prepared by the director, as it was
                before this could be chosen.
              </p>
            ) : null}
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
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
