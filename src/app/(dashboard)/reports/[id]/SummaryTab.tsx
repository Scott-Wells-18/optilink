"use client";

import Link from "next/link";
import { useState } from "react";
import type { RiskLevel } from "@prisma/client";
import type { ReportAnalysis } from "@/lib/report";
import { DEFAULT_LIMITATIONS } from "@/lib/report";
import { RISK_META, RISK_ORDER } from "@/lib/risk";
import { SelectField, TextArea } from "@/components/fields";
import { RiskBadge } from "@/components/RiskBadge";
import { sendPatch } from "@/components/saving";
import { useDebouncedPatch } from "@/components/saving";
import type { TabProps } from "./types";

const RISK_OPTIONS = RISK_ORDER.map((value) => ({
  value,
  label: `${RISK_META[value].label} — ${RISK_META[value].timeframe}`,
}));

export function SummaryTab({
  report,
  setReport,
  analysis,
}: TabProps & { analysis: ReportAnalysis }) {
  const { patch } = useDebouncedPatch(`/api/reports/${report.id}`);
  const [regenerating, setRegenerating] = useState(false);

  function update(changes: Record<string, unknown>) {
    setReport((current) => ({ ...current, ...changes }));
    patch(changes);
  }

  async function regenerate() {
    if (
      report.executiveSummary?.trim() &&
      !window.confirm(
        "This replaces the summary and recommendations with a fresh draft written from your findings. Any wording you have changed will be lost. Continue?",
      )
    ) {
      return;
    }
    setRegenerating(true);
    const response = await sendPatch(`/api/reports/${report.id}`, {}, "POST");
    if (response) {
      const body = (await response.json()) as {
        executiveSummary: string;
        recommendations: string;
      };
      setReport((current) => ({
        ...current,
        executiveSummary: body.executiveSummary,
        recommendations: body.recommendations,
      }));
    }
    setRegenerating(false);
  }

  const outstanding = analysis.actions.filter((action) => !action.rectified);
  const done = analysis.actions.filter((action) => action.rectified);

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Overall result</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Worked out from the most severe item still outstanding.
            </p>
          </div>
          {analysis.overallRisk ? (
            <RiskBadge risk={analysis.overallRisk} size="md" showTimeframe />
          ) : null}
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            {analysis.overallRisk ? (
              <p className="text-sm leading-relaxed text-slate-600">
                {RISK_META[analysis.overallRisk].clientMeaning}
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                Nothing has been recorded yet — add thermal findings, RCD tests
                or observations and the overall result appears here.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Stat label="Thermal points" value={analysis.thermalScanned} />
              <Stat label="Anomalies" value={analysis.thermalAnomalies} />
              <Stat label="RCDs tested" value={analysis.rcdTested} />
              <Stat
                label="RCDs failed"
                value={analysis.rcdFailed}
                tone={analysis.rcdFailed > 0 ? "bad" : "good"}
              />
              <Stat label="Observations" value={analysis.observationCount} />
            </div>
          </div>
          <SelectField
            label="Override the overall result"
            value={report.overallRiskOverride}
            options={RISK_OPTIONS}
            onChange={(value) =>
              update({ overallRiskOverride: value as RiskLevel | null })
            }
            allowEmpty
            emptyLabel="Use the calculated result"
          />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">Priority actions</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Built automatically from your findings — this is the table the
              client reads first.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {outstanding.length} open · {done.length} done on site
          </span>
        </div>
        {analysis.actions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No defects recorded. The report will state that everything tested was
            satisfactory.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Priority</th>
                  <th className="px-3 py-2.5 font-semibold">Where</th>
                  <th className="px-3 py-2.5 font-semibold">What we found</th>
                  <th className="px-3 py-2.5 font-semibold">Recommended action</th>
                  <th className="px-5 py-2.5 font-semibold">By when</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analysis.actions.map((action) => (
                  <tr key={`${action.source}-${action.id}`} className={action.rectified ? "opacity-55" : ""}>
                    <td className="px-5 py-3 align-top">
                      <RiskBadge risk={action.risk} />
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {action.source}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-700">{action.where}</td>
                    <td className="px-3 py-3 align-top text-slate-700">{action.what}</td>
                    <td className="px-3 py-3 align-top text-slate-600">{action.action}</td>
                    <td className="px-5 py-3 align-top text-slate-600">
                      {action.rectified ? (
                        <span className="font-semibold text-emerald-700">
                          Completed on site
                        </span>
                      ) : (
                        action.timeframe
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">What the client reads</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              OptiLink drafts these from your findings. Edit them however you
              like — your wording is kept.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void regenerate()}
            disabled={regenerating}
          >
            {regenerating ? "Writing…" : "Draft from findings"}
          </button>
        </div>
        <div className="space-y-5 p-5">
          <TextArea
            label="Summary"
            rows={7}
            value={report.executiveSummary ?? ""}
            onChange={(value) => update({ executiveSummary: value })}
            placeholder="Press “Draft from findings” and OptiLink writes an opening summary for you."
          />
          <TextArea
            label="Recommendations"
            rows={7}
            value={report.recommendations ?? ""}
            onChange={(value) => update({ recommendations: value })}
          />
          <div>
            <TextArea
              label="Scope and limitations"
              rows={6}
              value={report.limitations ?? ""}
              onChange={(value) => update({ limitations: value })}
            />
            {!report.limitations?.trim() ? (
              <button
                type="button"
                className="btn-secondary mt-2 text-xs"
                onClick={() => update({ limitations: DEFAULT_LIMITATIONS })}
              >
                Use the standard wording
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Link href={`/reports/${report.id}/preview`} className="btn-primary">
          Preview &amp; print the report
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad";
}) {
  const classes =
    tone === "bad" && value > 0
      ? "bg-red-50 text-red-800 ring-red-200"
      : tone === "good"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${classes}`}>
      {value} <span className="font-normal opacity-75">{label}</span>
    </span>
  );
}
