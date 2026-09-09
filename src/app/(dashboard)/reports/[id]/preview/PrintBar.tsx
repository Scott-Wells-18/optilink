"use client";

import Link from "next/link";

export function PrintBar({ reportId, reference }: { reportId: string; reference: string }) {
  return (
    <div className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/reports/${reportId}`} className="hover:text-slate-900">
            ← Back to editing
          </Link>
          <span className="font-mono text-xs">{reference}</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs text-slate-500 sm:block">
            Choose “Save as PDF” in the print dialog to send this to your client.
          </p>
          <button type="button" onClick={() => window.print()} className="btn-primary">
            Print / Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
}
