"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadImage } from "@/components/ImageUpload";
import {
  ACCESSORIES,
  ACCESSORY_LABELS,
  OUTCOMES,
  OUTCOME_LABELS,
  PREPARATIONS,
  PREPARATION_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_NOTES,
  RESULTS,
  RESULT_LABELS,
  SECTIONS,
  SERVICE_KINDS,
  SERVICE_KIND_LABELS,
  answerIsComplete,
  defectsFrom,
  failedSafety,
  itemsFor,
  outcomeAllowed,
  type Accessory,
  type Answers,
  type Defect,
  type Outcome,
  type Preparation,
  type Priority,
  type Result,
  type ServiceKind,
} from "@/lib/gates/form";
import {
  ARM_LENGTHS,
  GATE_TYPE_LABELS,
  OTHER_MODEL,
  describeModel,
  modelsFor,
  type GateType,
} from "@/lib/gates/models";
import { PHOTO_BUDGET } from "@/lib/jobs";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * Servicing one gate, written up as it happens.
 *
 * The form follows the order of the work rather than the order of the printed
 * report: what the unit is, what was set up before anybody touched it, what
 * was inspected, what was measured, what was found wrong, and what state it
 * was left in. Each step saves on its own, because this is filled in on a
 * phone beside a barrier and a form that only saves when it is finished loses
 * the afternoon when the battery goes.
 *
 * Two things it will not do. It will not tick a preparation item on the
 * technician's behalf — a report is not evidence that an isolation happened.
 * And it will not let a gate with a failed safety test be marked returned to
 * service, however the rest of the visit went.
 */

type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  licence: string | null;
  supervisor: string | null;
  titles: string[];
  director: boolean;
  signatureFileId: string | null;
};

type Contact = { id: string; name: string; email: string | null; phone: string | null };

type Photo = { fileId: string; caption: string };

type Report = {
  id: string;
  date: string;
  completedAt: string | null;
  kind: GateType;
  gateLocation: string | null;
  assetNumber: string | null;
  jobNumber: string | null;
  reportNumber: string | null;
  model: string | null;
  serialNumber: string | null;
  controllerModel: string | null;
  controllerFirmware: string | null;
  armLengthMetres: number | null;
  accessories: Accessory[];
  accessoryNotes: string | null;
  previousService: string | null;
  reportedFaults: string | null;
  serviceKind: ServiceKind;
  weather: string | null;
  preparation: Preparation[];
  manualRef: string | null;
  answers: Answers | null;
  defects: Defect[] | null;
  outcome: Outcome | null;
  outcomeNotes: string | null;
  notifiedContactId: string | null;
  notifiedTime: string | null;
  nextServiceDue: string | null;
  intervalBasis: string | null;
  technicianId: string | null;
  clientContactId: string | null;
  photos: { fileId: string; caption: string | null }[];
  site: {
    name: string;
    location: string | null;
    client: { name: string };
    contacts: Contact[];
  };
} & Record<string, unknown>;

/** The free-text fields, in the order the report prints them. */
const MEASUREMENTS: { key: string; label: string; placeholder: string; lines?: number }[] = [
  {
    key: "supplyVoltage",
    label: "Supply voltage and measurement point",
    placeholder: "e.g. 241 V at the isolator line terminals",
  },
  {
    key: "earthTest",
    label: "Protective earth / other electrical tests and method",
    placeholder: "e.g. Earth continuity 0.3 ohm, cabinet to MEN, two-lead method",
  },
  {
    key: "balanceNotes",
    label: "Balance observation and adjustments",
    placeholder: "e.g. Boom held at 45 degrees with the drive released; no adjustment needed",
  },
  {
    key: "lubrication",
    label: "Cleaning, fastener checks and lubrication if specified",
    placeholder: "e.g. Cabinet vacuumed, pivot pins greased per the manual, all fixings checked",
  },
  { key: "partsReplaced", label: "Parts replaced and part numbers", placeholder: "e.g. None" },
  {
    key: "testInstrument",
    label: "Electrical test instrument / serial / calibration",
    placeholder: "e.g. Fluke 1663, S/N 4821, calibrated 12/02/2026",
  },
];

