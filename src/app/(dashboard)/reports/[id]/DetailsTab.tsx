"use client";

import { SelectField, TextArea, TextField, CheckField } from "@/components/fields";
import { toDateInputValue } from "@/lib/report";
import type { ClientOption, TabProps } from "./types";

export function DetailsTab({
  report,
  setReport,
  patchReport,
  clients,
  defaults,
}: TabProps & {
  clients: ClientOption[];
  defaults: { technicianName: string | null; technicianLicence: string | null };
}) {
  function update(update: Record<string, unknown>) {
    setReport((current) => ({ ...current, ...update }));
    patchReport(update);
  }

  function chooseClient(clientId: string | null) {
    const chosen = clients.find((client) => client.id === clientId) ?? null;
    const address = chosen
      ? [chosen.addressLine1, [chosen.suburb, chosen.state, chosen.postcode].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ")
      : null;

    // Prefill the site address from the client the first time one is chosen.
    const shouldFillAddress = Boolean(chosen && !report.siteAddress && address);
    const changes: Record<string, unknown> = { clientId };
    if (shouldFillAddress) changes.siteAddress = address;

    setReport((current) => ({
      ...current,
      clientId,
      client: chosen
        ? {
            ...(current.client ?? {}),
            id: chosen.id,
            name: chosen.name,
          }
        : null,
      ...(shouldFillAddress ? { siteAddress: address } : {}),
    }) as typeof current);
    patchReport(changes);
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Job details</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Who the report is for and where the work was carried out.
            </p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField
            label="Report title"
            value={report.title}
            onChange={(value) => update({ title: value })}
            placeholder="e.g. Annual thermographic survey and RCD test"
            className="sm:col-span-2"
          />
          <SelectField
            label="Client"
            value={report.clientId}
            options={clients.map((client) => ({ value: client.id, label: client.name }))}
            onChange={chooseClient}
            allowEmpty
            emptyLabel="No client selected"
            hint={clients.length === 0 ? "Add clients from the Clients page first." : undefined}
          />
          <TextField
            label="Site name"
            value={report.siteName ?? ""}
            onChange={(value) => update({ siteName: value })}
            placeholder="e.g. Warehouse 3, Level 2 tenancy"
          />
          <TextArea
            label="Site address"
            className="sm:col-span-2"
            rows={2}
            value={report.siteAddress ?? ""}
            onChange={(value) => update({ siteAddress: value })}
          />
          <TextField
            label="Site contact on the day"
            value={report.siteContact ?? ""}
            onChange={(value) => update({ siteContact: value })}
            placeholder="Name and phone number"
          />
          <TextField
            label="Date of inspection"
            type="date"
            value={toDateInputValue(report.inspectionDate)}
            onChange={(value) => {
              setReport((current) => ({
                ...current,
                inspectionDate: value ? new Date(value) : null,
              }));
              patchReport({ inspectionDate: value || null });
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Who carried out the work</h2>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField
            label="Technician"
            value={report.technicianName ?? ""}
            onChange={(value) => update({ technicianName: value })}
            placeholder={defaults.technicianName ?? "Name of the electrician on site"}
          />
          <TextField
            label="Licence number"
            value={report.technicianLicence ?? ""}
            onChange={(value) => update({ technicianLicence: value })}
            placeholder={defaults.technicianLicence ?? "e.g. 123456C"}
          />
          <TextArea
            label="Test equipment used"
            className="sm:col-span-2"
            rows={2}
            value={report.equipmentUsed ?? ""}
            onChange={(value) => update({ equipmentUsed: value })}
            placeholder="e.g. FLIR E8-XT (cal. 03/2026), Fluke 1663 installation tester (cal. 01/2026)"
            hint="Listing calibrated equipment is what makes the results defensible."
          />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Conditions on the day</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Thermal readings only mean something in context — record what the
              conditions were.
            </p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField
            label="Ambient temperature"
            type="number"
            suffix="°C"
            value={report.ambientTempC === null ? "" : String(report.ambientTempC)}
            onChange={(value) =>
              update({ ambientTempC: value === "" ? null : Number(value) })
            }
          />
          <TextField
            label="Weather / load conditions"
            value={report.weatherNotes ?? ""}
            onChange={(value) => update({ weatherNotes: value })}
            placeholder="e.g. Overcast, 24 °C, plant running at normal daytime load"
          />
          <TextArea
            label="Scope of works"
            className="sm:col-span-2"
            rows={3}
            value={report.scopeOfWork ?? ""}
            onChange={(value) => update({ scopeOfWork: value })}
            placeholder="What you were asked to do and what you covered — main switchboard, distribution boards, which circuits."
          />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Sections to include</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Untick anything that does not apply to this job and it will be left
              out of the finished report.
            </p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <CheckField
            label="Thermographic survey"
            checked={report.includeThermal}
            onChange={(checked) => update({ includeThermal: checked })}
          />
          <CheckField
            label="RCD testing"
            checked={report.includeRcd}
            onChange={(checked) => update({ includeRcd: checked })}
          />
          <CheckField
            label="Visual observations"
            checked={report.includeObservations}
            onChange={(checked) => update({ includeObservations: checked })}
          />
          <CheckField
            label="Before &amp; after photos"
            checked={report.includePhotos}
            onChange={(checked) => update({ includePhotos: checked })}
          />
          <CheckField
            label="Plain-English glossary"
            hint="Explains RCDs, ΔT, emissivity and the rest — only the terms this report actually uses."
            checked={report.includeGlossary}
            onChange={(checked) => update({ includeGlossary: checked })}
          />
        </div>
      </section>
    </div>
  );
}
