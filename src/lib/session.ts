"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Where you were, kept across a refresh.
 *
 * A survey is done on a phone on site, where a page can reload for any number
 * of reasons — the browser reclaiming memory, a tab restored, a fat-fingered
 * pull. Losing the walk down the tree and half-filled report every time would
 * make the app unusable, so the shape of what is open is written to session
 * storage as it changes and read straight back on load.
 *
 * Session storage rather than local: it belongs to this tab and this sitting,
 * and it is cleared on sign-out.
 */

const PREFIX = "optilink:";

export function readSession<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // A full or blocked store is not worth failing a save over.
  }
}

export function clearSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    // As above.
  }
}

/** Everything this app has stored — dropped on the way out. */
export function clearAllSession(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clean up if the store cannot be read.
  }
}

/**
 * State that comes back after a reload.
 *
 * The first render always uses `initial`, so the server and the client agree;
 * anything stored is read in an effect straight after. Only the returned setter
 * writes — never the restore itself, and never a bare mount — because an effect
 * that wrote on mount would put the initial value back over the stored one
 * before the restore had a chance to land.
 */
export function usePersisted<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const stored = readSession<T | undefined>(key, undefined);
    if (stored !== undefined) setValue(stored);
    // Restoring once, on mount, is the whole point — the key never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((current) => {
        const resolved =
          typeof next === "function" ? (next as (previous: T) => T)(current) : next;
        writeSession(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
