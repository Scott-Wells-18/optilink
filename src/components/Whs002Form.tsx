"use client";

import { useMemo } from "react";
import { normaliseBoard } from "@/lib/board";
import { boardDevices } from "@/lib/rcd/map";
import {
  ACTIVITIES,
  ALTERNATIVES,
  CIRCUMSTANCES,
  CLOSE_OUT,
  CONSULTED,
  DECISIONS,
  EQUIPMENT,
  GATE,
  PRELIMINARIES,
  PRE_START,
  conditionOf,
  hazardsInPlay,
  stopConditions,
  whsGaps,
  type Rating,
  type RiskRow,
  type Whs002,
} from "@/lib/safety/whs002";

/**
 * OEC-WHS002, asked rather than filled in.
 *
 * The form is walked in its own order, in its own words, one section at a
 * time. Where it wants evidence the question says what would count as
 * evidence, and where nothing is known the box is left empty and listed at the
 * bottom — this is an authorisation, and a plausible-looking number that
 * nobody checked is worse in it than a gap.
 *
 * The risk assessment is the part that has to be true of this board on this
 * day. So each hazard asks what was actually found, the controls that answer
 * that finding come with it, and the two ratings start where the condition
 * puts them and can be moved. Nothing is pre-ticked and nothing is the same
 * for every board unless somebody chose the same answer twice.
 */

export type BoardOption = { id: string; name: string; board: unknown };

