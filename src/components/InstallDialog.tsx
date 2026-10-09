"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PreparedByPicks } from "@/components/PreparedByPicks";
import { uploadFile } from "@/components/ImageUpload";
import { MEASUREMENT_LABELS, resistanceReads, voltsLine } from "@/lib/install/parse";
import { PHASE_LABELS } from "@/lib/install/points";
import {
  CATEGORIES,
  KNOWN_FUNCTIONS,
  MARK_LABELS,
  PRESETS,
  SECTIONS,
  SECTION_LABELS,
  STATUS_LABELS,
  presetArrangement,
  ref,
  slotLabel,
  type Analysis,
  type Arrangement,
  type Assignment,
  type CategoryEntry,
  type CategoryKey,
  type FileSection,
  type Mark,
  type MarkEntry,
  type Phases,
  type Rec,
  type Section,
  type Status,
} from "@/lib/install/session";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * Putting an installation test together, before it is issued.
 *
 * Top to bottom it follows the order the rules are applied in: what was
 * tested, the Section 8 checklist, the tester files in each section, which
 * records are accepted, how the accepted ones are grouped, and what still
 * needs a decision. The grouping is worked out on the server from what is
 * saved here, so the screen and the report never disagree.
 *
 * Nothing here deletes a reading. A record set aside stays listed with its
 * reason, is printed in the report's appendix, and comes back when the mark
 * is taken off.
 */

type FileMeta = {
  fileId: string;
  originalName: string;
  section: FileSection;
  excludeFirst: boolean;
  dummyConfirmed: boolean;
  count: number;
};

type Report = {
  id: string;
  date: string;
  phases: Phases;
  installation: string | null;
  circuitDetails: string | null;
  contactId: string | null;
  instrumentId: string | null;
  preparedBy: string[];
  site: {
    name: string;
    client: { name: string };
    contacts: { id: string; name: string }[];
  };
  files: FileMeta[];
  marks: Record<string, MarkEntry>;
  arrangements: Record<Section, Arrangement>;
  groupNames: Partial<Record<Section, string[]>>;
  assignments: Record<string, Assignment>;
  verification: Record<CategoryKey, CategoryEntry>;
  analysis: Analysis;
};

type Instrument = { id: string; name: string; serialNo: string | null };

/** What a record read, in a few characters. */
function reads(record: Rec): string {
  if (record.kind === "INSULATION") return resistanceReads(record);
  if (record.kind === "VOLTAGE_PHASE") {
    const own = record.terminals ? record.readings[record.terminals] : undefined;
    return record.terminals ? `${record.terminals} ${own ?? "—"} V` : voltsLine(record);
  }
  if (record.kind === "RCD" && record.rcd) {
    const rated = record.rcd.ratedAt0;
    return `${record.rcd.ratingMa ?? "?"} mA · ×1 ${rated === "NO_TRIP" ? "no trip" : rated === null ? "---" : `${rated} ms`}`;
  }
  return "—";
}

