import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  analyseReport,
  formatDate,
  reportInclude,
  type ReportAnalysis,
  type ReportFull,
} from "@/lib/report";
import { RISK_META, RISK_ORDER } from "@/lib/risk";
import { relevantGlossary } from "@/lib/glossary";
import { companyAddress, getSettings, type AppSettings } from "@/lib/settings";
import { thermalBandTable } from "@/lib/standards/thermal";
import { PrintBar } from "./PrintBar";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [report, settings] = await Promise.all([
    prisma.report.findUnique({ where: { id }, include: reportInclude }),
    getSettings(),
  ]);
  if (!report) notFound();

  const analysis = analyseReport(report);

  return (
    <>
      <PrintBar reportId={report.id} reference={report.reference} />
      <div className="bg-slate-100 px-4 py-6 print:bg-white print:p-0">
        <article className="report-sheet print-full mx-auto max-w-[210mm] bg-white p-8 shadow-sm sm:p-12 print:shadow-none">
          <Cover report={report} settings={settings} analysis={analysis} />
          <HowToRead />
          <Summary report={report} analysis={analysis} settings={settings} />
          <PriorityActions analysis={analysis} />
          {report.includeThermal && analysis.thermal.length > 0 ? (
            <ThermalSection report={report} analysis={analysis} />
          ) : null}
          {report.includeRcd && analysis.rcd.length > 0 ? (
            <RcdSection analysis={analysis} />
          ) : null}
          {report.includeObservations && report.observations.length > 0 ? (
            <ObservationsSection report={report} />
          ) : null}
          {report.includePhotos && report.photos.length > 0 ? (
            <PhotosSection report={report} />
          ) : null}
          <ClosingSection report={report} settings={settings} />
          {report.includeGlossary ? <Glossary report={report} analysis={analysis} /> : null}
        </article>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Cover({
  report,
  settings,
  analysis,
}: {
  report: ReportFull;
  settings: AppSettings;
  analysis: ReportAnalysis;
}) {
  const risk = analysis.overallRisk;
  return (
    <header className="avoid-break">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b-4 pb-6" style={{ borderColor: "var(--brand)" }}>
        <div>
          {settings.logoFileId ? (
            <Image
              src={`/api/files/${settings.logoFileId}`}
              alt={settings.companyName}
              width={400}
              height={140}
              className="h-16 w-auto max-w-[220px] object-contain object-left"
            />
          ) : (
            <p className="text-2xl font-bold" style={{ color: "var(--brand)" }}>
              {settings.companyName}
            </p>
          )}
          <div className="mt-3 text-xs leading-relaxed text-slate-500">
            {settings.licenceNumber ? <p>Electrical licence {settings.licenceNumber}</p> : null}
            {settings.abn ? <p>ABN {settings.abn}</p> : null}
            {companyAddress(settings) ? <p>{companyAddress(settings)}</p> : null}
            <p>
              {[settings.phone, settings.email].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p className="font-mono text-sm font-semibold text-slate-900">
            {report.reference}
          </p>
          <p className="mt-1">
            Inspected {formatDate(report.inspectionDate) || "—"}
          </p>
          {report.issuedDate ? <p>Issued {formatDate(report.issuedDate)}</p> : null}
        </div>
      </div>

      <h1 className="mt-8 text-3xl font-bold leading-tight">{report.title}</h1>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <Detail label="Prepared for" value={report.client?.name} />
        <Detail label="Site" value={report.siteName} />
        <Detail label="Address" value={report.siteAddress} span />
        <Detail label="Inspected by" value={report.technicianName} />
        <Detail
          label="Licence"
          value={report.technicianLicence ?? settings.licenceNumber}
        />
        <Detail label="Site contact" value={report.siteContact} />
        <Detail
          label="Conditions"
          value={[
            report.ambientTempC !== null ? `Ambient ${report.ambientTempC} °C` : null,
            report.weatherNotes,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </dl>

      {risk ? (
        <div
          className="mt-8 rounded-xl p-5"
          style={{
            background: `${RISK_META[risk].hex}12`,
            border: `2px solid ${RISK_META[risk].hex}`,
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold text-white"
              style={{ background: RISK_META[risk].hex }}
            >
              {RISK_META[risk].label}
            </span>
            <span className="text-sm font-semibold text-slate-900">
              Overall result of this inspection
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            {RISK_META[risk].clientMeaning}
          </p>
        </div>
      ) : null}
    </header>
  );
}

function Detail({
  label,
  value,
  span,
}: {
  label: string;
  value?: string | null;
  span?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={span ? "col-span-2" : ""}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-4 mt-10 border-b border-slate-200 pb-2">
      <h2 className="text-lg font-bold">{children}</h2>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

function HowToRead() {
  return (
    <section className="avoid-break">
      <SectionTitle note="Every item in this report carries one of these five ratings, so you can see at a glance what needs doing and by when.">
        How to read this report
      </SectionTitle>
      <div className="grid gap-2">
        {RISK_ORDER.map((level) => {
          const meta = RISK_META[level];
          return (
            <div
              key={level}
              className="flex gap-3 rounded-lg border border-slate-200 p-3"
              style={{ borderLeft: `4px solid ${meta.hex}` }}
            >
              <div className="w-28 shrink-0">
                <p className="text-sm font-bold" style={{ color: meta.hex }}>
                  {meta.label}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {meta.timeframe}
                </p>
              </div>
              <p className="text-sm text-slate-600">{meta.clientMeaning}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Summary({
  report,
  analysis,
  settings,
}: {
  report: ReportFull;
  analysis: ReportAnalysis;
  settings: AppSettings;
}) {
  const summary = report.executiveSummary?.trim();
  return (
    <section>
      <SectionTitle>Summary</SectionTitle>
      {settings.reportIntroText?.trim() ? (
        <Paragraphs text={settings.reportIntroText} className="text-slate-500" />
      ) : null}
      {summary ? (
        <Paragraphs text={summary} />
      ) : (
        <p className="text-sm italic text-slate-400">
          No summary has been written for this report yet.
        </p>
      )}

      {report.scopeOfWork?.trim() ? (
        <>
          <h3 className="mt-6 text-sm font-bold uppercase tracking-wide">
            What we were asked to do
          </h3>
          <Paragraphs text={report.scopeOfWork} />
        </>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Thermal points scanned" value={analysis.thermalScanned} />
        <Metric label="Hot spots found" value={analysis.thermalAnomalies} />
        <Metric label="Safety switches tested" value={analysis.rcdTested} />
        <Metric
          label="Safety switches failed"
          value={analysis.rcdFailed}
          alarming={analysis.rcdFailed > 0}
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  alarming,
}: {
  label: string;
  value: number;
  alarming?: boolean;
}) {
  return (
    <div
      className="rounded-lg border p-3 text-center"
      style={{
        borderColor: alarming ? RISK_META.CRITICAL.hex : "#e2e8f0",
        background: alarming ? `${RISK_META.CRITICAL.hex}0d` : "#f8fafc",
      }}
    >
      <p
        className="text-2xl font-bold"
        style={{ color: alarming ? RISK_META.CRITICAL.hex : "var(--brand)" }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}

function PriorityActions({ analysis }: { analysis: ReportAnalysis }) {
  if (analysis.actions.length === 0) {
    return (
      <section className="avoid-break">
        <SectionTitle>Priority actions</SectionTitle>
        <p
          className="rounded-lg p-4 text-sm"
          style={{
            background: `${RISK_META.INFO.hex}12`,
            border: `1px solid ${RISK_META.INFO.hex}`,
          }}
        >
          No defects were identified during this inspection. Everything tested
          was found to be in good working order, and no remedial work is
          required at this time.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle note="Listed most urgent first. The detail behind each item follows in the sections below.">
        Priority actions
      </SectionTitle>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr style={{ background: "var(--brand)" }} className="text-white">
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">
              Priority
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">
              Where
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">
              What we found
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">
              What we recommend
            </th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">
              By when
            </th>
          </tr>
        </thead>
        <tbody>
          {analysis.actions.map((action) => {
            const meta = RISK_META[action.risk];
            return (
              <tr key={`${action.source}-${action.id}`} className="avoid-break align-top">
                <td className="border border-slate-300 px-2 py-2">
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: meta.hex }}
                  >
                    {meta.label}
                  </span>
                  <span className="mt-1 block text-[9px] uppercase tracking-wide text-slate-400">
                    {action.source}
                  </span>
                </td>
                <td className="border border-slate-300 px-2 py-2">{action.where}</td>
                <td className="border border-slate-300 px-2 py-2">{action.what}</td>
                <td className="border border-slate-300 px-2 py-2">{action.action}</td>
                <td className="border border-slate-300 px-2 py-2 font-medium">
                  {action.rectified ? "Completed on site" : action.timeframe}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ThermalSection({
  report,
  analysis,
}: {
  report: ReportFull;
  analysis: ReportAnalysis;
}) {
  return (
    <section className="page-break">
      <SectionTitle note="A thermal camera shows heat that is invisible to the eye. Electrical faults get hot long before they fail, so this survey finds problems while they are still cheap to fix.">
        Thermographic survey
      </SectionTitle>

      {report.equipmentUsed?.trim() ? (
        <p className="mb-4 text-xs text-slate-500">
          <span className="font-semibold">Equipment: </span>
          {report.equipmentUsed}
        </p>
      ) : null}

      <div className="space-y-5">
        {analysis.thermal.map(({ finding, assessment }, index) => {
          const risk = assessment.risk ?? "INFO";
          const meta = RISK_META[risk];
          return (
            <div
              key={finding.id}
              className="avoid-break rounded-lg border border-slate-200"
              style={{ borderLeft: `4px solid ${meta.hex}` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <div>
                  <p className="text-sm font-bold">
                    {index + 1}. {finding.component?.trim() || "Thermal finding"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {finding.location?.trim() || "Location not recorded"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {finding.rectifiedOnSite ? (
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-300">
                      Fixed on site
                    </span>
                  ) : null}
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ background: meta.hex }}
                  >
                    {meta.label}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {finding.thermalImageId ? (
                  <figure>
                    <Image
                      src={`/api/files/${finding.thermalImageId}`}
                      alt="Thermal image"
                      width={800}
                      height={600}
                      className="w-full rounded border border-slate-200 object-contain"
                    />
                    <figcaption className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                      Thermal image
                    </figcaption>
                  </figure>
                ) : null}
                {finding.visualImageId ? (
                  <figure>
                    <Image
                      src={`/api/files/${finding.visualImageId}`}
                      alt="Photograph of the same location"
                      width={800}
                      height={600}
                      className="w-full rounded border border-slate-200 object-contain"
                    />
                    <figcaption className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                      Same location, normal photo
                    </figcaption>
                  </figure>
                ) : null}
              </div>

              <div className="px-4 pb-4">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    <Row
                      label="Measured temperature"
                      value={finding.measuredTempC !== null ? `${finding.measuredTempC} °C` : "—"}
                    />
                    <Row
                      label={
                        finding.basis === "AMBIENT"
                          ? "Ambient air temperature"
                          : "Equivalent component"
                      }
                      value={
                        finding.referenceTempC !== null ? `${finding.referenceTempC} °C` : "—"
                      }
                    />
                    <Row
                      label="Temperature rise (ΔT)"
                      value={assessment.deltaT !== null ? `${assessment.deltaT} °C` : "—"}
                      strong
                    />
                    {finding.loadAmps !== null ? (
                      <Row label="Load at time of scan" value={`${finding.loadAmps} A`} />
                    ) : null}
                    {finding.emissivity !== null ? (
                      <Row label="Emissivity setting" value={String(finding.emissivity)} />
                    ) : null}
                    {assessment.band ? (
                      <Row label="Classification" value={assessment.band.classification} />
                    ) : null}
                  </tbody>
                </table>

                {finding.findings?.trim() ? (
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">What we found: </span>
                    {finding.findings}
                  </p>
                ) : null}

                <div
                  className="mt-3 rounded p-3 text-sm leading-relaxed"
                  style={{ background: `${meta.hex}0f` }}
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.hex }}>
                    What this means for you
                  </p>
                  <p className="text-slate-700">
                    {finding.clientExplanation?.trim() ||
                      assessment.band?.plainEnglish ||
                      "This point was recorded during the survey."}
                  </p>
                </div>

                <p className="mt-3 text-sm">
                  <span className="font-semibold">Recommended action: </span>
                  {finding.recommendedAction?.trim() ||
                    assessment.band?.suggestedAction ||
                    "No action required."}
                  {assessment.band && !finding.rectifiedOnSite ? (
                    <span className="text-slate-500"> ({assessment.band.timeframe}.)</span>
                  ) : null}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="avoid-break mt-6 rounded-lg bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          How we grade a hot spot
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Severity is based on how much hotter a component is than its reference
          — an equivalent part doing the same job, or the surrounding air.
        </p>
        <table className="mt-3 w-full border-collapse text-[11px]">
          <tbody>
            {thermalBandTable("SIMILAR_COMPONENT").map((band) => (
              <tr key={band.range}>
                <td className="border border-slate-200 px-2 py-1 font-mono">{band.range}</td>
                <td
                  className="border border-slate-200 px-2 py-1 font-semibold"
                  style={{ color: RISK_META[band.risk].hex }}
                >
                  {RISK_META[band.risk].label}
                </td>
                <td className="border border-slate-200 px-2 py-1 text-slate-600">
                  {band.timeframe}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr>
      <td className="w-1/2 border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
        {label}
      </td>
      <td
        className={`border border-slate-200 px-2 py-1 ${strong ? "font-bold" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

function RcdSection({ analysis }: { analysis: ReportAnalysis }) {
  const failures = analysis.rcd.filter(({ assessment }) => assessment.pass === false);
  return (
    <section className="page-break">
      <SectionTitle note="A safety switch (RCD) cuts the power in a fraction of a second if electricity starts flowing somewhere it should not — for example through a person. AS/NZS 3017 sets the maximum time each type is allowed to take.">
        Safety switch (RCD) testing
      </SectionTitle>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr style={{ background: "var(--brand)" }} className="text-white">
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">Board</th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">Circuit</th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">Device</th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">At I∆n</th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">At 5 × I∆n</th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">Ramp</th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">Button</th>
            <th className="border border-slate-300 px-2 py-2 text-left font-semibold">Result</th>
          </tr>
        </thead>
        <tbody>
          {analysis.rcd.map(({ test, assessment }) => (
            <tr key={test.id} className="avoid-break align-top">
              <td className="border border-slate-300 px-2 py-1.5">{test.boardName ?? "—"}</td>
              <td className="border border-slate-300 px-2 py-1.5">
                {test.circuitDescription ?? "—"}
              </td>
              <td className="border border-slate-300 px-2 py-1.5">
                {test.ratedCurrentMa} mA
                <span className="block text-[9px] text-slate-500">
                  {[test.make, test.poles].filter(Boolean).join(" ") || assessment.limits.kindLabel}
                </span>
              </td>
              <td className="border border-slate-300 px-2 py-1.5 font-mono">
                {test.tripTimeRatedMs !== null ? `${test.tripTimeRatedMs} ms` : "—"}
                <span className="block text-[9px] text-slate-500">
                  ≤ {assessment.limits.maxAtRatedMs} ms
                </span>
              </td>
              <td className="border border-slate-300 px-2 py-1.5 font-mono">
                {test.tripTime5xMs !== null ? `${test.tripTime5xMs} ms` : "—"}
                {assessment.limits.maxAt5xMs ? (
                  <span className="block text-[9px] text-slate-500">
                    ≤ {assessment.limits.maxAt5xMs} ms
                  </span>
                ) : null}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 font-mono">
                {test.rampTripMa !== null ? `${test.rampTripMa} mA` : "—"}
              </td>
              <td className="border border-slate-300 px-2 py-1.5">
                {test.pushButtonOk === null ? "—" : test.pushButtonOk ? "OK" : "Failed"}
              </td>
              <td
                className="border border-slate-300 px-2 py-1.5 font-bold"
                style={{
                  color:
                    assessment.pass === false
                      ? RISK_META.CRITICAL.hex
                      : assessment.pass === true
                        ? RISK_META.INFO.hex
                        : "#94a3b8",
                }}
              >
                {assessment.pass === null ? "Not tested" : assessment.pass ? "Pass" : "Fail"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {failures.length > 0 ? (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide">
            What the failures mean
          </h3>
          {failures.map(({ test, assessment }) => (
            <div
              key={test.id}
              className="avoid-break rounded-lg p-3"
              style={{
                background: `${RISK_META.CRITICAL.hex}0f`,
                borderLeft: `4px solid ${RISK_META.CRITICAL.hex}`,
              }}
            >
              <p className="text-sm font-semibold">
                {[test.boardName, test.circuitDescription].filter(Boolean).join(" — ") ||
                  "Safety switch"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                {assessment.plainEnglish}
              </p>
              {test.notes?.trim() ? (
                <p className="mt-1 text-xs text-slate-600">{test.notes}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p
          className="mt-4 rounded-lg p-3 text-sm"
          style={{ background: `${RISK_META.INFO.hex}12` }}
        >
          Every safety switch tested cut the power well within the time allowed
          by AS/NZS 3017. We recommend you press the test button on each one
          every three months to keep them working — it only takes a minute.
        </p>
      )}
    </section>
  );
}

function ObservationsSection({ report }: { report: ReportFull }) {
  return (
    <section>
      <SectionTitle note="Other things we noticed while we were on site.">
        Visual observations
      </SectionTitle>
      <div className="space-y-4">
        {report.observations.map((observation, index) => {
          const meta = RISK_META[observation.riskLevel];
          return (
            <div
              key={observation.id}
              className="avoid-break rounded-lg border border-slate-200"
              style={{ borderLeft: `4px solid ${meta.hex}` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                <p className="text-sm font-bold">
                  {index + 1}. {observation.location?.trim() || "Observation"}
                </p>
                <div className="flex items-center gap-2">
                  {observation.rectifiedOnSite ? (
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-300">
                      Fixed on site
                    </span>
                  ) : null}
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ background: meta.hex }}
                  >
                    {meta.label}
                  </span>
                </div>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-[1fr_180px]">
                <div>
                  {observation.description?.trim() ? (
                    <p className="text-sm">{observation.description}</p>
                  ) : null}
                  {observation.clientExplanation?.trim() ? (
                    <div
                      className="mt-2 rounded p-2.5 text-sm leading-relaxed"
                      style={{ background: `${meta.hex}0f` }}
                    >
                      <p
                        className="mb-1 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: meta.hex }}
                      >
                        What this means for you
                      </p>
                      {observation.clientExplanation}
                    </div>
                  ) : null}
                  {observation.recommendedAction?.trim() ? (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">Recommended action: </span>
                      {observation.recommendedAction}
                      <span className="text-slate-500"> ({meta.timeframe}.)</span>
                    </p>
                  ) : null}
                  {observation.clauseReference?.trim() ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Reference: {observation.clauseReference}
                    </p>
                  ) : null}
                </div>
                {observation.photoId ? (
                  <Image
                    src={`/api/files/${observation.photoId}`}
                    alt="Observation photo"
                    width={480}
                    height={360}
                    className="w-full rounded border border-slate-200 object-cover"
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PhotosSection({ report }: { report: ReportFull }) {
  const pairs = new Map<
    string,
    { before?: ReportFull["photos"][number]; after?: ReportFull["photos"][number] }
  >();
  for (const photo of report.photos) {
    if (photo.kind === "GENERAL" || !photo.pairKey) continue;
    const entry = pairs.get(photo.pairKey) ?? {};
    if (photo.kind === "BEFORE") entry.before = photo;
    if (photo.kind === "AFTER") entry.after = photo;
    pairs.set(photo.pairKey, entry);
  }
  const general = report.photos.filter((photo) => photo.kind === "GENERAL");
  const pairList = [...pairs.values()].filter((pair) => pair.before || pair.after);

  if (pairList.length === 0 && general.length === 0) return null;

  return (
    <section className="page-break">
      <SectionTitle>Photographic record</SectionTitle>

      {pairList.length > 0 ? (
        <div className="space-y-5">
          {pairList.map((pair, index) => {
            const host = pair.before ?? pair.after!;
            return (
              <div key={index} className="avoid-break rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-bold">
                  {host.title?.trim() || "Before and after"}
                </p>
                {host.location?.trim() ? (
                  <p className="text-xs text-slate-500">{host.location}</p>
                ) : null}
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {(["before", "after"] as const).map((key) => {
                    const photo = pair[key];
                    if (!photo) return null;
                    return (
                      <figure key={key}>
                        <Image
                          src={`/api/files/${photo.fileId}`}
                          alt={key}
                          width={800}
                          height={600}
                          className="w-full rounded border border-slate-200 object-cover"
                        />
                        <figcaption className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {key}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
                {host.caption?.trim() ? (
                  <p className="mt-2 text-sm text-slate-600">{host.caption}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {general.length > 0 ? (
        <div className="avoid-break mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {general.map((photo) => (
            <figure key={photo.id}>
              <Image
                src={`/api/files/${photo.fileId}`}
                alt={photo.caption ?? "Site photo"}
                width={480}
                height={360}
                className="aspect-4/3 w-full rounded border border-slate-200 object-cover"
              />
              {photo.caption?.trim() ? (
                <figcaption className="mt-1 text-[10px] text-slate-500">
                  {photo.caption}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ClosingSection({
  report,
  settings,
}: {
  report: ReportFull;
  settings: AppSettings;
}) {
  return (
    <section>
      {report.recommendations?.trim() ? (
        <>
          <SectionTitle>Recommendations</SectionTitle>
          <Paragraphs text={report.recommendations} />
        </>
      ) : null}

      {report.limitations?.trim() ? (
        <>
          <SectionTitle>Scope and limitations</SectionTitle>
          <Paragraphs text={report.limitations} className="text-xs text-slate-500" />
        </>
      ) : null}

      <div className="avoid-break mt-8 rounded-lg border border-slate-200 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Inspected and reported by
            </p>
            {(() => {
              const technician =
                report.technicianName || settings.defaultTechnicianName || null;
              const licence = report.technicianLicence || settings.licenceNumber;
              return (
                <>
                  <p className="mt-1 text-sm font-semibold">
                    {technician ?? settings.companyName}
                  </p>
                  {licence ? (
                    <p className="text-xs text-slate-500">Electrical licence {licence}</p>
                  ) : null}
                  {technician ? (
                    <p className="text-xs text-slate-500">{settings.companyName}</p>
                  ) : null}
                </>
              );
            })()}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Questions about this report?
            </p>
            <p className="mt-1 text-sm">
              {[settings.phone, settings.email].filter(Boolean).join(" · ") ||
                "Contact us any time."}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              We are happy to walk you through anything in here — there is no
              such thing as a silly question when it comes to electrical safety.
            </p>
          </div>
        </div>
      </div>

      {settings.reportFooterText?.trim() ? (
        <p className="mt-6 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
          {settings.reportFooterText}
        </p>
      ) : null}
    </section>
  );
}

function Glossary({
  report,
  analysis,
}: {
  report: ReportFull;
  analysis: ReportAnalysis;
}) {
  const haystack = [
    report.title,
    report.executiveSummary,
    report.recommendations,
    report.scopeOfWork,
    ...analysis.actions.map((action) => `${action.what} ${action.where} ${action.action}`),
    ...(analysis.thermal.length > 0 ? ["thermal delta emissivity hot spot"] : []),
    ...(analysis.rcd.length > 0 ? ["rcd safety switch trip time ramp i∆n"] : []),
  ]
    .filter(Boolean)
    .join(" ");

  const entries = relevantGlossary(haystack);
  if (entries.length === 0) return null;

  return (
    <section className="page-break">
      <SectionTitle note="Plain-English explanations of the terms used in this report.">
        What the words mean
      </SectionTitle>
      <dl className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.term} className="avoid-break">
            <dt className="text-sm font-bold" style={{ color: "var(--brand)" }}>
              {entry.term}
            </dt>
            <dd className="text-sm leading-relaxed text-slate-600">{entry.definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className ?? "text-slate-700"}`}>
      {text
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, index) => (
          <p key={index} className="whitespace-pre-line">
            {block}
          </p>
        ))}
    </div>
  );
}