const OPERATING: { key: string; label: string; placeholder: string }[] = [
  { key: "openingTime", label: "Opening time", placeholder: "e.g. 3.1 s" },
  { key: "closingTime", label: "Closing time", placeholder: "e.g. 3.4 s" },
  { key: "autoCloseDelay", label: "Auto-close delay", placeholder: "e.g. 8 s" },
  {
    key: "finalCycles",
    label: "Final test cycles and observations",
    placeholder: "e.g. 12 cycles, smooth throughout, no abnormal noise",
  },
  {
    key: "controllerErrors",
    label: "Controller errors",
    placeholder: "e.g. No errors logged",
  },
  {
    key: "safetyMethod",
    label: "Safety device test method and observed responses",
    placeholder: "e.g. Beam broken with a 50 mm test rod; boom stopped and reversed within 0.5 s",
  },
  {
    key: "forceEquipment",
    label: "Safety / force test equipment, readings and acceptance basis",
    placeholder: "e.g. Not assessed — no force gauge on site this visit",
  },
];

const CLOSING: { key: string; label: string; placeholder: string; lines: number }[] = [
  {
    key: "workCompleted",
    label: "Work completed",
    placeholder: "What was actually carried out on this visit.",
    lines: 4,
  },
  {
    key: "recommendations",
    label: "Recommended work / quotation reference",
    placeholder: "e.g. Replace the photocell mounting post — quote Q-2291",
    lines: 2,
  },
  {
    key: "photoReferences",
    label: "Photo references and descriptions",
    placeholder: "e.g. 1. Cracked boom mount. 2. Corroded gland plate.",
    lines: 2,
  },
];