const list = (text: string) =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function InstallDialog({
  reportId,
  onClose,
}: {
  reportId: string;
  onClose: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pickers = useRef<Partial<Record<Section, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    const response = await fetch(`/api/install/${reportId}`, { cache: "no-store" });
    if (!response.ok) {
      setError("That report could not be loaded.");
      return;
    }
    setReport(await response.json());
  }, [reportId]);

  useEffect(() => {
    void load();
    void fetch("/api/test-equipment", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setInstruments)
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      const response = await fetch(`/api/install/${reportId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) setError("That could not be saved.");
      else setError(null);
      // Reloaded rather than merged: the accepted records, the groups and the
      // issues all follow from each other, and are worked out in one place.
      await load();
    },
    [reportId, load],
  );

  const addFiles = useCallback(
    async (section: Section, chosen: File[]) => {
      setBusy(section);
      setError(null);
      try {
        // One at a time, in the order chosen, so the confirmed order is the
        // order they were picked in.
        for (const file of chosen) {
          const stored = await uploadFile(file);
          const response = await fetch(`/api/install/${reportId}/files`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fileId: stored.id, section }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(`${file.name}: ${payload.error ?? "that file could not be read."}`);
          }
        }
      } catch (addError) {
        setError(addError instanceof Error ? addError.message : "That upload failed.");
      } finally {
        setBusy(null);
        await load();
      }
    },
    [reportId, load],
  );

  if (!report) {
    return (
      <div className="dialog-layer" role="dialog" aria-modal aria-label="Installation test">
        <DialogScrim />
        <div className="dialog is-board is-gate">
          <p className="issue-empty">{error ?? "Loading the report…"}</p>
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

  const { analysis } = report;
  const byId = new Map(analysis.records.map((record) => [record.id, record]));

  /* --- saving pieces of it ----------------------------------------------------- */
  const saveFiles = (files: FileMeta[]) =>
    void save({
      files: files.map(({ fileId, excludeFirst, dummyConfirmed }) => ({ fileId, excludeFirst, dummyConfirmed })),
    });

  const moveFile = (fileId: string, step: -1 | 1) => {
    const files = [...report.files];
    const at = files.findIndex((file) => file.fileId === fileId);
    const section = files[at].section;
    // The next file in the same section, wherever it sits in the full list.
    let other = at + step;
    while (other >= 0 && other < files.length && files[other].section !== section) other += step;
    if (other < 0 || other >= files.length) return;
    [files[at], files[other]] = [files[other], files[at]];
    saveFiles(files);
  };

  const setFile = (fileId: string, patch: Partial<FileMeta>) =>
    saveFiles(report.files.map((file) => (file.fileId === fileId ? { ...file, ...patch } : file)));

  const removeFile = (file: FileMeta) => {
    if (!window.confirm(`Remove ${file.originalName} and its ${file.count} records from this report?`)) return;
    saveFiles(report.files.filter((held) => held.fileId !== file.fileId));
  };

  const setMark = (record: Rec, mark: Mark | "", reason?: string) => {
    const marks = { ...report.marks };
    if (!mark) {
      delete marks[record.id];
      void save({ marks });
      return;
    }
    let confirmedFailure = marks[record.id]?.confirmedFailure;
    if (mark === "ACCIDENTAL" && record.flags.some((flag) => flag.failureLike)) {
      confirmedFailure = window.confirm(
        `${ref(record)} reads like a possible failure (${record.flags[0].text}). ` +
          "Confirm it was an accidental test and should be left out of the results?",
      );
      if (!confirmedFailure) return;
    }
    marks[record.id] = { mark, reason: reason ?? marks[record.id]?.reason, confirmedFailure };
    void save({ marks });
  };

  const setArrangement = (section: Section, next: Arrangement) =>
    void save({ arrangements: { ...report.arrangements, [section]: next } });

  const nameGroup = (section: Section, index: number, name: string) => {
    const names = [...(report.groupNames[section] ?? [])];
    while (names.length <= index) names.push("");
    names[index] = name;
    void save({ groupNames: { ...report.groupNames, [section]: names } });
  };

  const assign = (record: Rec, section: Section, group: number | null) => {
    const assignments = { ...report.assignments };
    if (group === null) delete assignments[record.id];
    else assignments[record.id] = { section, group };
    void save({ assignments });
  };

  const setCategory = (key: CategoryKey, patch: Partial<CategoryEntry>) =>
    void save({
      verification: { ...report.verification, [key]: { ...report.verification[key], ...patch } },
    });

  const blocking = analysis.issues.filter((issue) => issue.blocking);
  const listed = showAll
    ? analysis.records
    : analysis.records.filter((record) => record.state !== "ACCEPTED" || record.flags.length > 0 || record.mark);

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Installation test">
      <DialogScrim />

      <div className="dialog is-board is-gate">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Installation test</h2>
            <p className="board-section-note">
              {report.site.client.name}
              {"  ·  "}
              {report.site.name}
            </p>
          </div>
        </header>

        <div className="board-scroll">
          <div className="board-body">
            {/* --- the installation ---------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">What was tested</h3>
            </div>

            <div className="issue-picks is-row">
              {(["SINGLE", "THREE"] as Phases[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`issue-pick ${report.phases === option ? "is-on" : ""}`}
                  onClick={() => {
                    if (option === report.phases) return;
                    // The arrangements follow the supply unless they were set by hand.
                    const arrangements = Object.fromEntries(
                      SECTIONS.map((section) => {
                        const held = report.arrangements[section];
                        return [
                          section,
                          held.preset === "CUSTOM" ? held : presetArrangement(section, held.preset, option),
                        ];
                      }),
                    );
                    void save({ phases: option, arrangements });
                  }}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{PHASE_LABELS[option]}</span>
                  </span>
                </button>
              ))}
            </div>

            <label className="dialog-field">
              <span className="dialog-label">Installation / circuit description</span>
              <input
                className="dialog-input"
                placeholder="e.g. Workshop compressor supply"
                defaultValue={report.installation ?? ""}
                onBlur={(event) => void save({ installation: event.target.value })}
              />
            </label>
            <label className="dialog-field">
              <span className="dialog-label">Switchboard and circuit</span>
              <input
                className="dialog-input"
                placeholder="e.g. DB1, CB20"
                defaultValue={report.circuitDetails ?? ""}
                onBlur={(event) => void save({ circuitDetails: event.target.value })}
              />
            </label>

            <div className="gate-pair">
              <label className="dialog-field">
                <span className="dialog-label">Test date</span>
                <input
                  type="date"
                  className="dialog-input"
                  value={report.date.slice(0, 10)}
                  onChange={(event) => void save({ date: event.target.value })}
                />
              </label>
              <label className="dialog-field">
                <span className="dialog-label">Instrument</span>
                <select
                  className="dialog-input"
                  value={report.instrumentId ?? ""}
                  onChange={(event) => void save({ instrumentId: event.target.value || null })}
                >
                  <option value="">Not recorded</option>
                  {instruments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.serialNo ? ` — ${item.serialNo}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="dialog-field">
              <span className="dialog-label">Prepared for (site contact)</span>
              <select
                className="dialog-input"
                value={report.contactId ?? ""}
                onChange={(event) => void save({ contactId: event.target.value || null })}
              >
                <option value="">Nobody chosen</option>
                {report.site.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>

            {/* --- the checklist -------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Verification checklist</h3>
              <p className="board-section-note">
                Visual inspection and the six tests of AS/NZS 3000 Section 8. Tick what this report
                covers and give each a status. The report says verification is complete only when
                every category is recorded, or not applicable with a reason.
              </p>
            </div>

            <ul className="install-checklist">
              {CATEGORIES.map((category) => {
                const entry = report.verification[category.key];
                const needsReason = entry.status === "NOT_APPLICABLE" || entry.status === "NOT_PERFORMED";
                const tester = category.section ? analysis.sections[category.section].accepted.length : 0;
                return (
                  <li className={`install-check ${entry.selected ? "is-on" : ""}`} key={category.key}>
                    <div className="install-check-head">
                      <label className="install-check-pick">
                        <input
                          type="checkbox"
                          checked={entry.selected}
                          onChange={(event) => setCategory(category.key, { selected: event.target.checked })}
                        />
                        <span className="install-check-label">{category.label}</span>
                        <span className="install-check-clause">{category.clause}</span>
                      </label>
                      <select
                        className="dialog-input install-check-status"
                        value={entry.status}
                        disabled={!entry.selected}
                        onChange={(event) => setCategory(category.key, { status: event.target.value as Status })}
                      >
                        {(Object.keys(STATUS_LABELS) as Status[]).map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {entry.selected ? (
                      <>
                        <p className="amp-hint is-standalone">
                          {category.hint}
                          {category.section
                            ? ` ${tester} accepted tester ${tester === 1 ? "record" : "records"}.`
                            : ""}
                        </p>
                        {needsReason ? (
                          <input
                            className="dialog-input"
                            placeholder="Reason (printed on the report)"
                            defaultValue={entry.reason ?? ""}
                            onBlur={(event) => setCategory(category.key, { reason: event.target.value })}
                          />
                        ) : (
                          <textarea
                            className="dialog-input"
                            rows={2}
                            placeholder="Manual record or evidence, where no tester file carries it"
                            defaultValue={entry.evidence ?? ""}
                            onBlur={(event) => setCategory(category.key, { evidence: event.target.value })}
                          />
                        )}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* --- the files and their groups, a section at a time ------------- */}
            {SECTIONS.map((section) => {
              const files = report.files.filter((file) => file.section === section);
              const result = analysis.sections[section];
              const arrangement = report.arrangements[section];
              const groupCount = result.groups.length;
              return (
                <div className="install-section" key={section}>
                  <div className="board-section-head">
                    <h3 className="board-section-title">{SECTION_LABELS[section]}</h3>
                    <p className="board-section-note">
                      Expected function: {KNOWN_FUNCTIONS[section]}. Add every file the tester
                      produced for this section — after a dropped connection the S numbers restart
                      in a new file.
                    </p>
                  </div>

                  {files.length === 0 ? (
                    <p className="issue-empty">No files yet.</p>
                  ) : (
                    <ol className="install-files">
                      {files.map((file, at) => {
                        const meta = result.files.find((held) => held.file.fileId === file.fileId);
                        const first = analysis.records.find(
                          (record) => record.fileId === file.fileId && record.position === 1,
                        );
                        return (
                          <li className="install-file" key={file.fileId}>
                            <div className="install-file-head">
                              <span className="amp-row-number">{at + 1}</span>
                              <span className="install-file-name">{file.originalName}</span>
                              <span className="install-file-count">
                                {file.count} {file.count === 1 ? "test" : "tests"}
                                {meta ? ` · ${meta.accepted} accepted` : ""}
                              </span>
                              <button
                                type="button"
                                className="install-file-tool"
                                disabled={at === 0}
                                aria-label="Move up"
                                onClick={() => moveFile(file.fileId, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="install-file-tool"
                                disabled={at === files.length - 1}
                                aria-label="Move down"
                                onClick={() => moveFile(file.fileId, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="install-file-tool"
                                aria-label="Remove"
                                onClick={() => removeFile(file)}
                              >
                                ×
                              </button>
                            </div>
                            <label className="install-file-dummy">
                              <input
                                type="checkbox"
                                checked={file.excludeFirst}
                                onChange={(event) =>
                                  setFile(file.fileId, { excludeFirst: event.target.checked, dummyConfirmed: true })
                                }
                              />
                              <span>
                                First record is a deliberate dummy
                                {first ? ` — ${first.name}: ${reads(first)}` : ""}
                              </span>
                            </label>
                            {!file.dummyConfirmed ? (
                              <p className="amp-warning">
                                This file continues after a reconnect. Check whether its first record is
                                a dummy, then{" "}
                                <button
                                  type="button"
                                  className="install-link"
                                  onClick={() => setFile(file.fileId, { dummyConfirmed: true })}
                                >
                                  confirm this setting
                                </button>
                                .
                              </p>
                            ) : null}
                            {meta && meta.unexpected > 0 ? (
                              <p className="amp-warning">
                                {meta.unexpected} {meta.unexpected === 1 ? "record carries" : "records carry"}{" "}
                                another function and {meta.unexpected === 1 ? "is" : "are"} held for review
                                below, not reclassified.
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  <input
                    ref={(element) => {
                      pickers.current[section] = element;
                    }}
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    hidden
                    onChange={(event) => {
                      const chosen = [...(event.target.files ?? [])];
                      event.target.value = "";
                      if (chosen.length > 0) void addFiles(section, chosen);
                    }}
                  />
                  <button
                    type="button"
                    className="issue-add"
                    disabled={busy !== null}
                    onClick={() => pickers.current[section]?.click()}
                  >
                    {busy === section ? "Reading…" : `Add ${SECTION_LABELS[section]} PDF`}
                  </button>

                  {files.length > 0 ? (
                    <>
                      {/* --- the arrangement ------------------------------------- */}
                      <div className="install-arrangement">
                        <label className="dialog-field">
                          <span className="dialog-label">Test arrangement</span>
                          <select
                            className="dialog-input"
                            value={arrangement.preset}
                            onChange={(event) =>
                              setArrangement(section, presetArrangement(section, event.target.value, report.phases))
                            }
                          >
                            {PRESETS[section].map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="amp-hint is-standalone">
                          {PRESETS[section].find((preset) => preset.id === arrangement.preset)?.note}
                        </p>
                        <div className="gate-pair">
                          <label className="dialog-field">
                            <span className="dialog-label">Phase blocks (comma separated)</span>
                            <input
                              className="dialog-input"
                              key={`p-${arrangement.phaseNames.join()}`}
                              defaultValue={arrangement.phaseNames.join(", ")}
                              onBlur={(event) =>
                                setArrangement(section, {
                                  ...arrangement,
                                  preset: "CUSTOM",
                                  phaseNames: list(event.target.value),
                                  confirmed: false,
                                })
                              }
                            />
                          </label>
                          <label className="dialog-field">
                            <span className="dialog-label">Readings in each block</span>
                            <input
                              className="dialog-input"
                              key={`l-${arrangement.labels.join()}`}
                              defaultValue={arrangement.labels.join(", ")}
                              onBlur={(event) =>
                                setArrangement(section, {
                                  ...arrangement,
                                  preset: "CUSTOM",
                                  labels: list(event.target.value),
                                  confirmed: false,
                                })
                              }
                            />
                          </label>
                        </div>
                        <label className="install-file-dummy">
                          <input
                            type="checkbox"
                            checked={arrangement.confirmed}
                            onChange={(event) =>
                              setArrangement(section, { ...arrangement, confirmed: event.target.checked })
                            }
                          />
                          <span>
                            I have checked this arrangement — {arrangement.phaseNames.length} ×{" "}
                            {arrangement.labels.length} ={" "}
                            {arrangement.phaseNames.length * arrangement.labels.length} readings per group.
                          </span>
                        </label>
                      </div>

                      {/* --- the groups ------------------------------------------ */}
                      <ol className="install-points">
                        {result.groups.map((group) => (
                          <li className={`install-point ${group.complete ? "" : "is-open"}`} key={group.index}>
                            <div className="install-point-head">
                              <span className="amp-row-number">{group.index + 1}</span>
                              <input
                                className="dialog-input"
                                key={`${section}-${group.index}-${group.name}`}
                                placeholder={
                                  section === "VOLTAGE"
                                    ? "e.g. GPO 1, Dishwasher"
                                    : section === "RCD"
                                      ? "e.g. RCBO CB20"
                                      : "e.g. DB1 CB20 submain"
                                }
                                defaultValue={group.name}
                                onBlur={(event) => nameGroup(section, group.index, event.target.value)}
                              />
                            </div>
                            <div className="install-slots">
                              {group.slots.map((slot, at) => (
                                <div
                                  className={`install-reading ${slot.record ? "" : "is-missing"} ${slot.mismatch ? "is-flag" : ""}`}
                                  key={at}
                                >
                                  <span className="install-reading-pair">
                                    {slot.phase} · {slotLabel(slot.phase, slot.label)}
                                  </span>
                                  <span className="install-reading-value">
                                    {slot.record ? reads(slot.record) : "Not recorded"}
                                  </span>
                                  {slot.record ? (
                                    <span className="install-reading-ref">
                                      {ref(slot.record)} · W{slot.record.seq}
                                    </span>
                                  ) : null}
                                  {slot.record ? (
                                    <MoveTo
                                      record={slot.record}
                                      section={section}
                                      count={groupCount}
                                      manual={report.assignments[slot.record.id]?.group ?? null}
                                      onMove={assign}
                                    />
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            {group.extras.map((extra) => (
                              <div className="install-extra" key={extra.record.id}>
                                <p className="amp-warning">
                                  {ref(extra.record)} ({reads(extra.record)}): {extra.why}.
                                </p>
                                <MoveTo
                                  record={extra.record}
                                  section={section}
                                  count={groupCount}
                                  manual={report.assignments[extra.record.id]?.group ?? null}
                                  onMove={assign}
                                />
                                <MarkPick record={extra.record} onMark={setMark} />
                              </div>
                            ))}
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                </div>
              );
            })}

            {/* --- what needs a decision ----------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Needs attention</h3>
              <p className="board-section-note">
                {blocking.length === 0
                  ? "Nothing unresolved."
                  : `${blocking.length} unresolved — these are printed on the report until settled.`}
              </p>
            </div>
            {analysis.issues.length > 0 ? (
              <ul className="install-anomalies">
                {analysis.issues.map((issue, at) => (
                  <li className={`install-anomaly ${issue.blocking ? "" : "is-surplus"}`} key={`${issue.title}-${at}`}>
                    <p className="install-anomaly-title">{issue.title}</p>
                    <p className="install-anomaly-detail">
                      {issue.detail}
                      {issue.records.length > 0
                        ? `  (${issue.records.map((id) => (byId.get(id) ? ref(byId.get(id) as Rec) : id)).join(", ")})`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {/* --- the records --------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Records</h3>
              <p className="board-section-note">
                As the instrument wrote them, with the file and S number they came from. Mark a record
                accidental or repeated and it leaves the groups — and the groups re-form without it —
                but it stays in the report&rsquo;s appendix with its reason.
              </p>
            </div>

            <button
              type="button"
              className="issue-add is-quiet"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show only set-aside, held, flagged and marked records" : "Show every record"}
            </button>

            <ul className="install-rows">
              {listed.map((record) => (
                <li className={`install-row ${record.state === "ACCEPTED" ? "" : "is-out"}`} key={record.id}>
                  <div className="install-row-head">
                    <span className="amp-row-number">{record.name}</span>
                    <span className="install-row-kind">
                      File {record.fileNo} · #{record.position}
                      {record.seq ? ` · W${record.seq}` : ""} · {MEASUREMENT_LABELS[record.kind]}
                    </span>
                    <span className="install-row-value">{reads(record)}</span>
                  </div>
                  <p className="install-row-raw">
                    {[record.rawFunction, record.rawParameters, record.rawResult].filter(Boolean).join("  ·  ")}
                  </p>
                  {record.flags.map((flag) => (
                    <p className={flag.failureLike ? "amp-warning" : "amp-hint is-standalone"} key={flag.text}>
                      {flag.text}
                    </p>
                  ))}
                  {record.why ? <p className="amp-hint is-standalone">{record.why}</p> : null}
                  <div className="install-row-tools">
                    <MarkPick record={record} onMark={setMark} />
                    <input
                      className="dialog-input install-circuit"
                      placeholder="Reason or note"
                      key={`${record.id}-${record.mark?.reason ?? ""}`}
                      defaultValue={record.mark?.reason ?? ""}
                      disabled={!record.mark}
                      onBlur={(event) =>
                        record.mark && event.target.value !== (record.mark.reason ?? "")
                          ? setMark(record, record.mark.mark, event.target.value)
                          : undefined
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* --- who prepared it ------------------------------------------ */}
            <div className="board-section-head">
              <h3 className="board-section-title">Who prepared it</h3>
            </div>
            <PreparedByPicks
              chosen={report.preparedBy}
              onChange={(next) => void save({ preparedBy: next })}
            />
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
            disabled={report.files.length === 0}
            onClick={() => window.open(`/api/install/${reportId}/report?preview=1`, "_blank")}
          >
            Preview
          </button>
          <button
            type="button"
            className="dialog-confirm"
            disabled={report.files.length === 0}
            onClick={() => window.open(`/api/install/${reportId}/report`, "_blank")}
          >
            Download the report
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkPick({
  record,
  onMark,
}: {
  record: Rec;
  onMark: (record: Rec, mark: Mark | "") => void;
}) {
  return (
    <select
      className="dialog-input install-exclude"
      value={record.mark?.mark ?? ""}
      onChange={(event) => onMark(record, event.target.value as Mark | "")}
    >
      <option value="">{record.state === "EXCLUDED" && !record.mark ? "Dummy (file setting)" : "Not marked"}</option>
      {(Object.keys(MARK_LABELS) as Mark[]).map((mark) => (
        <option key={mark} value={mark}>
          {MARK_LABELS[mark]}
        </option>
      ))}
    </select>
  );
}

function MoveTo({
  record,
  section,
  count,
  manual,
  onMove,
}: {
  record: Rec;
  section: Section;
  count: number;
  manual: number | null;
  onMove: (record: Rec, section: Section, group: number | null) => void;
}) {
  return (
    <select
      className="install-move"
      value={manual === null ? "" : String(manual)}
      aria-label={`Move ${record.name} to another group`}
      onChange={(event) => onMove(record, section, event.target.value === "" ? null : Number(event.target.value))}
    >
      <option value="">Grouped automatically</option>
      {Array.from({ length: count + 1 }, (_, at) => (
        <option key={at} value={at}>
          {at < count ? `Move to group ${at + 1}` : "Move to a new group"}
        </option>
      ))}
    </select>
  );
}
