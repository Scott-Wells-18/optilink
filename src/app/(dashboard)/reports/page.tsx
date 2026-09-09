import Link from "next/link";
import type { Prisma, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { analyseReport, formatShortDate, reportInclude } from "@/lib/report";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { NewReportButton } from "@/components/NewReportButton";
import { StatusPill, STATUS_META } from "@/components/StatusPill";
import { RiskBadge } from "@/components/RiskBadge";

export const dynamic = "force-dynamic";

const STATUSES: ReportStatus[] = ["DRAFT", "IN_REVIEW", "ISSUED"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; client?: string }>;
}) {
  const { status, q, client } = await searchParams;
  const activeStatus = STATUSES.includes(status as ReportStatus)
    ? (status as ReportStatus)
    : undefined;

  const where: Prisma.ReportWhereInput = {
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(client ? { clientId: client } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { siteName: { contains: q, mode: "insensitive" } },
            { siteAddress: { contains: q, mode: "insensitive" } },
            { client: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const reports = await prisma.report.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: reportInclude,
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${reports.length} ${reports.length === 1 ? "report" : "reports"}${activeStatus ? ` · ${STATUS_META[activeStatus].label}` : ""}`}
        actions={<NewReportButton />}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip href="/reports" label="All" active={!activeStatus} />
            {STATUSES.map((value) => (
              <FilterChip
                key={value}
                href={`/reports?status=${value}`}
                label={STATUS_META[value].label}
                active={activeStatus === value}
              />
            ))}
          </div>
          <form action="/reports" className="ml-auto flex gap-2">
            {activeStatus ? <input type="hidden" name="status" value={activeStatus} /> : null}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search reference, client or site…"
              className="field w-64"
            />
            <button type="submit" className="btn-secondary">
              Search
            </button>
          </form>
        </div>

        {reports.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description={
              q
                ? "No reports matched that search. Try a different reference, client or address."
                : "Start a report and it will show up here, along with everything you have on the go."
            }
            action={<NewReportButton />}
          />
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {reports.map((report) => {
                const analysis = analyseReport(report);
                return (
                  <li key={report.id}>
                    <Link
                      href={`/reports/${report.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">
                            {report.client?.name ?? report.siteName ?? "Unassigned report"}
                          </span>
                          <StatusPill status={report.status} />
                          {analysis.overallRisk ? (
                            <RiskBadge risk={analysis.overallRisk} />
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {report.reference} · {report.title}
                          {report.siteAddress ? ` · ${report.siteAddress}` : ""}
                        </span>
                      </span>
                      <span className="text-right text-xs text-slate-500">
                        <span className="block">
                          {report.inspectionDate
                            ? formatShortDate(report.inspectionDate)
                            : "No date set"}
                        </span>
                        <span className="block text-slate-400">
                          {analysis.thermalScanned} thermal · {analysis.rcd.length} RCD ·{" "}
                          {analysis.observationCount} obs
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
  );
}
