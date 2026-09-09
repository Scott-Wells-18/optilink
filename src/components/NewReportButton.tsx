"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewReportButton({
  clientId,
  label = "New report",
  variant = "primary",
}: {
  clientId?: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!response.ok) throw new Error();
      const report = await response.json();
      router.push(`/reports/${report.id}`);
    } catch {
      setError("Could not create the report.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className={variant === "primary" ? "btn-primary" : "btn-secondary"}
      >
        {busy ? "Creating…" : label}
      </button>
    </div>
  );
}
