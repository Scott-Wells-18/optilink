"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { ReportStatus } from "@prisma/client";
import { analyseReport, type ReportFull } from "@/lib/report";
import { RISK_META } from "@/lib/risk";
import { SaveIndicator, sendPatch, useDebouncedPatch } from "@/components/saving";
import { STATUS_META } from "@/components/StatusPill";
import { RiskBadge } from "@/components/RiskBadge";
import type { ClientOption } from "./types";
import { DetailsTab } from "./DetailsTab";
import { ThermalTab } from "./ThermalTab";
import { RcdTab } from "./RcdTab";
import { ObservationsTab } from "./ObservationsTab";
import { PhotosTab } from "./PhotosTab";
import { SummaryTab } from "./SummaryTab";

const TABS = [
  { key: "details", label: "Details" },
  { key: "thermal", label: "Thermal survey" },
  { key: "rcd", label: "RCD testing" },
  { key: "observations", label: "Observations" },
  { key: "photos", label: "Before & after" },
  { key: "summary", label: "Summary" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ReportEditor({
  initialReport,
  clients,
  defaults,
}: {
  initialReport: ReportFull;
  clients: ClientOption[];
  defaults: { technicianName: string | null; technicianLicence: string | null };
}) {
  const router = useRouter();
  const [report, setReportState] = useState<ReportFull>(initialReport);
  const [tab, setTab] = useState<TabKey>("details");
  const { patch, flush } = useDebouncedPatch(`/api/reports/${report.id}`);

  const setReport = useCallback(
    (updater: (current: ReportFull) => ReportFull) => setReportState(updater),
    [],
  );

  const analysis = useMemo(() => analyseReport(report), [report]);

  const counts: Record<TabKey, number | null> = {
    details: null,
    thermal: report.thermalFindings.length,
    rcd: report.rcdTests.length,
    observations: report.observations.length,
    photos: report.photos.length,
    summary: null,
  };

  async function changeStatus(status: ReportStatus) {
    await flush();
    setReportState((current) => ({ ...current, status }));
    await sendPatch(`/api/reports/${report.id}`, { status });
    router.refresh();
  }

  async function deleteReport() {
    if (
      !window.confirm(
        `Delete ${report.reference}? This removes the report and everything in it, and cannot be undone.`,
      )
    ) {
      return;
    }
    const response = await sendPatch(`/api/reports/${report.id}`, null, "DELETE");
    if (response) router.push("/reports");
  }

  const tabProps = { report, setReport, patchReport: patch };

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 pt-4 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Link href="/reports" className="hover:text-slate-900">
                  Reports
                </Link>
                <span>/</span>
                <span className="font-mono">{report.reference}</span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold text-slate-900">
                {report.client?.name ?? report.siteName ?? "New report"}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{report.title}</span>
                {analysis.overallRisk ? (
                  <RiskBadge risk={analysis.overallRisk} />
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SaveIndicator />
              <Link
                href={`/reports/${report.id}/preview`}
                className="btn-secondary"
                onClick={() => void flush()}
              >
                Preview &amp; print
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(Object.keys(STATUS_META) as ReportStatus[]).map((status) => {
              const active = report.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => void changeStatus(status)}
                  title={STATUS_META[status].description}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? STATUS_META[status].className
                      : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {STATUS_META[status].label}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-slate-400">
              {analysis.actions.filter((action) => !action.rectified).length} open{" "}
              {analysis.actions.filter((action) => !action.rectified).length === 1
                ? "item"
                : "items"}
            </span>
          </div>

          <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((entry) => {
              const active = tab === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${
                    active
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {entry.label}
                  {counts[entry.key] ? (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {counts[entry.key]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
        {tab === "details" ? (
          <DetailsTab {...tabProps} clients={clients} defaults={defaults} />
        ) : null}
        {tab === "thermal" ? <ThermalTab {...tabProps} /> : null}
        {tab === "rcd" ? <RcdTab {...tabProps} /> : null}
        {tab === "observations" ? <ObservationsTab {...tabProps} /> : null}
        {tab === "photos" ? <PhotosTab {...tabProps} /> : null}
        {tab === "summary" ? <SummaryTab {...tabProps} analysis={analysis} /> : null}

        <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-5">
          <p className="text-xs text-slate-400">
            Everything on this page saves as you type. You can close it and come
            back whenever you like.
          </p>
          <button type="button" onClick={() => void deleteReport()} className="btn-danger text-xs">
            Delete report
          </button>
        </div>
      </div>
    </>
  );
}

export function OverallRiskNote({ risk }: { risk: keyof typeof RISK_META }) {
  return <p className="text-sm text-slate-600">{RISK_META[risk].clientMeaning}</p>;
}
