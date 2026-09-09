import Link from "next/link";
import { prisma } from "@/lib/db";
import { analyseReport, formatShortDate, reportInclude } from "@/lib/report";
import { RISK_META, RISK_ORDER } from "@/lib/risk";
import { getSettings } from "@/lib/settings";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { NewReportButton } from "@/components/NewReportButton";
import { StatusPill } from "@/components/StatusPill";
import { RiskBadge } from "@/components/RiskBadge";
import type { RiskLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [settings, reports, clientCount, statusCounts] = await Promise.all([
    getSettings(),
    prisma.report.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: reportInclude,
    }),
    prisma.client.count({ where: { archived: false } }),
    prisma.report.groupBy({ by: ["status"], _count: true }),
  ]);

  const analyses = reports.map((report) => ({
    report,
    analysis: analyseReport(report),
  }));

  // Outstanding actions across everything that has not been signed off.
  const openReports = await prisma.report.findMany({
    where: { status: { not: "ISSUED" } },
    include: reportInclude,
  });
  const openActions = openReports.flatMap((report) =>
    analyseReport(report)
      .actions.filter((action) => !action.rectified)
      .map((action) => ({ ...action, report })),
  );
  const urgent = openActions.filter(
    (action) => action.risk === "CRITICAL" || action.risk === "HIGH",
  );

  const totalByStatus = Object.fromEntries(
    statusCounts.map((row) => [row.status, row._count]),
  ) as Record<string, number>;

  const setupNeeded = !settings.logoFileId || !settings.abn || !settings.licenceNumber;

  return (
    <>
      <PageHeader
        title={`Welcome back${settings.defaultTechnicianName ? `, ${settings.defaultTechnicianName.split(" ")[0]}` : ""}`}
        subtitle="Everything you have on the go, and what still needs attention."
        actions={<NewReportButton />}
      />

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 sm:px-8">
        {setupNeeded ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Finish setting up your branding
              </p>
              <p className="mt-0.5 text-sm text-amber-800">
                Add your logo, ABN and licence number so they appear on every
                report you send out.
              </p>
            </div>
            <Link href="/settings" className="btn-secondary">
              Open settings
            </Link>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Drafts" value={totalByStatus.DRAFT ?? 0} href="/reports?status=DRAFT" />
          <StatCard
            label="In review"
            value={totalByStatus.IN_REVIEW ?? 0}
            href="/reports?status=IN_REVIEW"
          />
          <StatCard
            label="Issued"
            value={totalByStatus.ISSUED ?? 0}
            href="/reports?status=ISSUED"
          />
          <StatCard label="Clients" value={clientCount} href="/clients" />
        </div>

        {urgent.length > 0 ? (
          <section className="card overflow-hidden">
            <div className="card-header">
              <div>
                <h2 className="card-title">Needs attention</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Critical and high-priority findings on reports that have not
                  been issued yet.
                </p>
              </div>
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                {urgent.length} open
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {urgent.slice(0, 6).map((action) => (
                <li key={`${action.report.id}-${action.id}`}>
                  <Link
                    href={`/reports/${action.report.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                  >
                    <RiskBadge risk={action.risk} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {action.what}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {action.where} · {action.report.reference}
                        {action.report.client ? ` · ${action.report.client.name}` : ""}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      {action.timeframe}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Recent reports</h2>
            <Link href="/reports" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              View all
            </Link>
          </div>

          {analyses.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No reports yet"
                description="Start a report, upload your thermal images and RCD results, and OptiLink will turn them into something your client can actually understand."
                action={<NewReportButton />}
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {analyses.map(({ report, analysis }) => (
                <li key={report.id}>
                  <Link
                    href={`/reports/${report.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {report.client?.name ?? report.siteName ?? "Unassigned report"}
                        </span>
                        <StatusPill status={report.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {report.reference} · {report.title}
                        {report.inspectionDate
                          ? ` · ${formatShortDate(report.inspectionDate)}`
                          : ""}
                      </span>
                    </span>
                    <RiskSummary counts={analysis.counts} overall={analysis.overallRisk} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="card px-5 py-4 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </Link>
  );
}

function RiskSummary({
  counts,
  overall,
}: {
  counts: Record<RiskLevel, number>;
  overall: RiskLevel | null;
}) {
  const active = RISK_ORDER.filter((level) => level !== "INFO" && counts[level] > 0);
  if (active.length === 0) {
    return overall ? <RiskBadge risk={overall} /> : null;
  }
  return (
    <span className="flex items-center gap-1.5">
      {active.map((level) => (
        <span
          key={level}
          title={`${counts[level]} × ${RISK_META[level].label}`}
          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${RISK_META[level].badge}`}
        >
          {counts[level]}
        </span>
      ))}
    </span>
  );
}
