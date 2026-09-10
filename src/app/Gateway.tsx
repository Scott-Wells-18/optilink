"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { TreeNav } from "@/components/TreeNav";
import { SECTIONS } from "@/lib/navTree";
import { useSpringScroll } from "@/lib/useSpringScroll";

/**
 * Sign-in and the hub are one screen, not two pages. On a correct password the
 * logo travels up and shrinks into the header while the card falls away and the
 * sections rise in — one continuous move rather than a page load.
 */

export function Gateway({
  authed,
  companyName,
  logoUrl,
  defaultPassword,
}: {
  authed: boolean;
  companyName: string;
  logoUrl: string | null;
  defaultPassword: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(authed);
  // Someone arriving already signed in should not watch the animation replay.
  const [instant, setInstant] = useState(authed);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useSpringScroll(scrollerRef);

  useEffect(() => {
    if (!instant) return;
    const raf = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(raf);
  }, [instant]);

  function handleUnlocked() {
    setOpen(true);
    const next = searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      setTimeout(() => router.push(next), 700);
      return;
    }
    setTimeout(() => router.refresh(), 1000);
  }

  const brand = logoUrl ? (
    <Image
      src={logoUrl}
      alt={companyName}
      width={720}
      height={240}
      className="gate-logo-image"
      priority
    />
  ) : (
    <Logo />
  );

  return (
    <div
      className="gate"
      data-state={open ? "open" : "locked"}
      data-instant={instant ? "true" : undefined}
    >
      <div className="gate-surface" aria-hidden />

      <div className="gate-brandbar">
        <div className="gate-brand">{brand}</div>
      </div>

      <section className="gate-card-layer" aria-hidden={open}>
        <SignInCard onUnlocked={handleUnlocked} defaultPassword={defaultPassword} disabled={open} />
      </section>

      <main className="gate-hub" ref={scrollerRef} aria-hidden={!open}>
        <div className="gate-hub-inner">
          <TreeNav nodes={SECTIONS} scrollerRef={scrollerRef} />
        </div>
      </main>

      <nav className="gate-exits" aria-hidden={!open}>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="gate-exit">
            Sign out
          </button>
        </form>
      </nav>
    </div>
  );
}

function SignInCard({
  onUnlocked,
  defaultPassword,
  disabled,
}: {
  onUnlocked: () => void;
  defaultPassword: boolean;
  disabled: boolean;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Sign in failed. Please try again.");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setBusy(false);
        return;
      }
      onUnlocked();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`gate-card ${shake ? "is-shaking" : ""}`}>
      <p className="gate-eyebrow">Secure access</p>

      <div className="gate-input-wrap">
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          disabled={disabled}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••"
          className="gate-input"
          aria-label="Password"
        />
      </div>

      <button type="submit" className="gate-button" disabled={busy || !password || disabled}>
        <span>{busy ? "Opening" : "Enter"}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M2 8h11m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {error ? <p className="gate-error">{error}</p> : null}

      {defaultPassword ? (
        <p className="gate-note">
          Running on the temporary password <code>123</code>. Set{" "}
          <code>APP_PASSWORD</code> and <code>SESSION_SECRET</code> on the host
          before this goes anywhere real.
        </p>
      ) : null}
    </form>
  );
}