export function GateDialog({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/gates/${reportId}`, { cache: "no-store" });
    if (!response.ok) {
      setError("That report could not be loaded.");
      return;
    }
    const held: Report = await response.json();
    setReport(held);
    setPhotos(held.photos.map((photo) => ({ fileId: photo.fileId, caption: photo.caption ?? "" })));
  }, [reportId]);

  useEffect(() => {
    void load();
    void fetch("/api/profiles", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setProfiles)
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Saves one change and keeps what came back, so nothing drifts. */
  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setReport((current) => (current ? { ...current, ...patch } : current));
      const response = await fetch(`/api/gates/${reportId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError("That could not be saved.");
        await load();
      } else {
        setError(null);
      }
    },
    [reportId, load],
  );

  const answers: Answers = useMemo(() => report?.answers ?? {}, [report]);
  const accessories = report?.accessories ?? [];
  const type: GateType = report?.kind ?? "BOOM";

  /**
   * The defects, kept in step with the failures above them.
   *
   * A failure is typed once and shows up in both places; anything else written
   * here by hand stays where it was put.
   */
  const defects = useMemo(
    () => defectsFrom(SECTIONS, answers, report?.defects ?? [], type, accessories),
    [answers, report?.defects, type, accessories],
  );

  const blocked = failedSafety(answers);

  const answerItem = (id: string, result: Result) => {
    const next = { ...answers };
    // Choosing the same answer again clears it: an item can go back to
    // unanswered, which is not the same as a pass.
    if (next[id]?.result === result) delete next[id];
    else next[id] = { ...next[id], result };
    void save({ answers: next });
  };

  const noteItem = (id: string, note: string) => {
    const held = answers[id];
    if (!held) return;
    void save({ answers: { ...answers, [id]: { ...held, note } } });
  };

  const saveDefects = (next: Defect[]) => void save({ defects: next });

  async function addPhotos(selection: FileList | null) {
    const pictures = Array.from(selection ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (pictures.length === 0) return;
    setBusy(true);
    try {
      const added: Photo[] = [];
      for (const file of pictures.slice(0, 24 - photos.length)) {
        const image = await uploadImage(file, PHOTO_BUDGET);
        added.push({ fileId: image.id, caption: "" });
      }
      const next = [...photos, ...added];
      setPhotos(next);
      await fetch(`/api/gates/${reportId}/photos`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photos: next }),
      });
    } catch {
      setError("Those photographs could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function savePhotos(next: Photo[]) {
    setPhotos(next);
    await fetch(`/api/gates/${reportId}/photos`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photos: next }),
    });
  }

  if (!report) {
    return (
      <div className="dialog-layer" role="dialog" aria-modal aria-label="Gate service">
        <DialogScrim />
        <div className="dialog is-board is-gate">
          <p className="issue-empty">{error ?? "Opening…"}</p>
          {/* While it is opening there is nothing to go back to, but if it
              failed to open this is the whole dialog — and since the backdrop
              is no longer a way out, it needs one of its own. */}
          {error ? (
            <div className="dialog-actions">
              <button type="button" className="dialog-cancel" onClick={onClose}>
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const technician = profiles.find((profile) => profile.id === report.technicianId) ?? null;
  const models = modelsFor(type);
  const onList = models.some((model) => model.name === report.model);

  /** Field helpers, so the markup below stays about the form rather than the plumbing. */
  const text = (key: string, label: string, placeholder: string, lines = 0) => (
    <label className="dialog-field" key={key}>
      <span className="dialog-label">{label}</span>
      {lines > 0 ? (
        <textarea
          rows={lines}
          className="dialog-input dialog-textarea"
          placeholder={placeholder}
          defaultValue={(report[key] as string) ?? ""}
          onBlur={(event) => void save({ [key]: event.target.value })}
        />
      ) : (
        <input
          className="dialog-input"
          placeholder={placeholder}
          defaultValue={(report[key] as string) ?? ""}
          onBlur={(event) => void save({ [key]: event.target.value })}
        />
      )}
    </label>
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Gate service">
      <DialogScrim />

      <div className="dialog is-board is-gate">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Gate service</h2>
            <p className="board-section-note">
              {report.site.client.name}
              {"  ·  "}
              {report.site.name}
              {report.gateLocation ? `  ·  ${report.gateLocation}` : ""}
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            {/* --- the unit ------------------------------------------------ */}
            <div className="board-section-head">
              <h3 className="board-section-title">The gate</h3>
              <p className="board-section-note">
                One report per unit. A second gate on this site is a second report.
              </p>
            </div>

            <div className="issue-picks is-row">
              {(["BOOM", "SLIDING"] as GateType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`issue-pick ${type === option ? "is-on" : ""}`}
                  onClick={() => void save({ kind: option, model: null })}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{GATE_TYPE_LABELS[option]}</span>
                  </span>
                </button>
              ))}
            </div>

            {text("gateLocation", "Gate location", "e.g. Staff car park, north entry")}
            <div className="gate-pair">
              {text("assetNumber", "Asset number", "e.g. BG-04")}
              {text("jobNumber", "Job number", "e.g. 4821")}
            </div>
            {text("reportNumber", "Report number", "e.g. GS-2026-017")}

            <label className="dialog-field">
              <span className="dialog-label">
                {type === "BOOM" ? "Barrier model" : "Operator model"}
              </span>
              <select
                className="dialog-input"
                value={onList ? report.model ?? "" : report.model ? OTHER_MODEL : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  void save({ model: value === OTHER_MODEL ? " " : value || null });
                }}
              >
                <option value="">Choose a model</option>
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name} — {describeModel(model)}
                  </option>
                ))}
                <option value={OTHER_MODEL}>Other — enter manually</option>
              </select>
            </label>
            {report.model !== null && !onList ? (
              <label className="dialog-field">
                <span className="dialog-label">Model, as it is written on the unit</span>
                <input
                  className="dialog-input"
                  autoFocus
                  placeholder="e.g. BFT MOOVI 30S"
                  defaultValue={report.model?.trim() ?? ""}
                  onBlur={(event) => void save({ model: event.target.value })}
                />
              </label>
            ) : null}
            <p className="amp-hint is-standalone">
              This list is a starting point, not everything BFT has made. Anything not on it
              goes in by hand, and the report says where a model&rsquo;s details came from.
            </p>

            {text("serialNumber", "Serial number", "e.g. 2041887")}

            <div className="gate-pair">
              {text("controllerModel", "Controller model", "e.g. Merak BM")}
              {text("controllerFirmware", "Controller firmware", "e.g. 1.4")}
            </div>
            <p className="amp-hint is-standalone">
              The controller is the board inside the cabinet, which is not the same thing as
              the barrier or operator model above it.
            </p>

            {type === "BOOM" ? (
              <label className="dialog-field">
                <span className="dialog-label">Boom length (metres)</span>
                <input
                  className="dialog-input"
                  inputMode="decimal"
                  list="gate-arms"
                  placeholder="e.g. 4.5"
                  defaultValue={report.armLengthMetres ?? ""}
                  onBlur={(event) => void save({ armLengthMetres: event.target.value })}
                />
                <datalist id="gate-arms">
                  {ARM_LENGTHS.map((metres) => (
                    <option key={metres} value={metres} />
                  ))}
                </datalist>
              </label>
            ) : null}

            {/* --- accessories --------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Fitted accessories</h3>
              <p className="board-section-note">
                What is on this gate. The tests below follow from it — a question about a
                safety edge on a gate with no safety edge is not a question.
              </p>
            </div>

            <div className="issue-picks">
              {ACCESSORIES.map((accessory) => (
                <button
                  key={accessory}
                  type="button"
                  className={`issue-pick ${accessories.includes(accessory) ? "is-on" : ""}`}
                  onClick={() =>
                    void save({
                      accessories: accessories.includes(accessory)
                        ? accessories.filter((held) => held !== accessory)
                        : [...accessories, accessory],
                    })
                  }
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{ACCESSORY_LABELS[accessory]}</span>
                  </span>
                </button>
              ))}
            </div>
            {text("accessoryNotes", "Anything else fitted", "e.g. Traffic light head on the exit side", 2)}

            {text("previousService", "Previous service", "Text, or N/A", 2)}
            {text("reportedFaults", "Reported faults", "Text, or N/A", 2)}

            {/* --- preparation --------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Preparation and scope</h3>
              <p className="board-section-note">
                Tick what you actually did. None of this is ticked for you — a report is not
                evidence that an isolation happened.
              </p>
            </div>

            <div className="issue-picks is-row">
              {SERVICE_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`issue-pick ${report.serviceKind === option ? "is-on" : ""}`}
                  onClick={() => void save({ serviceKind: option })}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{SERVICE_KIND_LABELS[option]}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="issue-picks">
              {PREPARATIONS.map((step) => (
                <button
                  key={step}
                  type="button"
                  className={`issue-pick ${report.preparation.includes(step) ? "is-on" : ""}`}
                  onClick={() =>
                    void save({
                      preparation: report.preparation.includes(step)
                        ? report.preparation.filter((held) => held !== step)
                        : [...report.preparation, step],
                    })
                  }
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{PREPARATION_LABELS[step]}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="issue-add is-quiet"
              onClick={() =>
                void save({
                  preparation:
                    report.preparation.length === PREPARATIONS.length ? [] : [...PREPARATIONS],
                })
              }
            >
              {report.preparation.length === PREPARATIONS.length
                ? "Clear them all"
                : "Confirm all of them"}
            </button>

            {text("weather", "Weather / site conditions", "e.g. Fine, 22 degrees, dry underfoot")}
            {text(
              "manualRef",
              "Manual / revision and scope limitations",
              "e.g. BFT D814017 2FA00_02. Underside of the cabinet not accessible without lifting gear.",
              2,
            )}

            {/* --- the inspection ------------------------------------------ */}
            {SECTIONS.map((section) => (
              <div key={section.id}>
                <div className="board-section-head">
                  <h3 className="board-section-title">{section.title}</h3>
                  {section.note ? (
                    <p className="board-section-note">{section.note}</p>
                  ) : null}
                </div>

                {section.id === "safety" ? (
                  <button
                    type="button"
                    className="issue-add is-quiet"
                    onClick={() => setShowAll((current) => !current)}
                  >
                    {showAll
                      ? "Show only what is fitted"
                      : "Show every test, fitted or not"}
                  </button>
                ) : null}

                <ol className="gate-items">
                  {itemsFor(section, type, accessories, showAll).map((item) => {
                    const answer = answers[item.id];
                    const needsNote =
                      answer?.result === "FAIL" || answer?.result === "NOT_TESTED";
                    return (
                      <li className="gate-item" key={item.id}>
                        <p className="gate-item-label">{item.label}</p>
                        <div className="issue-picks is-row is-tight">
                          {RESULTS.map((result) => (
                            <button
                              key={result}
                              type="button"
                              className={`issue-pick is-phase ${
                                answer?.result === result ? "is-on" : ""
                              } ${result === "FAIL" && answer?.result === result ? "is-bad" : ""}`}
                              onClick={() => answerItem(item.id, result)}
                            >
                              <span className="issue-pick-mark is-one" aria-hidden />
                              <span className="issue-pick-body">
                                <span className="issue-pick-label">
                                  {RESULT_LABELS[result]}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                        {answer ? (
                          <input
                            className="dialog-input gate-item-note"
                            placeholder={
                              needsNote
                                ? answer.result === "FAIL"
                                  ? "What failed — this becomes the defect below"
                                  : "Why it was not tested"
                                : "Note (optional)"
                            }
                            defaultValue={answer.note ?? ""}
                            onBlur={(event) => noteItem(item.id, event.target.value)}
                          />
                        ) : null}
                        {needsNote && !answerIsComplete(answer) ? (
                          <p className="amp-warning">
                            {answer.result === "FAIL"
                              ? "A failure needs to say what failed."
                              : "Say why it was not tested."}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}

            {/* --- measurements -------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Recorded measurements and service work</h3>
              <p className="board-section-note">
                What was actually measured and done. Nothing here is filled in for you.
              </p>
            </div>
            {MEASUREMENTS.filter(
              (field) => !(type === "SLIDING" && field.key === "balanceNotes"),
            ).map((field) => text(field.key, field.label, field.placeholder, field.lines ?? 0))}

            <div className="board-section-head">
              <h3 className="board-section-title">Operating record</h3>
            </div>
            {OPERATING.map((field) => text(field.key, field.label, field.placeholder))}

            {/* --- defects -------------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Defects and rectification</h3>
              <p className="board-section-note">
                Every failure above is here already, with what you wrote against it. Add
                anything else found that was not one of the listed checks.
              </p>
            </div>

            {defects.length === 0 ? (
              <p className="issue-empty">No defects recorded.</p>
            ) : (
              <ol className="gate-defects">
                {defects.map((defect, index) => (
                  <li className="gate-defect" key={`${defect.ref}:${index}`}>
                    <div className="gate-defect-head">
                      <span className="amp-row-number">{defect.ref}</span>
                      <input
                        className="dialog-input"
                        placeholder="Finding and location"
                        defaultValue={defect.finding}
                        readOnly={Boolean(defect.fromItem)}
                        title={
                          defect.fromItem
                            ? "This came from a failed check above — change it there."
                            : undefined
                        }
                        onBlur={(event) =>
                          saveDefects(
                            defects.map((held, at) =>
                              at === index ? { ...held, finding: event.target.value } : held,
                            ),
                          )
                        }
                      />
                      {defect.fromItem ? null : (
                        <button
                          type="button"
                          className="amp-move is-remove"
                          aria-label="Remove this defect"
                          onClick={() =>
                            saveDefects(defects.filter((_, at) => at !== index))
                          }
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="issue-picks is-row is-tight">
                      {PRIORITIES.map((priority: Priority) => (
                        <button
                          key={priority}
                          type="button"
                          className={`issue-pick is-phase ${
                            defect.priority === priority ? "is-on" : ""
                          }`}
                          title={PRIORITY_NOTES[priority]}
                          onClick={() =>
                            saveDefects(
                              defects.map((held, at) =>
                                at === index ? { ...held, priority } : held,
                              ),
                            )
                          }
                        >
                          <span className="issue-pick-mark is-one" aria-hidden />
                          <span className="issue-pick-body">
                            <span className="issue-pick-label">
                              {PRIORITY_LABELS[priority]}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <input
                      className="dialog-input"
                      placeholder="Action / status"
                      defaultValue={defect.action}
                      onBlur={(event) =>
                        saveDefects(
                          defects.map((held, at) =>
                            at === index ? { ...held, action: event.target.value } : held,
                          ),
                        )
                      }
                    />
                  </li>
                ))}
              </ol>
            )}

            <button
              type="button"
              className="issue-add is-quiet"
              onClick={() =>
                saveDefects([
                  ...defects,
                  { ref: "", finding: "", priority: "ROUTINE", action: "" },
                ])
              }
            >
              Add a defect
            </button>

            {/* --- closing -------------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Work completed and recommendations</h3>
            </div>
            {CLOSING.map((field) => text(field.key, field.label, field.placeholder, field.lines))}

            {/* --- photographs ---------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Photographs</h3>
              <p className="board-section-note">
                Referenced from the report. Up to twenty-four.
              </p>
            </div>

            {photos.length > 0 ? (
              <div className="issue-shots">
                {photos.map((photo, index) => (
                  <figure key={photo.fileId} className="issue-shot">
                    <Image
                      src={`/api/files/${photo.fileId}`}
                      alt={photo.caption || "Service photograph"}
                      width={220}
                      height={165}
                    />
                    <button
                      type="button"
                      className="board-photo-remove"
                      aria-label="Remove photo"
                      onClick={() =>
                        void savePhotos(photos.filter((_, at) => at !== index))
                      }
                    >
                      ×
                    </button>
                    <input
                      className="dialog-input gate-caption"
                      placeholder="Caption"
                      defaultValue={photo.caption}
                      onBlur={(event) =>
                        void savePhotos(
                          photos.map((held, at) =>
                            at === index ? { ...held, caption: event.target.value } : held,
                          ),
                        )
                      }
                    />
                  </figure>
                ))}
              </div>
            ) : null}

            <input
              ref={picker}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                void addPhotos(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="issue-add"
              disabled={busy}
              onClick={() => picker.current?.click()}
            >
              {busy ? "Uploading…" : "Add photos"}
            </button>

            {/* --- outcome --------------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Service outcome</h3>
            </div>

            {blocked.length > 0 ? (
              <p className="amp-warning">
                A safety test failed, so this gate cannot be marked returned to service.
                Record what was done about it and leave it isolated or returned with
                documented defects.
              </p>
            ) : null}

            <div className="issue-picks">
              {OUTCOMES.map((outcome) => {
                const allowed = outcomeAllowed(outcome, answers);
                return (
                  <button
                    key={outcome}
                    type="button"
                    className={`issue-pick ${report.outcome === outcome ? "is-on" : ""} ${
                      allowed ? "" : "is-full"
                    }`}
                    disabled={!allowed}
                    onClick={() => void save({ outcome })}
                  >
                    <span className="issue-pick-mark is-one" aria-hidden />
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">{OUTCOME_LABELS[outcome]}</span>
                      {allowed ? null : (
                        <span className="issue-pick-note">
                          Not available with a failed safety test
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {text(
              "outcomeNotes",
              "Reason / restrictions / isolation details",
              "e.g. Supply isolated and locked off at the cabinet. Barrier left raised and barricaded.",
              2,
            )}

            {/* --- notification and next service ------------------------------ */}
            <div className="board-section-head">
              <h3 className="board-section-title">Client notified, and the next service</h3>
            </div>

            <label className="dialog-field">
              <span className="dialog-label">Who was notified</span>
              <select
                className="dialog-input"
                value={report.notifiedContactId ?? ""}
                onChange={(event) => void save({ notifiedContactId: event.target.value || null })}
              >
                <option value="">Nobody recorded</option>
                {report.site.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            {text("notifiedTime", "Time notified", "e.g. 2:40 PM")}

            <div className="gate-pair">
              <label className="dialog-field">
                <span className="dialog-label">Service date</span>
                <input
                  type="date"
                  className="dialog-input"
                  value={report.date.slice(0, 10)}
                  onChange={(event) => void save({ date: event.target.value })}
                />
              </label>
              <label className="dialog-field">
                <span className="dialog-label">Next service due</span>
                <input
                  type="date"
                  className="dialog-input"
                  value={report.nextServiceDue?.slice(0, 10) ?? ""}
                  onChange={(event) => void save({ nextServiceDue: event.target.value })}
                />
              </label>
            </div>
            <p className="amp-hint is-standalone">
              A year after the service date, recalculated if that date moves. Change it where
              the usage, the environment or the manufacturer&rsquo;s schedule asks for a
              different interval, and say why below.
            </p>
            {text(
              "intervalBasis",
              "Proposed interval and basis",
              "e.g. Six months — heavy cycle count on a loading dock in salt air",
              2,
            )}

            {/* --- sign off ---------------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Sign off</h3>
              <p className="board-section-note">
                The technician&rsquo;s name, credentials and signature come from their profile.
              </p>
            </div>

            <div className="issue-picks">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`issue-pick ${report.technicianId === profile.id ? "is-on" : ""}`}
                  onClick={() =>
                    void save({
                      technicianId: report.technicianId === profile.id ? null : profile.id,
                    })
                  }
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">
                      {profile.firstName} {profile.lastName}
                    </span>
                    <span className="issue-pick-note">
                      {[
                        profile.director ? "Director" : null,
                        profile.signatureFileId ? "Signature on file" : "No signature on file",
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {technician && !technician.signatureFileId ? (
              <p className="amp-warning">
                {technician.firstName} has no signature on file, so the report prints the name
                over an empty signature line. Add one under Profiles.
              </p>
            ) : null}

            <label className="dialog-field">
              <span className="dialog-label">Client representative</span>
              <select
                className="dialog-input"
                value={report.clientContactId ?? ""}
                onChange={(event) => void save({ clientContactId: event.target.value || null })}
              >
                <option value="">Nobody chosen</option>
                {report.site.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="amp-hint is-standalone">
              Their name is printed. The signature and date are left blank for them to fill in.
            </p>

            <button
              type="button"
              className={`issue-add ${report.completedAt ? "is-quiet" : ""}`}
              onClick={() => void save({ completed: !report.completedAt })}
            >
              {report.completedAt
                ? `Completed ${new Date(report.completedAt).toLocaleString("en-AU", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })} — reopen it`
                : "Mark the service complete"}
            </button>
          </div>
        </div>

        {error ? <p className="dialog-error">{error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="issue-add is-quiet"
            onClick={() => window.open(`/api/gates/${reportId}/report?preview=1`, "_blank")}
          >
            Preview
          </button>
          <button
            type="button"
            className="dialog-confirm"
            onClick={() => window.open(`/api/gates/${reportId}/report`, "_blank")}
          >
            Download the report
          </button>
        </div>
      </div>
    </div>
  );
}
