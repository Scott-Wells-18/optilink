"use client";

import type { RiskLevel } from "@prisma/client";
import { RISK_META, RISK_ORDER } from "@/lib/risk";
import { CheckField, SelectField, TextArea, TextField } from "@/components/fields";
import { ImageUpload } from "@/components/ImageUpload";
import { RiskBadge } from "@/components/RiskBadge";
import { EmptyState } from "@/components/PageHeader";
import { sendPatch, useDebouncedPatch } from "@/components/saving";
import type { ObservationRow, TabProps } from "./types";

const RISK_OPTIONS = RISK_ORDER.map((value) => ({
  value,
  label: `${RISK_META[value].label} — ${RISK_META[value].timeframe}`,
}));

export function ObservationsTab({ report, setReport }: TabProps) {
  async function addObservation() {
    const response = await sendPatch(
      `/api/reports/${report.id}/observations`,
      {},
      "POST",
    );
    if (!response) return;
    const observation = (await response.json()) as ObservationRow;
    setReport((current) => ({
      ...current,
      observations: [...current.observations, observation],
    }));
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="card-title">Visual observations</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Anything you noticed that is not a hot spot or a failed safety switch
            — damaged accessories, missing labelling, unsafe modifications. Each
            one gets a priority and a timeframe the client can act on.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => void addObservation()}>
          Add observation
        </button>
      </div>

      {report.observations.length === 0 ? (
        <EmptyState
          title="Nothing recorded"
          description="If the installation was clean, leave this empty — the report will say so."
        />
      ) : (
        <div className="space-y-4">
          {report.observations.map((observation, index) => (
            <ObservationCard
              key={observation.id}
              index={index}
              observation={observation}
              onChange={(update) =>
                setReport((current) => ({
                  ...current,
                  observations: current.observations.map((row) =>
                    row.id === observation.id ? { ...row, ...update } : row,
                  ),
                }))
              }
              onDelete={() =>
                setReport((current) => ({
                  ...current,
                  observations: current.observations.filter(
                    (row) => row.id !== observation.id,
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

function ObservationCard({
  index,
  observation,
  onChange,
  onDelete,
}: {
  index: number;
  observation: ObservationRow;
  onChange: (update: Partial<ObservationRow>) => void;
  onDelete: () => void;
}) {
  const { patch } = useDebouncedPatch(`/api/observations/${observation.id}`);

  function update(changes: Partial<ObservationRow>) {
    onChange(changes);
    patch(changes as Record<string, unknown>);
  }

  async function remove() {
    if (!window.confirm("Delete this observation?")) return;
    const response = await sendPatch(`/api/observations/${observation.id}`, null, "DELETE");
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
              {observation.description?.trim() || "Untitled observation"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {observation.location?.trim() || "Location not set"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge risk={observation.riskLevel} />
          {observation.rectifiedOnSite ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Fixed on site
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Location"
              value={observation.location ?? ""}
              onChange={(value) => update({ location: value })}
              placeholder="e.g. Distribution board 2, ground floor"
            />
            <SelectField
              label="Priority"
              value={observation.riskLevel}
              options={RISK_OPTIONS}
              onChange={(value) =>
                update({ riskLevel: (value ?? "MEDIUM") as RiskLevel })
              }
            />
          </div>
          <TextArea
            label="What you found"
            rows={2}
            value={observation.description ?? ""}
            onChange={(value) => update({ description: value })}
            placeholder="e.g. Circuit labelling missing on eight circuits; board schedule out of date."
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <TextArea
              label="Recommended action"
              rows={2}
              value={observation.recommendedAction ?? ""}
              onChange={(value) => update({ recommendedAction: value })}
            />
            <TextField
              label="Clause reference"
              value={observation.clauseReference ?? ""}
              onChange={(value) => update({ clauseReference: value })}
              placeholder="e.g. AS/NZS 3000 Cl 2.3.2"
            />
          </div>
          <TextArea
            label="Plain-English note for the client"
            rows={2}
            value={observation.clientExplanation ?? ""}
            onChange={(value) => update({ clientExplanation: value })}
            placeholder="Why this matters, in everyday language."
            hint="Optional, but it is what turns a defect list into something a client can act on."
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <CheckField
              label="Rectified on site during this visit"
              checked={observation.rectifiedOnSite}
              onChange={(checked) => update({ rectifiedOnSite: checked })}
            />
            <button type="button" onClick={() => void remove()} className="btn-danger text-xs">
              Delete
            </button>
          </div>
        </div>

        <ImageUpload
          label="Photo"
          fileId={observation.photoId}
          onUploaded={(image) =>
            update({ photoId: image.id, photo: null } as Partial<ObservationRow>)
          }
          onCleared={() => update({ photoId: null } as Partial<ObservationRow>)}
        />
      </div>
    </section>
  );
}
