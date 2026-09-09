"use client";

import { useState } from "react";
import type { RiskLevel, ThermalBasis } from "@prisma/client";
import { assessThermal } from "@/lib/standards/thermal";
import { RISK_ORDER, RISK_META } from "@/lib/risk";
import { NumberField, SelectField, TextArea, TextField, CheckField } from "@/components/fields";
import { ImageUpload, uploadImage } from "@/components/ImageUpload";
import { RiskBadge } from "@/components/RiskBadge";
import { EmptyState } from "@/components/PageHeader";
import { sendPatch, useDebouncedPatch } from "@/components/saving";
import type { TabProps, ThermalRow } from "./types";

const BASIS_OPTIONS: Array<{ value: ThermalBasis; label: string }> = [
  { value: "SIMILAR_COMPONENT", label: "Compared with an equivalent component" },
  { value: "AMBIENT", label: "Compared with ambient air" },
];

const RISK_OPTIONS = RISK_ORDER.map((value) => ({
  value,
  label: RISK_META[value].label,
}));

export function ThermalTab({ report, setReport }: TabProps) {
  const [busy, setBusy] = useState(false);

  async function addFinding(thermalImageId?: string) {
    const response = await sendPatch(
      `/api/reports/${report.id}/thermal`,
      { thermalImageId },
      "POST",
    );
    if (!response) return;
    const finding = (await response.json()) as ThermalRow;
    setReport((current) => ({
      ...current,
      thermalFindings: [...current.thermalFindings, finding],
    }));
  }

  /** Dropping a batch of camera images creates one finding per image. */
  async function addFromFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        const image = await uploadImage(file);
        await addFinding(image.id);
      } catch {
        // Keep going — one bad file should not stop the rest of the batch.
      }
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="card-title">Thermographic survey</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Add one entry per hot spot. Enter the measured temperature and the
            reference, and OptiLink works out the temperature rise, grades the
            severity and writes the plain-English explanation your client reads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            {busy ? "Uploading…" : "Upload thermal images"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void addFromFiles(event.target.files)}
            />
          </label>
          <button type="button" className="btn-primary" onClick={() => void addFinding()}>
            Add finding
          </button>
        </div>
      </div>

      {report.thermalFindings.length === 0 ? (
        <EmptyState
          title="No thermal findings yet"
          description="Upload the images straight off the camera and OptiLink will create an entry for each one, ready for you to fill in the temperatures."
        />
      ) : (
        <div className="space-y-4">
          {report.thermalFindings.map((finding, index) => (
            <ThermalCard
              key={finding.id}
              index={index}
              finding={finding}
              reportAmbient={report.ambientTempC}
              onChange={(update) =>
                setReport((current) => ({
                  ...current,
                  thermalFindings: current.thermalFindings.map((row) =>
                    row.id === finding.id ? { ...row, ...update } : row,
                  ),
                }))
              }
              onDelete={() =>
                setReport((current) => ({
                  ...current,
                  thermalFindings: current.thermalFindings.filter(
                    (row) => row.id !== finding.id,
                  ),
                }))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThermalCard({
  index,
  finding,
  reportAmbient,
  onChange,
  onDelete,
}: {
  index: number;
  finding: ThermalRow;
  reportAmbient: number | null;
  onChange: (update: Partial<ThermalRow>) => void;
  onDelete: () => void;
}) {
  const { patch } = useDebouncedPatch(`/api/thermal/${finding.id}`);
  const [collapsed, setCollapsed] = useState(false);

  function update(changes: Partial<ThermalRow>) {
    onChange(changes);
    patch(changes as Record<string, unknown>);
  }

  const assessment = assessThermal({
    basis: finding.basis,
    measuredTempC: finding.measuredTempC,
    referenceTempC: finding.referenceTempC,
    severityOverride: finding.severityOverride,
  });

  async function remove() {
    if (!window.confirm("Delete this finding?")) return;
    const response = await sendPatch(`/api/thermal/${finding.id}`, null, "DELETE");
    if (response) onDelete();
  }

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {finding.component?.trim() || "Untitled finding"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {finding.location?.trim() || "Location not set"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {assessment.deltaT !== null ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-700">
              ΔT {assessment.deltaT} °C
            </span>
          ) : null}
          {assessment.risk ? <RiskBadge risk={assessment.risk} /> : null}
          {finding.rectifiedOnSite ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Fixed on site
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="btn-ghost text-xs"
          >
            {collapsed ? "Open" : "Collapse"}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageUpload
              label="Thermal image"
              fileId={finding.thermalImageId}
              onUploaded={(image) =>
                update({ thermalImageId: image.id, thermalImage: null } as Partial<ThermalRow>)
              }
              onCleared={() => update({ thermalImageId: null } as Partial<ThermalRow>)}
            />
            <ImageUpload
              label="Matching photo (optional)"
              hint="A normal photo of the same spot makes it obvious what the client is looking at."
              fileId={finding.visualImageId}
              onUploaded={(image) =>
                update({ visualImageId: image.id, visualImage: null } as Partial<ThermalRow>)
              }
              onCleared={() => update({ visualImageId: null } as Partial<ThermalRow>)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Location"
              value={finding.location ?? ""}
              onChange={(value) => update({ location: value })}
              placeholder="e.g. Main switchboard, Row 2"
            />
            <TextField
              label="Component"
              value={finding.component ?? ""}
              onChange={(value) => update({ component: value })}
              placeholder="e.g. Circuit 7 — 32 A HRC fuse, A phase"
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Compared against"
                className="sm:col-span-2"
                value={finding.basis}
                options={BASIS_OPTIONS}
                onChange={(value) => update({ basis: (value ?? "SIMILAR_COMPONENT") as ThermalBasis })}
              />
              <NumberField
                label="Measured"
                suffix="°C"
                value={finding.measuredTempC}
                onChange={(value) => update({ measuredTempC: value })}
              />
              <NumberField
                label={finding.basis === "AMBIENT" ? "Ambient" : "Reference component"}
                suffix="°C"
                value={finding.referenceTempC}
                onChange={(value) => update({ referenceTempC: value })}
                hint={
                  finding.basis === "AMBIENT" && reportAmbient !== null
                    ? `Site ambient recorded as ${reportAmbient} °C`
                    : undefined
                }
              />
              <NumberField
                label="Load at time of scan"
                suffix="A"
                value={finding.loadAmps}
                onChange={(value) => update({ loadAmps: value })}
              />
              <NumberField
                label="Emissivity"
                step="0.01"
                value={finding.emissivity}
                onChange={(value) => update({ emissivity: value })}
              />
              <SelectField
                label="Severity override"
                className="sm:col-span-2"
                value={finding.severityOverride}
                options={RISK_OPTIONS}
                onChange={(value) => update({ severityOverride: value as RiskLevel | null })}
                allowEmpty
                emptyLabel="Use the calculated rating"
              />
            </div>

            {assessment.band ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge risk={assessment.risk!} size="md" />
                  <span className="text-sm font-medium text-slate-700">
                    ΔT {assessment.deltaT} °C {assessment.basisLabel}
                  </span>
                  {assessment.overridden ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      Overridden — calculated {RISK_META[assessment.band.risk].label}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {assessment.band.classification} · {assessment.band.timeframe}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {finding.clientExplanation?.trim() || assessment.band.plainEnglish}
                </p>
                {!finding.recommendedAction?.trim() ? (
                  <button
                    type="button"
                    className="btn-secondary mt-3 text-xs"
                    onClick={() =>
                      update({ recommendedAction: assessment.band!.suggestedAction })
                    }
                  >
                    Use the suggested action
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Enter both temperatures and OptiLink will grade this finding
                automatically.
              </p>
            )}
          </div>

          <div className="grid gap-4">
            <TextArea
              label="What you found"
              rows={2}
              value={finding.findings ?? ""}
              onChange={(value) => update({ findings: value })}
              placeholder="e.g. Loose termination on the A-phase line side of the fuse holder, discolouration on the busbar."
            />
            <TextArea
              label="Recommended action"
              rows={2}
              value={finding.recommendedAction ?? ""}
              onChange={(value) => update({ recommendedAction: value })}
              placeholder="Leave blank to use OptiLink's suggested action for this severity."
            />
            <TextArea
              label="Plain-English note for the client"
              rows={3}
              value={finding.clientExplanation ?? ""}
              onChange={(value) => update({ clientExplanation: value })}
              placeholder="Leave blank and OptiLink writes this for you, in language the client will understand."
              hint="Only fill this in if you want to say it in your own words."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <CheckField
              label="Rectified on site during this visit"
              checked={finding.rectifiedOnSite}
              onChange={(checked) => update({ rectifiedOnSite: checked })}
            />
            <button type="button" onClick={() => void remove()} className="btn-danger text-xs">
              Delete finding
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
