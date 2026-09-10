"use client";

import { useEffect, useRef, useState } from "react";
import type { DialogSpec } from "@/lib/useClientsTree";
import { clearSession, usePersisted } from "@/lib/session";

/** The pop-up behind every "add new" tile. */
export function AddDialog({
  spec,
  onClose,
  onSubmit,
}: {
  spec: DialogSpec;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  // Keyed by which form this is, so half-typed details survive a reload but
  // never leak into a different form.
  const stateKey = `form:${spec.endpoint}:${spec.title}`;
  const [values, setValues] = usePersisted<Record<string, string>>(stateKey, {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close() only reads refs and props that do not change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  function close() {
    clearSession(stateKey);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      clearSession(stateKey);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "That could not be saved.");
      setBusy(false);
    }
  }

  const required = spec.fields.filter((field) => field.required);
  const ready = required.every((field) => values[field.name]?.trim());

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label={spec.title}>
      <button className="dialog-scrim" onClick={close} aria-label="Close" tabIndex={-1} />
      <form className="dialog" onSubmit={handleSubmit}>
        <h2 className="dialog-title">{spec.title}</h2>

        <div className="dialog-fields">
          {spec.fields.map((field, index) => (
            <label className="dialog-field" key={field.name}>
              <span className="dialog-label">
                {field.label}
                {field.required ? null : <em>optional</em>}
              </span>
              {field.multiline ? (
                <textarea
                  ref={index === 0 ? (firstField as React.RefObject<HTMLTextAreaElement>) : undefined}
                  rows={4}
                  className="dialog-input dialog-textarea"
                  placeholder={field.placeholder}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              ) : (
                <input
                  ref={index === 0 ? (firstField as React.RefObject<HTMLInputElement>) : undefined}
                  type={field.type ?? "text"}
                  className="dialog-input"
                  placeholder={field.placeholder}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              )}
            </label>
          ))}
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="dialog-confirm" disabled={busy || !ready}>
            {busy ? "Saving…" : spec.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
