"use client";

import { useEffect, useState } from "react";
import { personName } from "@/lib/contacts";

/**
 * Whose name goes on a report.
 *
 * A site can have several people on file — the manager who signs the work off,
 * the maintenance fitter who let us in, the head office contact who pays for
 * it — and a report is addressed to one of them. It used to take whichever had
 * been added first, which is not a choice anybody made, so it is asked here
 * instead and nothing is printed until it has been.
 */

export type ContactChoice = {
  /** Where the choice is saved: the report's own record. */
  path: string;
  /** The site's people, in the order they were added. */
  contacts: { id: string; name: string }[];
  contactId: string | null;
  /** What kind of report it is, said in the dialog. */
  what: string;
};

export function ReportContactDialog({
  choice,
  onClose,
  onSaved,
}: {
  choice: ContactChoice;
  onClose: () => void;
  onSaved: (contactId: string | null) => void;
}) {
  const [chosen, setChosen] = useState<string>(choice.contactId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(value: string) {
    setChosen(value);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(choice.path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: value || null }),
      });
      if (!response.ok) throw new Error("That could not be saved.");
      onSaved(value || null);
    } catch {
      setError("That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Report contact">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Who the report is for</h2>
            <p className="board-section-note">
              The person named on the front of this {choice.what}. Whoever you pick
              here is who it is addressed to.
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            {choice.contacts.length > 0 ? (
              <div className="issue-picks">
                {choice.contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className={`issue-pick ${chosen === contact.id ? "is-on" : ""}`}
                    disabled={busy}
                    onClick={() => void save(chosen === contact.id ? "" : contact.id)}
                  >
                    <span className="issue-pick-mark is-one" aria-hidden />
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">{personName(contact.name)}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`issue-pick ${chosen === "" ? "is-on" : ""}`}
                  disabled={busy}
                  onClick={() => void save("")}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">Nobody in particular</span>
                    <span className="issue-pick-note">
                      The report is addressed to the client instead.
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <p className="issue-empty">
                Nobody is on file for this site yet. Add a contact under Clients and
                they will appear here.
              </p>
            )}

            {error ? <p className="dialog-error">{error}</p> : null}
          </div>
        </div>

        <footer className="board-foot">
          <div className="dialog-actions">
            <button type="button" className="dialog-confirm" onClick={onClose}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
