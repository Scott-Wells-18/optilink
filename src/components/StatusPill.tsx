import type { ReportStatus } from "@prisma/client";

export const STATUS_META: Record<
  ReportStatus,
  { label: string; className: string; description: string }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
    description: "Still being worked on. Not ready to send.",
  },
  IN_REVIEW: {
    label: "In review",
    className: "bg-amber-50 text-amber-800 ring-1 ring-amber-300",
    description: "Findings entered, waiting on a check before it goes out.",
  },
  ISSUED: {
    label: "Issued",
    className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300",
    description: "Finalised and provided to the client.",
  },
};

export function StatusPill({ status }: { status: ReportStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
