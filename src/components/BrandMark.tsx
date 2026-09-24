"use client";

import { useState } from "react";

/**
 * The logo, with one retry in it.
 *
 * It was a `next/image` with `priority`, which emits a preload link as well as
 * the image itself. With image optimisation turned off that preload buys
 * nothing — the file is served as it sits on disk either way — and on iOS
 * Safari a preloaded image that is also rendered intermittently comes back as
 * a broken one, which is why the page had to be reloaded to see the logo.
 *
 * So: a plain image, no preload, and if it fails to load it asks once more
 * with a different query string. A retry that changes the URL gets past
 * whatever the first attempt cached, and one retry is enough — a second
 * failure is a real one and the wordmark below it is already the fallback.
 */
export function BrandMark({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={attempt === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}`}
      alt={alt}
      className={className}
      decoding="async"
      onError={() => {
        if (attempt === 0) setAttempt(1);
        else setFailed(true);
      }}
    />
  );
}
