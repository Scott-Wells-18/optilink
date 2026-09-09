"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Inputs that keep their own local value so typing stays instant, and hand the
 * change back to the caller (which debounces it to the server).
 */

type BaseProps = {
  label?: string;
  hint?: string;
  className?: string;
  suffix?: string;
};

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  className,
  type = "text",
  suffix,
  disabled,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          type={type}
          className={`field ${suffix ? "pr-12" : ""}`}
          value={local}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          onChange={(event) => {
            setLocal(event.target.value);
            onChange(event.target.value);
          }}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  className,
  suffix,
  step = "any",
}: BaseProps & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  step?: string;
}) {
  const id = useId();
  const [local, setLocal] = useState(value === null || value === undefined ? "" : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setLocal(value === null || value === undefined ? "" : String(value));
    }
  }, [value]);

  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          className={`field ${suffix ? "pr-12" : ""}`}
          value={local}
          placeholder={placeholder}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          onChange={(event) => {
            const raw = event.target.value;
            setLocal(raw);
            onChange(raw === "" ? null : Number(raw));
          }}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  className,
  rows = 4,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <textarea
        id={id}
        rows={rows}
        className="field resize-y leading-relaxed"
        value={local}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(event) => {
          setLocal(event.target.value);
          onChange(event.target.value);
        }}
      />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  className,
  allowEmpty,
  emptyLabel = "—",
}: BaseProps & {
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className="field"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : (event.target.value as T))
        }
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function CheckField({
  label,
  hint,
  checked,
  onChange,
  className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex items-start gap-2.5 ${className ?? ""}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Three-state control for "yes / no / not tested". */
export function TriStateField({
  label,
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
  className,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (value: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
  className?: string;
}) {
  const options: Array<{ key: string; value: boolean | null; label: string }> = [
    { key: "unset", value: null, label: "Not tested" },
    { key: "yes", value: true, label: yesLabel },
    { key: "no", value: false, label: noLabel },
  ];
  return (
    <div className={className}>
      <span className="label">{label}</span>
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
        {options.map((option) => {
          const active = (value ?? null) === option.value;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? option.value === false
                    ? "bg-red-600 text-white"
                    : option.value === true
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
