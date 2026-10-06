"use client";

import { useCallback, useEffect, useState } from "react";
import { PreparedByPicks } from "@/components/PreparedByPicks";
import {
  MEASUREMENT_LABELS,
  TERMINALS,
  resistanceReads,
  voltsReads,
  type InstallRow,
  type Terminals,
} from "@/lib/install/parse";
import {
  EXCLUSION_REASONS,
  PHASE_LABELS,
  type Anomaly,
  type Exclusion,
  type Phases,
  type Point,
} from "@/lib/install/points";

/**
 * Reading an installation test over, before it is issued.
 *
 * The instrument wrote a list; this is where it becomes a report. Each
 * complete set of three voltage readings is a point and gets a name — a
 * powerpoint, a GPO, an appliance. Anything the reader could not place, or
 * placed with a question, is shown with the original values beside it so the
 * decision is made by somebody looking at the numbers.
 *
 * The one thing no button here does is delete. A record set aside is left out
 * of the results and listed with its reason; the instrument's own export still
 * has it, and taking the exclusion off puts it straight back.
 */

type Report = {
  id: string;
  date: string;
  phases: Phases;
  installation: string | null;
  circuitDetails: string | null;
  contactId: string | null;
  instrumentId: string | null;
  preparedBy: string[];
  rows: InstallRow[];
  points: (Point & { key: string })[];
  stray: InstallRow[];
  exclusions: Exclusion[];
  anomalies: Anomaly[];
  circuits: Record<string, string>;
  pointNames: Record<string, string>;
  source: { originalName: string } | null;
  site: {
    name: string;
    client: { name: string };
    contacts: { id: string; name: string }[];
  };
};

