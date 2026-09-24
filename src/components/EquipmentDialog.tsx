"use client";

import { useEffect, useState } from "react";
import { uploadFile, uploadImage } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Adding a piece of our own test gear.
 *
 * Not equipment at a client's site — this is the instrument in the van, and
 * what a report needs from it is what it is called, what it is, and the
 * certificate that says it reads true. The certificate is bound into every
 * report the instrument's readings appear in, so it is asked for here rather
 * than hunted for later.
 */

export type EquipmentDraft = {
  id?: string;
  name: string;
  serialNo: string | null;
  modelNo: string | null;
  certFileId: string | null;
  certName: string | null;
  photoFileId: string | null;
  photoUrl: string | null;
  /** Both as "2025-12-12", which is what a date input wants. */
  calibratedOn: string | null;
  expiresOn: string | null;
};

export const EMPTY_EQUIPMENT: EquipmentDraft = {
  name: "",
  serialNo: null,
  modelNo: null,
  certFileId: null,
  certName: null,
  photoFileId: null,
  photoUrl: null,
  calibratedOn: null,
  expiresOn: null,
};

export function EquipmentDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: EquipmentDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const key = `equipment:${initial.id ?? "new"}`;
  const [draft, setDraft] = usePersisted<EquipmentDraft>(key, initial);
  const [busy, setBusy] = useState<null | "cert" | "reading" | "photo" | "save">(null);
  const [read, setRead] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close() only drops the draft and calls the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  function close() {
    clearSession(key);
    onClose();
  }

  function set<K extends keyof EquipmentDraft>(field: K, value: EquipmentDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function takeCertificate(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy("cert");
    setError(null);
    setRead(null);
    try {
      const stored = await uploadFile(file);
      setDraft((current) => ({
        ...current,
        certFileId: stored.id,
        certName: stored.originalName,
      }));
      await readCertificate(stored.id);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "That certificate could not be uploaded.",
      );
      setBusy(null);
    }
  }

  /**
   * Ask what the certificate says, and fill in what comes back.
   *
   * A certificate that was typed is read straight out of the file; one that
   * was printed and scanned has to be put through character recognition,
   * which takes a few seconds and is a reading rather than a quotation. Either
   * way what it found lands in the fields below, where it can be looked at
   * against the certificate and corrected before it goes near a report.
   */
  async function readCertificate(fileId: string) {
    setBusy("reading");
    try {
      const response = await fetch("/api/test-equipment/read-certificate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!response.ok) throw new Error("unread");
      const found = (await response.json()) as {
        serialNo: string | null;
        modelNo: string | null;
        calibratedOn: string | null;
        expiresOn: string | null;
        expiryDerived: boolean;
      };

      setDraft((current) => ({
        ...current,
        // Nothing typed is ever overwritten — the person holding the meter
        // knows it better than a pattern match does.
        serialNo: current.serialNo || found.serialNo,
        modelNo: current.modelNo || found.modelNo,
        calibratedOn: found.calibratedOn ?? current.calibratedOn,
        expiresOn: found.expiresOn ?? current.expiresOn,
      }));

      setRead(
        found.calibratedOn
          ? found.expiryDerived
            ? "Read off the certificate. It states no due date, so this is a year on — change it if the laboratory set a different interval."
            : "Read off the certificate. Check both dates against it."
          : "No date could be read off this certificate. Fill the dates in by hand.",
      );
    } catch {
      setRead("This certificate could not be read. Fill the dates in by hand.");
    } finally {
      setBusy(null);
    }
  }

  async function takePhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy("photo");
    setError(null);
    try {
      const stored = await uploadImage(file);
      setDraft((current) => ({
        ...current,
        photoFileId: stored.id,
        photoUrl: stored.url,
      }));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "That photo could not be uploaded.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft.name.trim() || busy) return;
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(
        draft.id ? `/api/test-equipment/${draft.id}` : "/api/test-equipment",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            serialNo: draft.serialNo ?? "",
            modelNo: draft.modelNo ?? "",
            certFileId: draft.certFileId,
            photoFileId: draft.photoFileId,
            calibratedOn: draft.calibratedOn,
            expiresOn: draft.expiresOn,
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That could not be saved.");
      }
      clearSession(key);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That could not be saved.");
      setBusy(null);
    }
  }

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Equipment">
      <button className="dialog-scrim" onClick={close} aria-label="Close" tabIndex={-1} />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">{draft.id ? "Equipment" : "New equipment"}</h2>
            <p className="board-section-note">
              Ours, not the client&rsquo;s. Its certificate goes into every report its
              readings appear in.
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            <label className="dialog-field">
              <span className="dialog-label">Equipment name</span>
              <input
                className="dialog-input"
                autoFocus
                placeholder="e.g. MultiFunction Electrical Analyzer"
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </label>

            <div className="supply-grid">
              <label className="dialog-field">
                <span className="dialog-label">Serial no</span>
                <input
                  className="dialog-input"
                  placeholder="e.g. 210457891"
                  value={draft.serialNo ?? ""}
                  onChange={(event) => set("serialNo", event.target.value || null)}
                />
              </label>
              <label className="dialog-field">
                <span className="dialog-label">Model no</span>
                <input
                  className="dialog-input"
                  placeholder="e.g. GSC60"
                  value={draft.modelNo ?? ""}
                  onChange={(event) => set("modelNo", event.target.value || null)}
                />
              </label>
            </div>

            <div className="board-section-head">
              <h3 className="board-section-title">Calibration certificate</h3>
              <p className="board-section-note">
                The PDF as it was issued. Its pages are reproduced on the report exactly,
                not retyped.
              </p>
            </div>
            <label className="rcd-drop">
              {busy === "cert"
                ? "Uploading…"
                : busy === "reading"
                  ? "Reading the certificate…"
                  : draft.certName
                    ? `Replace — ${draft.certName}`
                    : "Choose the certificate"}
              <input
                type="file"
                accept=".pdf,application/pdf"
                hidden
                disabled={busy !== null}
                onChange={(event) => {
                  void takeCertificate(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            <div className="supply-grid">
              <label className="dialog-field">
                <span className="dialog-label">Certification date</span>
                <input
                  type="date"
                  className="dialog-input"
                  value={draft.calibratedOn ?? ""}
                  onChange={(event) => set("calibratedOn", event.target.value || null)}
                />
              </label>
              <label className="dialog-field">
                <span className="dialog-label">Due/expiry date</span>
                <input
                  type="date"
                  className="dialog-input"
                  value={draft.expiresOn ?? ""}
                  onChange={(event) => set("expiresOn", event.target.value || null)}
                />
              </label>
            </div>
            <p className="board-section-note is-standalone">
              {read ??
                "Filled in from the certificate when one is chosen. Both dates print on every report this instrument appears in, so check them against the certificate."}
            </p>

            <div className="board-section-head">
              <h3 className="board-section-title">
                Photograph <em>optional</em>
              </h3>
            </div>
            {draft.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="equipment-photo" src={draft.photoUrl} alt={draft.name} />
            ) : null}
            <label className="rcd-drop">
              {busy === "photo"
                ? "Uploading…"
                : draft.photoUrl
                  ? "Replace the photograph"
                  : "Choose a photograph"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  void takePhoto(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>

            {error ? <p className="dialog-error">{error}</p> : null}
          </div>
        </div>

        <footer className="board-foot">
          <div className="dialog-actions">
            <button type="button" className="dialog-cancel" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-confirm"
              disabled={!draft.name.trim() || busy !== null}
              onClick={() => void save()}
            >
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
