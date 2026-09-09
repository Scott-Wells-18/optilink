"use client";

import { useState } from "react";
import type { Settings, UploadedFile } from "@prisma/client";
import { SelectField, TextArea, TextField } from "@/components/fields";
import { ImageUpload } from "@/components/ImageUpload";
import { SaveIndicator, useDebouncedPatch } from "@/components/saving";
import { RCD_KIND_LIMITS } from "@/lib/standards/rcd";
import { thermalBandTable } from "@/lib/standards/thermal";
import { RiskBadge } from "@/components/RiskBadge";

type SettingsWithLogos = Settings & {
  logo: UploadedFile | null;
  logoMark: UploadedFile | null;
};

const AU_STATES = [
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "NT",
  "ACT",
].map((value) => ({ value, label: value }));

export function SettingsForm({ settings }: { settings: SettingsWithLogos }) {
  const { patch } = useDebouncedPatch("/api/settings");
  const [local, setLocal] = useState(settings);

  function update<K extends keyof SettingsWithLogos>(key: K, value: SettingsWithLogos[K]) {
    setLocal((current) => ({ ...current, [key]: value }));
    patch({ [key]: value });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <SaveIndicator />
      </div>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Branding</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Your logo and colours are used across the dashboard, the sign-in
              page and every report you print.
            </p>
          </div>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-2">
          <ImageUpload
            label="Main logo"
            hint="Used on the report cover and in the sidebar. A transparent PNG or SVG-exported PNG on a light background works best."
            fileId={local.logoFileId}
            aspect="aspect-3/1"
            onUploaded={(image) => update("logoFileId", image.id)}
            onCleared={() => update("logoFileId", null)}
          />
          <ImageUpload
            label="Logo mark (optional)"
            hint="A square icon version, used in the corner of continuation pages."
            fileId={local.logoMarkFileId}
            aspect="aspect-square"
            onUploaded={(image) => update("logoMarkFileId", image.id)}
            onCleared={() => update("logoMarkFileId", null)}
          />

          <div className="grid grid-cols-2 gap-4 sm:col-span-2">
            <ColourField
              label="Primary colour"
              value={local.primaryColour}
              onChange={(value) => update("primaryColour", value)}
              hint="Headings, sidebar and report cover."
            />
            <ColourField
              label="Accent colour"
              value={local.accentColour}
              onChange={(value) => update("accentColour", value)}
              hint="Highlights and callouts."
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Company details</h2>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField
            label="Company name"
            value={local.companyName}
            onChange={(value) => update("companyName", value)}
          />
          <TextField
            label="Trading as (optional)"
            value={local.tradingName ?? ""}
            onChange={(value) => update("tradingName", value)}
          />
          <TextField
            label="ABN"
            value={local.abn ?? ""}
            onChange={(value) => update("abn", value)}
            placeholder="00 000 000 000"
          />
          <TextField
            label="Electrical licence number"
            value={local.licenceNumber ?? ""}
            onChange={(value) => update("licenceNumber", value)}
            hint="Shown on the report cover — NSW requires it on documentation."
          />
          <TextField
            label="Phone"
            value={local.phone ?? ""}
            onChange={(value) => update("phone", value)}
          />
          <TextField
            label="Email"
            type="email"
            value={local.email ?? ""}
            onChange={(value) => update("email", value)}
          />
          <TextField
            label="Website"
            value={local.website ?? ""}
            onChange={(value) => update("website", value)}
            className="sm:col-span-2"
          />
          <TextField
            label="Address line 1"
            value={local.addressLine1 ?? ""}
            onChange={(value) => update("addressLine1", value)}
          />
          <TextField
            label="Address line 2"
            value={local.addressLine2 ?? ""}
            onChange={(value) => update("addressLine2", value)}
          />
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <TextField
              label="Suburb"
              value={local.suburb ?? ""}
              onChange={(value) => update("suburb", value)}
            />
            <SelectField
              label="State"
              value={local.state ?? "NSW"}
              options={AU_STATES}
              onChange={(value) => update("state", value)}
            />
            <TextField
              label="Postcode"
              value={local.postcode ?? ""}
              onChange={(value) => update("postcode", value)}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Report defaults</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Prefilled on every new report so you are not retyping the same
              thing each time.
            </p>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField
            label="Default technician name"
            value={local.defaultTechnicianName ?? ""}
            onChange={(value) => update("defaultTechnicianName", value)}
          />
          <TextField
            label="Default technician licence"
            value={local.defaultTechnicianLicence ?? ""}
            onChange={(value) => update("defaultTechnicianLicence", value)}
          />
          <TextArea
            label="Report introduction"
            className="sm:col-span-2"
            rows={4}
            value={local.reportIntroText ?? ""}
            onChange={(value) => update("reportIntroText", value)}
            placeholder="A short paragraph that appears under the cover page of every report — who you are, and what the client is looking at."
          />
          <TextArea
            label="Report footer"
            className="sm:col-span-2"
            rows={2}
            value={local.reportFooterText ?? ""}
            onChange={(value) => update("reportFooterText", value)}
            placeholder="e.g. OptiLink Electrical · Lic 123456C · 1300 000 000 · admin@optilink.com.au"
          />
        </div>
      </section>

      <StandardsReference />
    </div>
  );
}

function ColourField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="field font-mono uppercase"
          maxLength={7}
        />
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/** Read-only reference so the office can see exactly how findings are graded. */
function StandardsReference() {
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">How OptiLink grades findings</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            These are the limits the app applies automatically. They are here so
            you can check them against the current edition of the standards.
          </p>
        </div>
      </div>

      <div className="space-y-6 p-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            RCD trip times — AS/NZS 3017
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">Device</th>
                  <th className="pb-2 pr-4 font-semibold">At rated current (I∆n)</th>
                  <th className="pb-2 font-semibold">At 5 × I∆n</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(RCD_KIND_LIMITS).map(([key, limits]) => (
                  <tr key={key}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-slate-900">{limits.kindLabel}</span>
                      <span className="block text-xs text-slate-500">
                        {limits.description}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                      {limits.minAtRatedMs
                        ? `${limits.minAtRatedMs} – ${limits.maxAtRatedMs} ms`
                        : `≤ ${limits.maxAtRatedMs} ms`}
                    </td>
                    <td className="py-2 font-mono text-xs text-slate-700">
                      {limits.maxAt5xMs ? `≤ ${limits.maxAt5xMs} ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            A ramp test is treated as a pass when the device releases between 50%
            and 100% of its rated residual current.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Thermographic severity — ΔT against an equivalent component
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">Temperature rise</th>
                  <th className="pb-2 pr-4 font-semibold">Rating</th>
                  <th className="pb-2 font-semibold">Recommended timeframe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {thermalBandTable("SIMILAR_COMPONENT").map((band) => (
                  <tr key={band.range}>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-700">
                      {band.range}
                    </td>
                    <td className="py-2 pr-4">
                      <RiskBadge risk={band.risk} />
                    </td>
                    <td className="py-2 text-xs text-slate-600">{band.timeframe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            AS/NZS 3000 and AS/NZS 3017 do not publish infrared temperature-rise
            bands, so OptiLink uses the industry convention (NETA MTS Table
            100.18). Every finding can be overridden by the technician.
          </p>
        </div>
      </div>
    </section>
  );
}