export function Whs002Form({
  value,
  onChange,
  boards,
  jobNumber,
}: {
  value: Whs002;
  onChange: (next: Whs002) => void;
  boards: BoardOption[];
  jobNumber: string;
}) {
  const set = <K extends keyof Whs002>(key: K, next: Whs002[K]) =>
    onChange({ ...value, [key]: next });

  const setIn = (
    group: "alternatives" | "preliminaries" | "consultation" | "equipment" | "preStart",
    key: string,
    next: string,
  ) => onChange({ ...value, [group]: { ...(value[group] ?? {}), [key]: next } });

  const setRisk = (key: string, next: RiskRow) =>
    onChange({ ...value, risk: { ...(value.risk ?? {}), [key]: next } });

  const hazards = hazardsInPlay(value);
  const gaps = whsGaps(value);
  const stops = stopConditions(value);

  /** What the chosen board already knows about its own RCDs. */
  const fromBoard = useMemo(() => {
    const chosen = boards.find((option) => option.name === boardName(value.switchboardId));
    if (!chosen) return "";
    const devices = boardDevices(normaliseBoard(chosen.board));
    return devices.map((device) => device.label).join(" · ");
  }, [boards, value.switchboardId]);

  return (
    <>
      <p className="whs-gate">
        <span>Mandatory gate</span>
        {GATE}
      </p>

      {/* 1 — what this authorises ----------------------------------------- */}
      <Head
        title="1 · Work and document identification"
        note="What the authorisation is for. Most of it is already on file; the voltage and the supply information are not, so they are asked."
      />

      <div className="board-section-head">
        <h3 className="board-section-title">Which switchboard?</h3>
        <p className="board-section-note">
          The switchboards drawn for this site. Pick the one being opened.
        </p>
      </div>
      {boards.length > 0 ? (
        <div className="issue-picks">
          {boards.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`issue-pick ${
                boardName(value.switchboardId) === option.name ? "is-on" : ""
              }`}
              onClick={() => set("switchboardId", option.name)}
            >
              <span className="issue-pick-mark is-one" aria-hidden />
              <span className="issue-pick-body">
                <span className="issue-pick-label">{option.name}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="issue-empty">
          No switchboards have been drawn for this site yet. Type the board and where it
          is below instead.
        </p>
      )}

      <TextField
        label="Switchboard ID and location"
        help="As it is labelled on site, and where in the building it is."
        value={value.switchboardId ?? ""}
        onChange={(next) => set("switchboardId", next)}
      />

      <LongField
        label="RCD / circuit identification"
        help={
          fromBoard
            ? "Taken from the board as it is drawn. Change it to just the devices being tested."
            : "Which RCDs and circuits are being tested, as they are labelled on the board."
        }
        value={value.circuits ?? ""}
        placeholder={fromBoard}
        onChange={(next) => set("circuits", next)}
        fill={fromBoard ? () => set("circuits", fromBoard) : undefined}
        fillLabel="Use the board's own list"
      />

      <TextField
        label="Nominal voltage"
        help="Measured or read off the board — e.g. 400 V / 230 V, 50 Hz. Nothing is assumed."
        value={value.nominalVoltage ?? ""}
        onChange={(next) => set("nominalVoltage", next)}
      />

      <LongField
        label="Supply / fault information"
        help="Prospective fault current, upstream protection and any arc-flash study, where the site holds them. If the site cannot give you a figure, write that — an authorisation with an invented fault level in it is worse than one that says the figure is not known."
        value={value.supplyInfo ?? ""}
        onChange={(next) => set("supplyInfo", next)}
      />

      <div className="whs-row">
        <DateField
          label="Assessment date"
          help="When the assessment was actually carried out."
          value={value.assessedOn ?? ""}
          onChange={(next) => set("assessedOn", next)}
        />
        <TimeField
          label="Time"
          value={value.assessedAt ?? ""}
          onChange={(next) => set("assessedAt", next)}
        />
      </div>
      <div className="whs-row">
        <DateField
          label="Authorisation valid from"
          value={value.validFrom ?? ""}
          onChange={(next) => set("validFrom", next)}
        />
        <DateField
          label="Valid to"
          value={value.validTo ?? ""}
          onChange={(next) => set("validTo", next)}
        />
      </div>

      <p className="issue-empty">
        Assessment reference: <strong>{jobNumber || "— add the job number first"}</strong>.
        The form&apos;s own OEC-WHS002 number is left exactly as printed.
      </p>

      {/* 2 — the activity --------------------------------------------------- */}
      <Head
        title="2 · Scope of energised testing"
        note="Only what is listed here is authorised. Repair, alteration and uncontrolled fault-finding are outside it."
      />
      <Picks
        options={ACTIVITIES}
        value={value.activity}
        onPick={(next) => set("activity", next)}
      />
      <LongField
        label="Exact test or inspection method, and why energisation is required"
        help="What is measured, with what, and why the measurement stops existing when the supply is off."
        value={value.activityMethod ?? ""}
        onChange={(next) => set("activityMethod", next)}
      />

      {/* 3 — the permitted circumstance ------------------------------------- */}
      <Head
        title="3 · Permitted circumstance under section 157"
        note="At least one must genuinely apply. If none does, the work is not done energised."
      />
      <Picks
        options={CIRCUMSTANCES}
        value={value.circumstance}
        onPick={(next) => set("circumstance", next)}
      />
      <LongField
        label="Task-specific justification and supporting evidence"
        help="Specific to this board and this job. A general statement about RCD testing is not evidence about this switchboard."
        value={value.circumstanceEvidence ?? ""}
        onChange={(next) => set("circumstanceEvidence", next)}
      />

      {/* 4 — the alternatives ------------------------------------------------ */}
      <Head
        title="4 · Alternatives considered"
        note="Each one has to be answered, because the answer is the evidence that it was considered at all."
      />
      {ALTERNATIVES.map((row) => (
        <LongField
          key={row.key}
          label={row.label}
          value={value.alternatives?.[row.key] ?? ""}
          onChange={(next) => setIn("alternatives", row.key, next)}
        />
      ))}

      {/* 5 — the risk assessment --------------------------------------------- */}
      <Head
        title="5 · Recorded site-specific risk assessment"
        note="What was actually found at this board. The controls follow from what you choose, so the two columns agree; both ratings and the controls can still be changed."
      />
      {hazards.map((hazard) => {
        const row = value.risk?.[hazard.key] ?? {};
        const condition = conditionOf(hazard, row.condition);
        return (
          <div key={hazard.key} className="safety-question">
            <div className="board-section-head">
              <h3 className="board-section-title">{hazard.hazard}</h3>
              <p className="board-section-note">
                Already on the form: {hazard.printedControls}
              </p>
            </div>
            <div className="issue-picks">
              {hazard.conditions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`issue-pick ${row.condition === option.value ? "is-on" : ""} ${
                    option.stop ? "is-stop" : ""
                  }`}
                  onClick={() =>
                    setRisk(hazard.key, {
                      ...row,
                      condition: option.value,
                      initial: option.initial,
                      residual: option.residual,
                    })
                  }
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{option.label}</span>
                    <span className="issue-pick-note">Controls: {option.controls}</span>
                  </span>
                </button>
              ))}
            </div>
            {condition ? (
              <div className="whs-row">
                <Ratings
                  label="Initial risk"
                  value={row.initial}
                  onPick={(next) => setRisk(hazard.key, { ...row, initial: next })}
                />
                <Ratings
                  label="Residual risk"
                  value={row.residual}
                  onPick={(next) => setRisk(hazard.key, { ...row, residual: next })}
                />
              </div>
            ) : null}
            {condition ? (
              <TextField
                label="Anything else you saw at this board"
                help="Added to the recorded condition. Leave it empty where there is nothing to add."
                value={row.note ?? ""}
                onChange={(next) => setRisk(hazard.key, { ...row, note: next })}
              />
            ) : null}
          </div>
        );
      })}

      {/* 6 — section 158 preliminaries ---------------------------------------- */}
      <Head
        title="6 · Section 158 preliminary requirements"
        note="Each box is ticked by the evidence beside it, not on its own."
      />
      {PRELIMINARIES.map((item) => (
        <LongField
          key={item.key}
          label={item.label}
          help={item.help}
          value={value.preliminaries?.[item.key] ?? ""}
          onChange={(next) => setIn("preliminaries", item.key, next)}
        />
      ))}

      {/* 7 — consultation ------------------------------------------------------ */}
      <Head
        title="7 · Consultation record"
        note="Who was actually spoken to. A name here is a record that a conversation happened."
      />
      {CONSULTED.map((role) => (
        <TextField
          key={role.key}
          label={`${role.role} — ${role.about.toLowerCase()}`}
          help={role.help}
          value={value.consultation?.[role.key] ?? ""}
          onChange={(next) => setIn("consultation", role.key, next)}
        />
      ))}

      {/* 8 — competency and equipment ------------------------------------------ */}
      <Head
        title="8 · Competency, equipment and PPE"
        note="Only the items this job actually uses are asked for."
      />
      {EQUIPMENT.filter((item) => !item.when || item.when(value)).map((item) => (
        <TextField
          key={item.key}
          label={item.label}
          help={item.help}
          value={value.equipment?.[item.key] ?? ""}
          onChange={(next) => setIn("equipment", item.key, next)}
        />
      ))}

      {/* 9 — the observer ------------------------------------------------------- */}
      <Head
        title="9 · Safety observer"
        note="An observer is the default. The form allows an exemption for testing only, and only where the recorded assessment shows no serious risk and the PCBU authorises it."
      />
      <Picks
        options={[
          { value: "APPOINTED", label: "Safety observer appointed" },
          {
            value: "EXEMPT",
            label: "Observer exemption requested, for testing only",
            note: "Needs the recorded assessment to show no serious risk, and a written basis below.",
          },
        ]}
        value={value.observer}
        onPick={(next) => set("observer", next)}
      />
      {value.observer === "APPOINTED" ? (
        <>
          <TextField
            label="Observer's name"
            value={value.observerName ?? ""}
            onChange={(next) => set("observerName", next)}
          />
          <TextField
            label="CPR and low-voltage rescue competency date"
            help="The date on the certificate."
            value={value.observerCompetency ?? ""}
            onChange={(next) => set("observerCompetency", next)}
          />
        </>
      ) : null}
      {value.observer === "EXEMPT" ? (
        <LongField
          label="Detailed basis for the exemption"
          help="Why the recorded assessment shows no serious risk at this board. The rows above have to support it."
          value={value.observerBasis ?? ""}
          onChange={(next) => set("observerBasis", next)}
        />
      ) : null}

      {/* 10 — the pre-start check ------------------------------------------------ */}
      <Head
        title="10 · Pre-start authorisation checklist"
        note="Answered on site, immediately before the board is opened. Each line is ticked by what is written beside it."
      />
      {PRE_START.map((item) => (
        <TextField
          key={item.key}
          label={item.label}
          value={value.preStart?.[item.key] ?? ""}
          onChange={(next) => setIn("preStart", item.key, next)}
        />
      ))}

      {/* 12 — the authorisation --------------------------------------------------- */}
      <Head
        title="12 · PCBU authorisation"
        note="Scott Wells authorises this as the PCBU. His signature goes on at the signing step and not before."
      />
      <Picks
        options={DECISIONS}
        value={value.decision}
        onPick={(next) => set("decision", next)}
      />
      <LongField
        label="Conditions or limitations"
        help="What the approval does not extend to. Required where the decision is approved with conditions."
        value={value.conditions ?? ""}
        onChange={(next) => set("conditions", next)}
      />

      {/* 14 — close-out ------------------------------------------------------------ */}
      <Head
        title="14 · Close-out"
        note="Filled in after the work, when the board is back together. Leave it until then."
      />
      <div className="issue-picks">
        {CLOSE_OUT.map((item) => {
          const on = value.closeOut?.includes(item.key) ?? false;
          return (
            <button
              key={item.key}
              type="button"
              className={`issue-pick ${on ? "is-on" : ""}`}
              onClick={() =>
                set(
                  "closeOut",
                  on
                    ? (value.closeOut ?? []).filter((key) => key !== item.key)
                    : [...(value.closeOut ?? []), item.key],
                )
              }
            >
              <span className="issue-pick-mark" aria-hidden />
              <span className="issue-pick-body">
                <span className="issue-pick-label">{item.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      <LongField
        label="Defects, abnormal findings and follow-up"
        value={value.defects ?? ""}
        onChange={(next) => set("defects", next)}
      />

      {/* what is left ------------------------------------------------------------- */}
      {stops.length > 0 ? (
        <>
          <Head
            title="This assessment says stop"
            note="These are answers, not gaps. What you have recorded means the work does not go ahead energised until the condition changes."
          />
          <ul className="safety-hazards">
            {stops.map((stop) => (
              <li key={stop} className="is-stop">
                <strong>{stop}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <Head
        title={gaps.length === 0 ? "Nothing outstanding" : `${gaps.length} still needed`}
        note={
          gaps.length === 0
            ? "Every box this form asks for has an answer."
            : "The form will download with these blank. Each one is a question nobody has answered yet."
        }
      />
      {gaps.length > 0 ? (
        <ul className="safety-hazards">
          {gaps.map((gap) => (
            <li key={gap}>
              <strong>{gap}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/* --- the small pieces ------------------------------------------------------ */

function Head({ title, note }: { title: string; note?: string }) {
  return (
    <div className="board-section-head whs-head">
      <h3 className="board-section-title">{title}</h3>
      {note ? <p className="board-section-note">{note}</p> : null}
    </div>
  );
}

function Picks({
  options,
  value,
  onPick,
}: {
  options: { value: string; label: string; note?: string }[];
  value: string | undefined;
  onPick: (value: string) => void;
}) {
  return (
    <div className="issue-picks">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`issue-pick ${value === option.value ? "is-on" : ""}`}
          onClick={() => onPick(option.value)}
        >
          <span className="issue-pick-mark is-one" aria-hidden />
          <span className="issue-pick-body">
            <span className="issue-pick-label">{option.label}</span>
            {option.note ? <span className="issue-pick-note">{option.note}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

function Ratings({
  label,
  value,
  onPick,
}: {
  label: string;
  value: Rating | undefined;
  onPick: (value: Rating) => void;
}) {
  return (
    <div className="whs-ratings">
      <span className="dialog-label">{label}</span>
      <div className="whs-rating-row">
        {(["H", "M", "L"] as Rating[]).map((rating) => (
          <button
            key={rating}
            type="button"
            className={`whs-rating ${value === rating ? "is-on" : ""} is-${rating}`}
            onClick={() => onPick(rating)}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="dialog-field">
      <span className="dialog-label">{label}</span>
      <input
        className="dialog-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? <span className="dialog-help">{help}</span> : null}
    </label>
  );
}

function LongField({
  label,
  help,
  value,
  placeholder,
  onChange,
  fill,
  fillLabel,
}: {
  label: string;
  help?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  fill?: () => void;
  fillLabel?: string;
}) {
  return (
    <label className="dialog-field">
      <span className="dialog-label">{label}</span>
      <textarea
        className="dialog-input dialog-textarea"
        rows={3}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {fill && !value ? (
        <button type="button" className="whs-fill" onClick={fill}>
          {fillLabel ?? "Use what is on file"}
        </button>
      ) : null}
      {help ? <span className="dialog-help">{help}</span> : null}
    </label>
  );
}

function DateField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="dialog-field">
      <span className="dialog-label">{label}</span>
      <input
        className="dialog-input"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? <span className="dialog-help">{help}</span> : null}
    </label>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="dialog-field">
      <span className="dialog-label">{label}</span>
      <input
        className="dialog-input"
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** The board's name, out of "MSB-1 — plant room" or just "MSB-1". */
function boardName(value: string | undefined): string {
  return (value ?? "").split("—")[0].trim();
}
