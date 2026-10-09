"use client";

import { useCallback, useEffect, useState } from "react";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * The gates saved at one site.
 *
 * What is held here is what the unit *is* — its number, where it stands, the
 * operator, the controller, the boom, what is bolted to it. It is the half of
 * a service report that is the same every year, so it is described once and
 * every visit starts from it.
 *
 * Nothing that was a finding is here, and that is deliberate. No result, no
 * measurement, no signature, no defect and no outcome: those belong to a
 * visit, and a gate record that carried them would present last year's pass
 * as this year's. Editing a gate changes what the *next* report starts from
 * and never reaches back into one already issued.
 */

export type Asset = {
  id: string;
  assetNumber: string | null;
  gateLocation: string | null;
  kind: "BOOM" | "SLIDING";
  model: string | null;
  serialNumber: string | null;
  controllerModel: string | null;
  controllerFirmware: string | null;
  armLengthMetres: number | null;
  accessories: string[];
  accessoryNotes: string | null;
  manualRef: string | null;
  previousService: string | null;
  archivedAt: string | null;
};

const FIELDS: { key: keyof Asset; label: string; placeholder: string; boom?: boolean }[] = [
  { key: "assetNumber", label: "Asset number", placeholder: "e.g. BG-04" },
  { key: "gateLocation", label: "Gate location", placeholder: "e.g. Main entry, inbound lane" },
  { key: "model", label: "Operator model", placeholder: "e.g. GIOTTO BT A ULTRA 36 XL" },
  { key: "serialNumber", label: "Operator serial number", placeholder: "From the plate" },
  { key: "controllerModel", label: "Controller model", placeholder: "e.g. LIBRA C MA" },
  { key: "controllerFirmware", label: "Controller firmware", placeholder: "As displayed" },
  { key: "armLengthMetres", label: "Boom length (m)", placeholder: "e.g. 4.5", boom: true },
  { key: "manualRef", label: "Relevant manual", placeholder: "Document number and revision" },
  {
    key: "previousService",
    label: "Previous service / report reference",
    placeholder: "The last report issued against this gate",
  },
  { key: "accessoryNotes", label: "Fitted accessories", placeholder: "Photocells, loops, beacon…" },
];

const blank = (): Partial<Asset> => ({ kind: "BOOM" });

export function GateAssetsDialog({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [draft, setDraft] = useState<Partial<Asset> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/gate-assets?siteId=${siteId}`, { cache: "no-store" });
    if (!response.ok) {
      setError("Those gates could not be read.");
      return;
    }
    setAssets(await response.json());
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That did not save.");
      }
      await load();
      return await Promise.resolve(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "That did not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const body = { ...draft, siteId };
    const ok = draft.id
      ? await send(`/api/gate-assets/${draft.id}`, "PATCH", body)
      : await send("/api/gate-assets", "POST", body);
    if (ok) setDraft(null);
  }

  async function removeAsset(asset: Asset) {
    const name = asset.assetNumber || asset.gateLocation || "this gate";
    if (!window.confirm(`Remove ${name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/gate-assets/${asset.id}`, { method: "DELETE" });
      const result = (await response.json()) as { archived?: boolean; reports?: number };
      if (!response.ok) throw new Error("That gate could not be removed.");
      setNote(
        result.archived
          ? `${name} has ${result.reports} report${result.reports === 1 ? "" : "s"} against it, so it has been archived rather than deleted. Those reports still say which gate they were about.`
          : null,
      );
      await load();
    } catch {
      setError("That gate could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Asset, label: string, placeholder: string) => (
    <label className="dialog-field" key={String(key)}>
      <span className="dialog-label">{label}</span>
      <input
        className="dialog-input"
        placeholder={placeholder}
        value={String(draft?.[key] ?? "")}
        onChange={(event) =>
          setDraft((current) => ({ ...(current ?? {}), [key]: event.target.value }))
        }
      />
    </label>
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Saved gates">
      <DialogScrim />
      <div className="dialog is-issue">
        <div className="issue-head">
          <h2 className="dialog-title">Saved gates</h2>
          <p className="board-section-note">
            Described once, so every visit starts from the unit. Nothing recorded on a
            visit — a result, a measurement, a defect or a signature — is kept here.
          </p>
        </div>

        <div className="dialog-fields">
          {note ? <p className="amp-warning">{note}</p> : null}

          {assets.length === 0 && !draft ? (
            <p className="issue-empty">No gates saved at this site yet.</p>
          ) : null}

          {assets.map((asset) => (
            <div className="tagging-reference" key={asset.id}>
              <p className="tagging-file">
                {asset.assetNumber || asset.gateLocation || "Unnamed gate"}
              </p>
              <p className="amp-figures">
                {[
                  asset.kind === "SLIDING" ? "Sliding gate" : "Boom gate",
                  asset.gateLocation,
                  asset.model,
                  asset.serialNumber ? `S/N ${asset.serialNumber}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>
              <div className="tagging-actions">
                <button
                  type="button"
                  className="issue-add"
                  disabled={busy}
                  onClick={() => setDraft({ ...asset })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="issue-add"
                  disabled={busy}
                  onClick={() => void send(`/api/gate-assets/${asset.id}`, "POST")}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="tagging-remove"
                  disabled={busy}
                  onClick={() => void removeAsset(asset)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {draft ? (
            <div className="safety-question">
              <div className="board-section-head">
                <h3 className="board-section-title">
                  {draft.id ? "Editing this gate" : "A new gate"}
                </h3>
                <p className="board-section-note">
                  Changing this changes what the next report starts from. A report already
                  issued keeps its own copy and does not move.
                </p>
              </div>

              <div className="issue-picks is-row">
                {(["BOOM", "SLIDING"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`issue-pick ${draft.kind === kind ? "is-on" : ""}`}
                    onClick={() => setDraft((current) => ({ ...(current ?? {}), kind }))}
                  >
                    <span className="issue-pick-mark is-one" aria-hidden />
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">
                        {kind === "BOOM" ? "Boom gate" : "Sliding gate"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {FIELDS.filter((one) => !one.boom || draft.kind === "BOOM").map((one) =>
                field(one.key, one.label, one.placeholder),
              )}

              <div className="tagging-actions">
                <button
                  type="button"
                  className="dialog-confirm"
                  disabled={busy}
                  onClick={() => void saveDraft()}
                >
                  {busy ? "Saving…" : "Save gate"}
                </button>
                <button type="button" className="dialog-cancel" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="issue-add" onClick={() => setDraft(blank())}>
              Add a gate
            </button>
          )}
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-confirm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
