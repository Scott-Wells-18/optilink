import type { RiskLevel, ThermalBasis } from "@prisma/client";

/**
 * Thermographic severity assessment.
 *
 * AS/NZS 3000 and AS/NZS 3017 do not publish temperature-rise bands for
 * infrared surveys, so the industry convention is used: the ΔT bands from
 * NETA MTS Table 100.18, which are also the basis of most Australian
 * thermography reporting. ΔT is the difference between the hot spot and a
 * reference — either an equivalent component carrying a similar load, or the
 * ambient air temperature.
 *
 * The two top NETA bands ("repair immediately") are split here into HIGH and
 * CRITICAL so a report can distinguish "book this in this week" from "this is
 * a fire risk right now".
 */

export type ThermalBand = {
  risk: RiskLevel;
  label: string;
  /** What the industry guidance calls this band. */
  classification: string;
  /** How quickly it should be dealt with. */
  timeframe: string;
  /** Written for the client, not the electrician. */
  plainEnglish: string;
  suggestedAction: string;
};

const SIMILAR_COMPONENT_BANDS: Array<{ max: number; band: ThermalBand }> = [
  {
    max: 1,
    band: {
      risk: "INFO",
      label: "Normal",
      classification: "No anomaly detected",
      timeframe: "No action required",
      plainEnglish:
        "This connection was running at the same temperature as the equivalent ones beside it, which is what we want to see. Nothing to do here.",
      suggestedAction: "No action required. Re-scan at the next scheduled inspection.",
    },
  },
  {
    max: 4,
    band: {
      risk: "LOW",
      label: "Monitor",
      classification: "Possible deficiency — warrants investigation",
      timeframe: "Monitor; re-check at next scheduled inspection",
      plainEnglish:
        "This part is running slightly warmer than the identical parts next to it. It is not a problem today, but a small difference like this can be the first sign of a connection starting to loosen, so we will keep an eye on it.",
      suggestedAction:
        "Record and monitor. Re-scan at the next scheduled thermographic inspection to confirm it is not getting worse.",
    },
  },
  {
    max: 16,
    band: {
      risk: "MEDIUM",
      label: "Repair when convenient",
      classification: "Indicates probable deficiency — repair as time permits",
      timeframe: "Within 30 days, or at the next planned shutdown",
      plainEnglish:
        "This part is noticeably hotter than the identical parts next to it. That normally means a connection has worked loose or a component is being asked to carry more than it comfortably can. It is not dangerous right now, but left alone it will keep getting hotter, so it should be tightened or replaced at a convenient time.",
      suggestedAction:
        "Isolate, inspect and re-terminate the connection (or replace the component), then re-scan under load to confirm the hot spot has cleared.",
    },
  },
  {
    max: 36,
    band: {
      risk: "HIGH",
      label: "Repair promptly",
      classification: "Major discrepancy — repair immediately",
      timeframe: "Within 7 days",
      plainEnglish:
        "This part is running much hotter than it should be. At this temperature the insulation and the connection itself start to degrade, which makes the problem accelerate. This needs to be repaired promptly rather than left until the next service visit.",
      suggestedAction:
        "Schedule an isolation within the week. Inspect, re-terminate or replace the affected component and any heat-damaged parts, then re-scan under load.",
    },
  },
  {
    max: Infinity,
    band: {
      risk: "CRITICAL",
      label: "Act now",
      classification: "Major discrepancy — repair immediately",
      timeframe: "Immediately",
      plainEnglish:
        "This part is dangerously hot compared with the ones beside it. Temperatures like this can char insulation, damage the switchboard and start a fire. We recommend this circuit is shut down and repaired as soon as it is safe to do so.",
      suggestedAction:
        "Treat as urgent. De-energise the affected circuit as soon as it is practical, repair or replace the component and any heat-damaged parts, then re-scan under load before returning to service.",
    },
  },
];

