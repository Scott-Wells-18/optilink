"use client";

import { useEffect } from "react";

/** Switchboard or appliance — the first question when adding equipment. */
export function ChooseKindDialog({
  siteName,
  onChoose,
  onClose,
}: {
  siteName: string;
  onChoose: (kind: "SWITCHBOARD" | "APPLIANCE") => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Add equipment">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="dialog is-chooser">
        <h2 className="dialog-title">Add equipment at {siteName}</h2>

        <div className="chooser-options">
          <button type="button" className="chooser-option" onClick={() => onChoose("SWITCHBOARD")} autoFocus>
            <svg viewBox="0 0 40 40" fill="none" aria-hidden>
              <rect x="5.5" y="4.5" width="29" height="31" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <rect x="10" y="10" width="8" height="4.5" rx="1.2" fill="currentColor" opacity=".85" />
              <rect x="22" y="10" width="8" height="4.5" rx="1.2" fill="currentColor" opacity=".45" />
              <rect x="10" y="17.5" width="8" height="4.5" rx="1.2" fill="currentColor" opacity=".45" />
              <rect x="22" y="17.5" width="8" height="4.5" rx="1.2" fill="currentColor" opacity=".85" />
              <rect x="10" y="25" width="8" height="4.5" rx="1.2" fill="currentColor" opacity=".85" />
              <rect x="22" y="25" width="8" height="4.5" rx="1.2" fill="currentColor" opacity=".45" />
            </svg>
            <span className="chooser-label">Switchboard</span>
            <span className="chooser-note">Draw the board and its circuits</span>
          </button>

          <button type="button" className="chooser-option" onClick={() => onChoose("APPLIANCE")}>
            <svg viewBox="0 0 40 40" fill="none" aria-hidden>
              <rect x="7.5" y="6.5" width="25" height="27" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="1.6" />
              <path d="M20 14v-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="27" cy="11" r="1.4" fill="currentColor" />
            </svg>
            <span className="chooser-label">Appliance</span>
            <span className="chooser-note">A name and a description</span>
          </button>
        </div>

        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