type Instrument = { id: string; name: string; serialNo: string | null };

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
  const [error, setError] = useState<string | null>(null);

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
      // Reloaded rather than merged: the points, the anomalies and what is set
      // aside all follow from each other, and recomputing them here would be
      // the same rules written twice.
      await load();
    },
    [reportId, load],
  );

  if (!report) {
    return (
      <div className="dialog-layer" role="dialog" aria-modal aria-label="Installation test">
        <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />
        <div className="dialog is-board is-gate">
          <p className="issue-empty">{error ?? "Reading the export…"}</p>
        </div>
      </div>
    );
  }

  const isOut = (name: string) => report.exclusions.some((row) => row.name === name);

  const setAside = (name: string, reason: string) =>
    void save({
      exclusions: [...report.exclusions.filter((row) => row.name !== name), { name, reason }],
    });

  const putBack = (name: string) =>
    void save({ exclusions: report.exclusions.filter((row) => row.name !== name) });

  const namePoint = (key: string, name: string) =>
    void save({ pointNames: { ...report.pointNames, [key]: name } });

  const setCircuit = (name: string, circuit: string) =>
    void save({ circuits: { ...report.circuits, [name]: circuit } });

  const unnamed = report.points.filter((point) => !point.name.trim()).length;
  const kept = report.rows.filter((row) => !isOut(row.name));
  const listed = showAll ? report.rows : kept.filter((row) => row.kind !== "VOLTAGE_PHASE");

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Installation test">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

      <div className="dialog is-board is-gate">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Installation test</h2>
            <p className="board-section-note">
              {report.site.client.name}
              {"  ·  "}
              {report.site.name}
              {report.source ? `  ·  ${report.source.originalName}` : ""}
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
                  onClick={() => void save({ phases: option })}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{PHASE_LABELS[option]}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="amp-hint is-standalone">
              This decides how many insulation and RCD records the scope expects: one of each on a
              single-phase installation, three RCD sequences on a three-phase one.
            </p>

            <label className="dialog-field">
              <span className="dialog-label">Installation</span>
              <input
                className="dialog-input"
                placeholder="e.g. Kitchen fit-out, ground floor"
                defaultValue={report.installation ?? ""}
                onBlur={(event) => void save({ installation: event.target.value })}
              />
            </label>
            <label className="dialog-field">
              <span className="dialog-label">Circuit / device details</span>
              <input
                className="dialog-input"
                placeholder="e.g. Final sub-circuit 4, 20 A RCBO"
                defaultValue={report.circuitDetails ?? ""}
                onBlur={(event) => void save({ circuitDetails: event.target.value })}
              />
            </label>

            <div className="gate-pair">
              <label className="dialog-field">
                <span className="dialog-label">Tested on</span>
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
              <span className="dialog-label">Prepared for</span>
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

            {/* --- anything needing a look --------------------------------- */}
            {report.anomalies.length > 0 ? (
              <>
                <div className="board-section-head">
                  <h3 className="board-section-title">Worth a second look</h3>
                  <p className="board-section-note">
                    Questions, not verdicts. Look at the original values below and decide; nothing
                    has been changed or removed.
                  </p>
                </div>
                <ul className="install-anomalies">
                  {report.anomalies.map((anomaly) => (
                    <li
                      className={`install-anomaly ${anomaly.surplus ? "is-surplus" : ""}`}
                      key={anomaly.title}
                    >
                      <p className="install-anomaly-title">{anomaly.title}</p>
                      <p className="install-anomaly-detail">
                        {anomaly.detail}
                        {anomaly.rows.length > 0 ? `  (${anomaly.rows.join(", ")})` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {/* --- the points ---------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Tested points</h3>
              <p className="board-section-note">
                Each complete set of L-PE, L-N and N-PE is one point. Name every one of them —{" "}
                {unnamed === 0
                  ? "all named."
                  : `${unnamed} still to name.`}
              </p>
            </div>

            {report.points.length === 0 ? (
              <p className="issue-empty">No voltage readings were read from this file.</p>
            ) : (
              <ol className="install-points">
                {report.points.map((point) => (
                  <li className="install-point" key={point.ref}>
                    <div className="install-point-head">
                      <span className="amp-row-number">{point.ref}</span>
                      <input
                        className="dialog-input"
                        placeholder="e.g. Powerpoint 1, GPO 1/2, Dishwasher"
                        defaultValue={point.name}
                        onBlur={(event) => namePoint(point.key, event.target.value)}
                      />
                    </div>
                    <div className="install-readings">
                      {TERMINALS.map((terminal: Terminals) => {
                        const reading = point.readings[terminal];
                        return (
                          <div
                            className={`install-reading ${reading ? "" : "is-missing"}`}
                            key={terminal}
                          >
                            <span className="install-reading-pair">{terminal}</span>
                            <span className="install-reading-value">
                              {reading ? voltsReads(reading) : "Not taken"}
                            </span>
                            {reading ? (
                              <span className="install-reading-ref">{reading.name}</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {point.missing.length > 0 ? (
                      <p className="amp-warning">
                        No {point.missing.join(" or ")} reading at this point. Nothing has been
                        carried over from another point to fill it.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}

            {/* --- every record -------------------------------------------- */}
            <div className="board-section-head">
              <h3 className="board-section-title">Every record in the file</h3>
              <p className="board-section-note">
                As the instrument wrote them. Set one aside and it leaves the results but stays in
                the report, with its reference and the reason — and in the instrument&rsquo;s own
                export at the back.
              </p>
            </div>

            <button
              type="button"
              className="issue-add is-quiet"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? "Show only insulation, RCD and anything unrecognised"
                : "Show every record, voltage readings included"}
            </button>

            <ul className="install-rows">
              {(showAll ? report.rows : listed).map((row) => {
                const out = isOut(row.name);
                return (
                  <li className={`install-row ${out ? "is-out" : ""}`} key={row.name}>
                    <div className="install-row-head">
                      <span className="amp-row-number">{row.name}</span>
                      <span className="install-row-kind">{MEASUREMENT_LABELS[row.kind]}</span>
                      <span className="install-row-value">
                        {row.kind === "INSULATION"
                          ? resistanceReads(row)
                          : row.kind === "VOLTAGE_PHASE"
                            ? `${row.terminals ?? "?"}  ${voltsReads(row)}`
                            : row.kind === "RCD"
                              ? `${row.rcd?.ratingMa ?? "?"} mA`
                              : "—"}
                      </span>
                    </div>
                    <p className="install-row-raw">
                      {[row.rawFunction, row.rawParameters, row.rawResult]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                    <div className="install-row-tools">
                      <input
                        className="dialog-input install-circuit"
                        placeholder="Which circuit, if the file holds more than one"
                        defaultValue={report.circuits[row.name] ?? ""}
                        onBlur={(event) => setCircuit(row.name, event.target.value)}
                      />
                      {out ? (
                        <button
                          type="button"
                          className="issue-add is-quiet"
                          onClick={() => putBack(row.name)}
                        >
                          Put it back
                        </button>
                      ) : (
                        <select
                          className="dialog-input install-exclude"
                          value=""
                          onChange={(event) => {
                            if (event.target.value) setAside(row.name, event.target.value);
                          }}
                        >
                          <option value="">Set aside…</option>
                          {EXCLUSION_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {out ? (
                      <p className="amp-hint is-standalone">
                        Set aside: {report.exclusions.find((e) => e.name === row.name)?.reason}. It
                        is left out of the results, listed in its own section of the report, and
                        still in the instrument&rsquo;s export at the back.
                      </p>
                    ) : null}
                  </li>
                );
              })}
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
            onClick={() => window.open(`/api/install/${reportId}/report?preview=1`, "_blank")}
          >
            Preview
          </button>
          <button
            type="button"
            className="dialog-confirm"
            onClick={() => window.open(`/api/install/${reportId}/report`, "_blank")}
          >
            Download the report
          </button>
        </div>
      </div>
    </div>
  );
}