const AMBIENT_BANDS: Array<{ max: number; band: ThermalBand }> = [
  {
    max: 1,
    band: {
      risk: "INFO",
      label: "Normal",
      classification: "No anomaly detected",
      timeframe: "No action required",
      plainEnglish:
        "This part was sitting at room temperature. Nothing to do here.",
      suggestedAction: "No action required. Re-scan at the next scheduled inspection.",
    },
  },
  {
    max: 11,
    band: {
      risk: "LOW",
      label: "Monitor",
      classification: "Possible deficiency — warrants investigation",
      timeframe: "Monitor; re-check at next scheduled inspection",
      plainEnglish:
        "This part is a little warmer than the surrounding air. A small rise is normal for equipment under load, but we have recorded it so we can compare it next time.",
      suggestedAction:
        "Record and monitor. Re-scan at the next scheduled thermographic inspection.",
    },
  },
  {
    max: 21,
    band: {
      risk: "MEDIUM",
      label: "Repair when convenient",
      classification: "Indicates probable deficiency — repair as time permits",
      timeframe: "Within 30 days, or at the next planned shutdown",
      plainEnglish:
        "This part is running well above the surrounding air temperature. That usually points to a loose connection or a component working harder than it should. It should be looked at and corrected at a convenient time.",
      suggestedAction:
        "Isolate, inspect and re-terminate the connection (or replace the component), then re-scan under load to confirm the hot spot has cleared.",
    },
  },
  {
    max: 41,
    band: {
      risk: "HIGH",
      label: "Repair promptly",
      classification: "Monitor until corrective measures can be accomplished",
      timeframe: "Within 7 days",
      plainEnglish:
        "This part is very hot — far above the air around it. At this temperature the surrounding insulation begins to break down and the fault gets worse on its own. It needs attention promptly.",
      suggestedAction:
        "Schedule an isolation within the week. Inspect, re-terminate or replace the affected component and any heat-damaged parts, then re-scan under load.",
    },
  },
  {
    max: Infinity,
    band: {
      risk: "CRITICAL",
      label: "Act now",
      classification: "Major discrepancy — repair immediately",
      timeframe: "Immediately",
      plainEnglish:
        "This part is dangerously hot. Temperatures this far above the surrounding air can char insulation, damage the switchboard and start a fire. We recommend this circuit is shut down and repaired as soon as it is safe to do so.",
      suggestedAction:
        "Treat as urgent. De-energise the affected circuit as soon as it is practical, repair or replace the component and any heat-damaged parts, then re-scan under load before returning to service.",
    },
  },
];

export type ThermalAssessment = {
  deltaT: number | null;
  band: ThermalBand | null;
  risk: RiskLevel | null;
  /** True when the technician has overridden the calculated severity. */
  overridden: boolean;
  basisLabel: string;
};

export function basisLabel(basis: ThermalBasis): string {
  return basis === "AMBIENT"
    ? "compared with ambient air temperature"
    : "compared with an equivalent component under similar load";
}

export function assessThermal(input: {
  basis: ThermalBasis;
  measuredTempC?: number | null;
  referenceTempC?: number | null;
  severityOverride?: RiskLevel | null;
}): ThermalAssessment {
  const { basis, measuredTempC, referenceTempC, severityOverride } = input;
  const label = basisLabel(basis);

  const hasReadings =
    typeof measuredTempC === "number" &&
    Number.isFinite(measuredTempC) &&
    typeof referenceTempC === "number" &&
    Number.isFinite(referenceTempC);

  if (!hasReadings) {
    return {
      deltaT: null,
      band: null,
      risk: severityOverride ?? null,
      overridden: Boolean(severityOverride),
      basisLabel: label,
    };
  }

  const deltaT = Math.round((measuredTempC! - referenceTempC!) * 10) / 10;
  const table = basis === "AMBIENT" ? AMBIENT_BANDS : SIMILAR_COMPONENT_BANDS;
  const band = table.find((entry) => deltaT < entry.max)!.band;

  return {
    deltaT,
    band,
    risk: severityOverride ?? band.risk,
    overridden: Boolean(severityOverride),
    basisLabel: label,
  };
}

/** The bands, for the "how we grade findings" table in the report. */
export function thermalBandTable(basis: ThermalBasis) {
  const table = basis === "AMBIENT" ? AMBIENT_BANDS : SIMILAR_COMPONENT_BANDS;
  return table.map((entry, index) => {
    const from = index === 0 ? 0 : table[index - 1].max;
    return {
      range:
        entry.max === Infinity
          ? `${from} °C and above`
          : from === 0
            ? `Under ${entry.max} °C`
            : `${from} – ${entry.max - 1} °C`,
      risk: entry.band.risk,
      label: entry.band.label,
      classification: entry.band.classification,
      timeframe: entry.band.timeframe,
    };
  });
}
