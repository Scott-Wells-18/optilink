"use client";

import { useEffect, useRef, useState } from "react";
import type { DialogSpec } from "@/lib/useClientsTree";

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
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "That could not be saved.");
      setBusy(false);
    }
  }

  const required = spec.fields.filter((field) => field.required);
  const ready = required.every((field) => values[field.name]?.trim());

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label={spec.title}>
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
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
          <button type="button" className="dialog-cancel" onClick={onClose}>
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
