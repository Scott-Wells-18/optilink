"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { TreeNav } from "@/components/TreeNav";
import { SECTIONS } from "@/lib/navTree";
import { useClientsTree } from "@/lib/useClientsTree";
import { AddDialog } from "@/components/AddDialog";
import { InfoDialog } from "@/components/InfoDialog";
import { ChooseKindDialog } from "@/components/ChooseKindDialog";
import { BoardEditor } from "@/components/BoardEditor";
import { BoardViewer } from "@/components/BoardViewer";
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
  const clients = useClientsTree(open);

  useSpringScroll(scrollerRef);

  // Clients and Thermal come from the database; RCD and B&A are placeholders.
  const sections = useMemo(
    () =>
      SECTIONS.map((section) => {
        if (section.id === "clients") return { ...section, children: clients.nodes };
        if (section.id === "thermal") return { ...section, children: clients.thermalNodes };
        return section;
      }),
    [clients.nodes, clients.thermalNodes],
  );

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
          <TreeNav nodes={sections} scrollerRef={scrollerRef} />
        </div>
      </main>

      {open && clients.dialog ? (
        <AddDialog
          spec={clients.dialog}
          onClose={clients.closeDialog}
          onSubmit={clients.submit}
        />
      ) : null}

      {open && clients.info ? (
        <InfoDialog spec={clients.info} onClose={clients.closeInfo} />
      ) : null}

      {open && clients.chooser ? (
        <ChooseKindDialog
          siteName={clients.chooser.siteName}
          onChoose={clients.chooseKind}
          onClose={clients.closeChooser}
        />
      ) : null}

      {open && clients.viewer ? (
        <BoardViewer
          equipmentId={clients.viewer.equipmentId}
          name={clients.viewer.name}
          board={clients.viewer.board}
          onClose={clients.closeViewer}
        />
      ) : null}

      {open && clients.boardEditor ? (
        <BoardEditor
          title={clients.boardEditor.title}
          initialName={clients.boardEditor.name}
          initialBoard={clients.boardEditor.board}
          onCancel={clients.closeBoardEditor}
          onSave={clients.saveBoard}
        />
      ) : null}

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
      <div className="gate-input-wrap">
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          disabled={disabled}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="gate-input"
          aria-label="Password"
        />
        <button
          type="submit"
          className="gate-submit"
          disabled={busy || !password || disabled}
          aria-label="Sign in"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 8h9m0 0-3.5-3.5M12 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {error ? <p className="gate-error">{error}</p> : null}

      {defaultPassword ? (
        <p className="gate-note">
          Temporary password <code>123</code> — set <code>APP_PASSWORD</code> and{" "}
          <code>SESSION_SECRET</code> on the host.
        </p>
      ) : null}
    </form>
  );
}
