import type { RiskLevel } from "@prisma/client";
import { RISK_META } from "@/lib/risk";

export function RiskBadge({
  risk,
  size = "sm",
  showTimeframe = false,
}: {
  risk: RiskLevel;
  size?: "sm" | "md";
  showTimeframe?: boolean;
}) {
  const meta = RISK_META[risk];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${meta.badge} ${
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
      {showTimeframe ? (
        <span className="font-normal opacity-70">· {meta.timeframe}</span>
      ) : null}
    </span>
  );
}

export function PassFailBadge({ pass }: { pass: boolean | null }) {
  if (pass === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
        Not tested
      </span>
    );
  }
  return pass ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-300">
      <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
      Fail
    </span>
  );
}
