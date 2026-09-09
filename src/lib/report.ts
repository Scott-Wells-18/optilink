import type { Prisma, RiskLevel } from "@prisma/client";
import { assessRcd, type RcdAssessment } from "@/lib/standards/rcd";
import { assessThermal, type ThermalAssessment } from "@/lib/standards/thermal";
import { highestRisk, RISK_META, riskRank, RISK_ORDER } from "@/lib/risk";

export const reportInclude = {
  client: true,
  thermalFindings: {
    orderBy: { sortOrder: "asc" },
    include: { thermalImage: true, visualImage: true },
  },
  rcdTests: { orderBy: { sortOrder: "asc" } },
  observations: { orderBy: { sortOrder: "asc" }, include: { photo: true } },
  photos: { orderBy: { sortOrder: "asc" }, include: { file: true } },
} satisfies Prisma.ReportInclude;

export type ReportFull = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

export type PriorityAction = {
  id: string;
  risk: RiskLevel;
  timeframe: string;
  what: string;
  where: string;
  action: string;
  source: "Thermal survey" | "RCD testing" | "Visual inspection";
  rectified: boolean;
};

export type ReportAnalysis = {
  thermal: Array<{ finding: ReportFull["thermalFindings"][number]; assessment: ThermalAssessment }>;
  rcd: Array<{ test: ReportFull["rcdTests"][number]; assessment: RcdAssessment }>;
  actions: PriorityAction[];
  counts: Record<RiskLevel, number>;
  overallRisk: RiskLevel | null;
  overallOverridden: boolean;
  rcdTested: number;
  rcdPassed: number;
  rcdFailed: number;
  thermalScanned: number;
  thermalAnomalies: number;
  observationCount: number;
  hasAnyContent: boolean;
};

export function analyseReport(report: ReportFull): ReportAnalysis {
  const thermal = report.thermalFindings.map((finding) => ({
    finding,
    assessment: assessThermal({
      basis: finding.basis,
      measuredTempC: finding.measuredTempC,
      referenceTempC: finding.referenceTempC,
      severityOverride: finding.severityOverride,
    }),
  }));

  const rcd = report.rcdTests.map((test) => ({
    test,
    assessment: assessRcd({
      rcdKind: test.rcdKind,
      ratedCurrentMa: test.ratedCurrentMa,
      tripTimeRatedMs: test.tripTimeRatedMs,
      tripTime5xMs: test.tripTime5xMs,
      rampTripMa: test.rampTripMa,
      pushButtonOk: test.pushButtonOk,
      notRequired: test.notRequired,
      resultOverride: test.resultOverride,
    }),
  }));

  const actions: PriorityAction[] = [];

  for (const { finding, assessment } of thermal) {
    const risk = assessment.risk;
    if (!risk || risk === "INFO") continue;
    actions.push({
      id: finding.id,
      risk,
      timeframe: assessment.band?.timeframe ?? RISK_META[risk].timeframe,
      what:
        finding.component?.trim() ||
        (assessment.deltaT !== null
          ? `Hot spot ${assessment.deltaT} °C above reference`
          : "Thermal anomaly"),
      where: finding.location?.trim() || "Location not recorded",
      action:
        finding.recommendedAction?.trim() ||
        assessment.band?.suggestedAction ||
        "Investigate and rectify.",
      source: "Thermal survey",
      rectified: finding.rectifiedOnSite,
    });
  }

  for (const { test, assessment } of rcd) {
    if (assessment.pass !== false) continue;
    actions.push({
      id: test.id,
      risk: "CRITICAL",
      timeframe: "Immediately",
      what: `Failed RCD — ${test.ratedCurrentMa} mA ${assessment.limits.kindLabel}`,
      where:
        [test.boardName?.trim(), test.circuitDescription?.trim()]
          .filter(Boolean)
          .join(" — ") || "Location not recorded",
      action:
        test.notes?.trim() ||
        "Replace the RCD and re-test to confirm it operates within AS/NZS 3017 limits.",
      source: "RCD testing",
      rectified: false,
    });
  }

  for (const observation of report.observations) {
    if (observation.riskLevel === "INFO") continue;
    actions.push({
      id: observation.id,
      risk: observation.riskLevel,
      timeframe: RISK_META[observation.riskLevel].timeframe,
      what: observation.description?.trim() || "Observation",
      where: observation.location?.trim() || "Location not recorded",
      action: observation.recommendedAction?.trim() || "Rectify as required.",
      source: "Visual inspection",
      rectified: observation.rectifiedOnSite,
    });
  }

  actions.sort((a, b) => {
    if (a.rectified !== b.rectified) return a.rectified ? 1 : -1;
    return riskRank(a.risk) - riskRank(b.risk);
  });

  const counts = Object.fromEntries(
    RISK_ORDER.map((level) => [level, 0]),
  ) as Record<RiskLevel, number>;
  for (const action of actions) counts[action.risk] += 1;

  const outstanding = actions.filter((action) => !action.rectified);
  const calculatedRisk = highestRisk(outstanding.map((action) => action.risk));

  const rcdTested = rcd.filter(({ assessment }) => assessment.pass !== null).length;
  const rcdFailed = rcd.filter(({ assessment }) => assessment.pass === false).length;

  return {
    thermal,
    rcd,
    actions,
    counts,
    overallRisk:
      report.overallRiskOverride ??
      calculatedRisk ??
      (hasContent(report) ? "INFO" : null),
    overallOverridden: report.overallRiskOverride !== null,
    rcdTested,
    rcdPassed: rcdTested - rcdFailed,
    rcdFailed,
    thermalScanned: thermal.length,
    thermalAnomalies: thermal.filter(
      ({ assessment }) => assessment.risk && assessment.risk !== "INFO",
    ).length,
    observationCount: report.observations.length,
    hasAnyContent: hasContent(report),
  };
}

