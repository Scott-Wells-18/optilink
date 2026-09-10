"use client";

import { useEffect } from "react";
import type { InfoSpec } from "@/lib/useClientsTree";

/** Shows what was written against a row — nothing else in the tree reveals it. */
export function InfoDialog({ spec, onClose }: { spec: InfoSpec; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = spec.body?.trim();

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label={spec.title}>
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="dialog">
        <h2 className="dialog-title">{spec.title}</h2>

        {body ? (
          <p className="dialog-body">{body}</p>
        ) : (
          <p className="dialog-body is-empty">No description was added for this one.</p>
        )}

        <div className="dialog-actions">
          <button type="button" className="dialog-confirm" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
