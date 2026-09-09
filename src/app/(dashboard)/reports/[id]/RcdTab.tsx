"use client";

import type { RcdKind } from "@prisma/client";
import { assessRcd, RCD_KIND_LIMITS } from "@/lib/standards/rcd";
import { NumberField, SelectField, TextArea, TextField, TriStateField } from "@/components/fields";
import { PassFailBadge } from "@/components/RiskBadge";
import { EmptyState } from "@/components/PageHeader";
import { sendPatch, useDebouncedPatch } from "@/components/saving";
import type { RcdRow, TabProps } from "./types";

const KIND_OPTIONS = (Object.keys(RCD_KIND_LIMITS) as RcdKind[]).map((value) => ({
  value,
  label: RCD_KIND_LIMITS[value].kindLabel,
}));

const COMMON_RATINGS = [10, 30, 100, 300];

export function RcdTab({ report, setReport }: TabProps) {
  async function addTest() {
    // Carry the last board name down so a whole board is quick to enter.
    const lastBoard = report.rcdTests.at(-1)?.boardName ?? undefined;
    const response = await sendPatch(
      `/api/reports/${report.id}/rcd`,
      { boardName: lastBoard },
      "POST",
    );
    if (!response) return;
    const test = (await response.json()) as RcdRow;
    setReport((current) => ({ ...current, rcdTests: [...current.rcdTests, test] }));
  }

  const results = report.rcdTests.map((test) =>
    assessRcd({
      rcdKind: test.rcdKind,
      ratedCurrentMa: test.ratedCurrentMa,
      tripTimeRatedMs: test.tripTimeRatedMs,
      tripTime5xMs: test.tripTime5xMs,
      rampTripMa: test.rampTripMa,
      pushButtonOk: test.pushButtonOk,
      notRequired: test.notRequired,
      resultOverride: test.resultOverride,
    }),
  );
  const failed = results.filter((result) => result.pass === false).length;
  const passed = results.filter((result) => result.pass === true).length;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="card-title">RCD testing — AS/NZS 3017</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Enter the trip times straight off the tester. Pass and fail are
            worked out against the maximum disconnection times in AS/NZS 3017,
            so you are not checking them by hand.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {report.rcdTests.length > 0 ? (
            <span className="text-xs text-slate-500">
              <span className="font-semibold text-emerald-700">{passed} pass</span>
              {" · "}
              <span className={failed > 0 ? "font-semibold text-red-700" : ""}>
                {failed} fail
              </span>
            </span>
          ) : null}
          <button type="button" className="btn-primary" onClick={() => void addTest()}>
            Add RCD
          </button>
        </div>
      </div>

      {report.rcdTests.length === 0 ? (
        <EmptyState
          title="No safety switches recorded"
          description="Add each RCD or RCBO you tested. OptiLink checks the trip times against AS/NZS 3017 and explains any failure in language the client will understand."
        />
      ) : (
        <div className="space-y-4">
          {report.rcdTests.map((test, index) => (
            <RcdCard
              key={test.id}
              index={index}
              test={test}
              onChange={(update) =>
                setReport((current) => ({
                  ...current,
                  rcdTests: current.rcdTests.map((row) =>
                    row.id === test.id ? { ...row, ...update } : row,
                  ),
                }))
              }
              onDelete={() =>
                setReport((current) => ({
                  ...current,
                  rcdTests: current.rcdTests.filter((row) => row.id !== test.id),
                }))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RcdCard({
  index,
  test,
  onChange,
  onDelete,
}: {
  index: number;
  test: RcdRow;
  onChange: (update: Partial<RcdRow>) => void;
  onDelete: () => void;
}) {
  const { patch } = useDebouncedPatch(`/api/rcd/${test.id}`);

  function update(changes: Partial<RcdRow>) {
    onChange(changes);
    patch(changes as Record<string, unknown>);
  }

  const assessment = assessRcd({
    rcdKind: test.rcdKind,
    ratedCurrentMa: test.ratedCurrentMa,
    tripTimeRatedMs: test.tripTimeRatedMs,
    tripTime5xMs: test.tripTime5xMs,
    rampTripMa: test.rampTripMa,
    pushButtonOk: test.pushButtonOk,
    notRequired: test.notRequired,
    resultOverride: test.resultOverride,
  });

  async function remove() {
    if (!window.confirm("Delete this RCD test?")) return;
    const response = await sendPatch(`/api/rcd/${test.id}`, null, "DELETE");
    if (response) onDelete();
  }

  const fiveTimes = Math.round(test.ratedCurrentMa * 5 * 10) / 10;

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {test.circuitDescription?.trim() || "Untitled circuit"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {test.boardName?.trim() || "Board not set"} · {test.ratedCurrentMa} mA{" "}
              {assessment.limits.kindLabel}
            </p>
          </div>
        </div>
        <PassFailBadge pass={assessment.pass} />
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Board"
            value={test.boardName ?? ""}
            onChange={(value) => update({ boardName: value })}
            placeholder="e.g. MSB / DB-2"
          />
          <TextField
            label="Circuit"
            className="lg:col-span-2"
            value={test.circuitDescription ?? ""}
            onChange={(value) => update({ circuitDescription: value })}
            placeholder="e.g. C3 — Kitchen power"
          />
          <TextField
            label="Make / model"
            value={test.make ?? ""}
            onChange={(value) => update({ make: value })}
          />
          <SelectField
            label="Device type"
            className="lg:col-span-2"
            value={test.rcdKind}
            options={KIND_OPTIONS}
            onChange={(value) => update({ rcdKind: (value ?? "TYPE_II") as RcdKind })}
          />
          <div>
            <NumberField
              label="Rated current (I∆n)"
              suffix="mA"
              value={test.ratedCurrentMa}
              onChange={(value) => update({ ratedCurrentMa: value ?? 30 })}
            />
            <div className="mt-1.5 flex gap-1">
              {COMMON_RATINGS.map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => update({ ratedCurrentMa: rating })}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${
                    test.ratedCurrentMa === rating
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>
          <TextField
            label="Poles"
            value={test.poles ?? ""}
            onChange={(value) => update({ poles: value })}
            placeholder="e.g. 2P, 4P, RCBO"
          />
        </div>

        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              label={`At ${test.ratedCurrentMa} mA`}
              suffix="ms"
              value={test.tripTimeRatedMs}
              onChange={(value) => update({ tripTimeRatedMs: value })}
              hint={
                assessment.limits.minAtRatedMs
                  ? `${assessment.limits.minAtRatedMs} – ${assessment.limits.maxAtRatedMs} ms`
                  : `Limit ≤ ${assessment.limits.maxAtRatedMs} ms`
              }
            />
            <NumberField
              label={`At ${fiveTimes} mA (5 ×)`}
              suffix="ms"
              value={test.tripTime5xMs}
              onChange={(value) => update({ tripTime5xMs: value })}
              hint={
                assessment.limits.maxAt5xMs
                  ? `Limit ≤ ${assessment.limits.maxAt5xMs} ms`
                  : "Not applicable"
              }
            />
            <NumberField
              label="Ramp test"
              suffix="mA"
              value={test.rampTripMa}
              onChange={(value) => update({ rampTripMa: value })}
              hint={`Expected ${assessment.rampWindow.min} – ${assessment.rampWindow.max} mA`}
            />
            <TriStateField
              label="Test button"
              value={test.pushButtonOk}
              onChange={(value) => update({ pushButtonOk: value })}
              yesLabel="Operated"
              noLabel="Failed"
            />
          </div>

          {assessment.checks.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Test</th>
                    <th className="px-3 py-2 font-semibold">Result</th>
                    <th className="px-3 py-2 font-semibold">Limit</th>
                    <th className="px-3 py-2 font-semibold"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assessment.checks.map((check) => (
                    <tr key={check.name}>
                      <td className="px-3 py-2 text-slate-700">{check.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-900">
                        {check.value}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {check.limit}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PassFailBadge pass={check.pass} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {assessment.pass !== null ? (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed ${
                assessment.pass
                  ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                  : "bg-red-50 text-red-900 ring-1 ring-red-200"
              }`}
            >
              {assessment.plainEnglish}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TriStateField
            label="Override the result"
            value={test.resultOverride}
            onChange={(value) => update({ resultOverride: value })}
            yesLabel="Force pass"
            noLabel="Force fail"
          />
          <TriStateField
            label="Device not tested"
            value={test.notRequired ? true : false}
            onChange={(value) => update({ notRequired: value === true })}
            yesLabel="Not tested"
            noLabel="Tested"
          />
          <TextArea
            label="Notes"
            className="sm:col-span-2"
            rows={2}
            value={test.notes ?? ""}
            onChange={(value) => update({ notes: value })}
            placeholder="e.g. Device not accessible — tenant refused access. Or: replaced on site, retested at 24 ms."
          />
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button type="button" onClick={() => void remove()} className="btn-danger text-xs">
            Delete RCD test
          </button>
        </div>
      </div>
    </section>
  );
}