function hasContent(report: ReportFull): boolean {
  return (
    report.thermalFindings.length > 0 ||
    report.rcdTests.length > 0 ||
    report.observations.length > 0 ||
    report.photos.length > 0
  );
}

/**
 * Drafts the client-facing summary from what has actually been recorded. The
 * technician can edit it afterwards — once they do, their version is kept.
 */
export function draftExecutiveSummary(
  report: ReportFull,
  analysis: ReportAnalysis,
): string {
  const site = report.siteName?.trim() || report.siteAddress?.trim() || "your site";
  const parts: string[] = [];

  const scope: string[] = [];
  if (analysis.thermalScanned > 0) {
    scope.push(
      `a thermographic (infrared) survey of ${countNoun(analysis.thermalScanned, "point", "points")} across the installation`,
    );
  }
  if (analysis.rcd.length > 0) {
    scope.push(
      `testing of ${countNoun(analysis.rcd.length, "safety switch", "safety switches")} against AS/NZS 3017`,
    );
  }
  if (analysis.observationCount > 0) {
    scope.push("a visual inspection of the accessible electrical installation");
  }

  if (scope.length) {
    parts.push(
      `We attended ${site}${formatDate(report.inspectionDate) ? ` on ${formatDate(report.inspectionDate)}` : ""} and carried out ${joinList(scope)}.`,
    );
  }

  const risk = analysis.overallRisk;
  if (!risk || risk === "INFO") {
    parts.push(
      "Everything we tested was found to be in good working order, and no defects requiring attention were identified. No action is needed at this time.",
    );
  } else {
    const outstanding = analysis.actions.filter((action) => !action.rectified);
    const headline: Record<string, string> = {
      CRITICAL:
        "We identified one or more issues that present an immediate safety risk and should be made safe straight away.",
      HIGH: "We identified issues that are not an immediate emergency but will get worse if left, and should be booked in within the next week.",
      MEDIUM:
        "We identified issues that should be corrected at a convenient time, before they develop into larger or more expensive faults.",
      LOW: "We did not find any defects requiring repair. A small number of items have been recorded so we can compare them at the next inspection.",
    };
    parts.push(headline[risk] ?? "");

    const breakdown: string[] = [];
    for (const level of RISK_ORDER) {
      if (level === "INFO") continue;
      const total = outstanding.filter((action) => action.risk === level).length;
      if (total > 0) {
        breakdown.push(
          `${total} ${RISK_META[level].label.toLowerCase()} priority`,
        );
      }
    }
    if (breakdown.length) {
      parts.push(
        `In total there ${outstanding.length === 1 ? "is" : "are"} ${countNoun(outstanding.length, "item", "items")} for your attention: ${joinList(breakdown)}. Each one is listed in the priority actions table with what we found, what it means and what we recommend.`,
      );
    }

    if (analysis.rcdFailed > 0) {
      parts.push(
        `Importantly, ${countNoun(analysis.rcdFailed, "safety switch", "safety switches")} did not trip within the time required by AS/NZS 3017. Safety switches are the last line of protection against electric shock, so we recommend ${analysis.rcdFailed === 1 ? "it is" : "these are"} replaced as a priority.`,
      );
    }
  }

  const rectified = analysis.actions.filter((action) => action.rectified).length;
  if (rectified > 0) {
    parts.push(
      `${countNoun(rectified, "item", "items")} ${rectified === 1 ? "was" : "were"} rectified on site during our visit and ${rectified === 1 ? "is" : "are"} shown as completed in this report.`,
    );
  }

  return parts.filter(Boolean).join("\n\n");
}

export function draftRecommendations(analysis: ReportAnalysis): string {
  const outstanding = analysis.actions.filter((action) => !action.rectified);
  if (outstanding.length === 0) {
    return "No remedial work is required. We recommend the installation is re-inspected and the safety switches re-tested at the next scheduled interval so that any change can be picked up early.";
  }
  const lines = outstanding.map((action, index) => {
    const what = action.what.replace(/\.\s*$/, "");
    return `${index + 1}. [${RISK_META[action.risk].label}] ${action.where} — ${what}. ${action.action} (${action.timeframe}.)`;
  });
  lines.push("");
  lines.push(
    "Once the works above are complete we recommend a follow-up thermal scan under normal load to confirm the hot spots have cleared, and a re-test of any replaced safety switches.",
  );
  return lines.join("\n");
}

export const DEFAULT_LIMITATIONS = `This report covers only those parts of the installation that were accessible and energised at the time of our visit. Covers were removed where it was safe to do so.

Thermographic results depend on the load being carried at the time of the survey; a fault on a circuit that was lightly loaded or switched off may not show up. Temperatures are surface temperatures measured through the thermal camera and are affected by the emissivity setting, distance and reflection.

This report records the condition of the installation on the date of inspection only. It is not a warranty of future performance.`;

function countNoun(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

export function formatShortDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

/** yyyy-mm-dd in Sydney time, for <input type="date"> values. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Australia/Sydney",
  }).format(date);
  return parts;
}
