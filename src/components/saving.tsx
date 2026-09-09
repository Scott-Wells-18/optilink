"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Everything in the report editor saves itself. A single store tracks how many
 * saves are in flight so the header can show one honest "Saving… / Saved"
 * indicator, no matter which field the user touched.
 */

type SaveState = {
  inFlight: number;
  lastSavedAt: number | null;
  error: string | null;
};

let state: SaveState = { inFlight: 0, lastSavedAt: null, error: null };
const listeners = new Set<() => void>();

function emit(next: Partial<SaveState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSaveState(): SaveState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export async function sendPatch(
  url: string,
  body: unknown,
  method: "PATCH" | "POST" | "DELETE" = "PATCH",
): Promise<Response | null> {
  emit({ inFlight: state.inFlight + 1, error: null });
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      emit({
        inFlight: state.inFlight - 1,
        error: payload.error ?? "Changes could not be saved.",
      });
      return null;
    }
    emit({ inFlight: state.inFlight - 1, lastSavedAt: Date.now(), error: null });
    return response;
  } catch {
    emit({
      inFlight: state.inFlight - 1,
      error: "Lost connection to the server — your last change was not saved.",
    });
    return null;
  }
}

/**
 * Returns a function that merges partial updates and writes them to `url`
 * after a short pause, so typing a sentence is one request, not thirty.
 */
export function useDebouncedPatch(url: string, delay = 700) {
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const flush = useRef(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const payload = pending.current;
    pending.current = {};
    if (Object.keys(payload).length === 0) return;
    await sendPatch(urlRef.current, payload);
  });

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0 || state.inFlight > 0) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    const flushNow = flush.current;
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      void flushNow();
    };
  }, []);

  return {
    patch(update: Record<string, unknown>) {
      pending.current = { ...pending.current, ...update };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush.current(), delay);
    },
    flush: () => flush.current(),
  };
}

export function SaveIndicator() {
  const { inFlight, lastSavedAt, error } = useSaveState();
  const [, force] = useState(0);

  // Re-render every 20s so "saved 2 minutes ago" stays truthful.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 20000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        {error}
      </span>
    );
  }
  if (inFlight > 0) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
        Saving…
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Saved {relativeTime(lastSavedAt)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      All changes save automatically
    </span>
  );
}

function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}
