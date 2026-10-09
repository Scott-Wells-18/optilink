"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  METHODS,
  MODIFIERS,
  MODIFIER_BY_ID,
  PRESETS,
  PRESET_BY_ID,
  WORDING_LIMITS,
  activityIds,
  applyEdits,
  compose,
  followUpsFor,
  fromActivities,
  type Edits,
  type PresetGroup,
  type Selection,
} from "@/lib/safety/presets";

/**
 * Choosing the job, and reading back what that says.
 *
 * The job is any number of activities, ticked under collapsible categories —
 * a GPO installation and single-phase RCD testing are two ticks, not a combined
 * option. Only the follow-ups the ticked activities raise are asked, and the
 * site conditions are one more category. Between them they write the scope,
 * the method, the alternatives considered and the controls.
 *
 * That wording sits in its own collapsible area underneath, as a proposal. An
 * edit is kept: change the activities and the edited block is flagged for
 * review rather than overwritten, which is why edits are stored as
 * `{ source, text }` and not as text.
 */

export type Saved = { id: string; name: string; selection: Selection; edits: Edits | null };

const SITE = "SITE";
type GroupKey = PresetGroup | typeof SITE;

const RCD_PHASES = ["RCD_SINGLE", "RCD_THREE"];

export function SafetyPresetStep({
  selection,
  edits,
  onSelection,
  onEdits,
  onNext,
}: {
  selection: Selection | null;
  edits: Edits;
  onSelection: (next: Selection | null) => void;
  onEdits: (next: Edits) => void;
  onNext: (wording: string) => void;
}) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [naming, setNaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [wordingOpen, setWordingOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/safety-presets", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setSaved)
      .catch(() => undefined);
  }, []);

  const ids = activityIds(selection);
  const mods = selection?.modifierIds ?? [];
  const follows = followUpsFor(selection);
  const answers = selection?.answers ?? {};

  const composition = useMemo(() => (selection ? compose(selection) : null), [selection]);
  const applied = useMemo(
    () => (composition ? applyEdits(composition, edits, { keepStale: true }) : null),
    [composition, edits],
  );
  const blocks = applied?.blocks ?? [];
  const stale = blocks.filter((block) => block.stale);
  // Edits to a block the current selection no longer writes at all.
  const orphaned = (applied?.dropped ?? []).filter(
    (entry) => !blocks.some((block) => block.id === entry.id),
  );
  const toReview = stale.length + orphaned.length;
  const editedCount = blocks.filter((block) => block.edited).length;
  const wording = blocks.map((block) => `${block.heading}\n${block.text}`).join("\n\n");

  // A changed selection that leaves edits to review opens the wording, so
  // the review is not hidden behind a closed section.
  useEffect(() => {
    if (toReview > 0) setWordingOpen(true);
  }, [toReview]);

  const legacyMethods = selection?.methods ?? [];
  const unansweredFollows = follows.filter((follow) => !answers[follow.id]).length;

  /* --- changing the selection ------------------------------------------- */

  function setActivities(next: string[]) {
    // An RCD attribute is a property of an RCD test; with no phase type left
    // it would stand on its own, so it goes with the last phase.
    const phases = next.some((id) => RCD_PHASES.includes(id));
    const kept = phases ? next : next.filter((id) => !PRESET_BY_ID.get(id)?.rcdAttribute);
    onSelection(
      fromActivities(kept, {
        methods: legacyMethods,
        modifierIds: mods,
        answers,
      }),
    );
  }

  function toggleActivity(id: string) {
    setActivities(ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id]);
  }

  function toggleModifier(id: string) {
    if (!selection) return;
    onSelection({
      ...selection,
      modifierIds: mods.includes(id) ? mods.filter((one) => one !== id) : [...mods, id],
    });
  }

  function answer(followId: string, value: string) {
    if (!selection) return;
    onSelection({ ...selection, answers: { ...answers, [followId]: value } });
  }

  /* --- holding on to edits ---------------------------------------------- */

  function write(blockId: string, proposed: string, text: string, isStale: boolean) {
    const next = { ...edits };
    if (!isStale && text === proposed) delete next[blockId];
    else next[blockId] = { source: isStale ? edits[blockId].source : proposed, text };
    onEdits(next);
  }

  function takeProposed(blockId: string) {
    const next = { ...edits };
    delete next[blockId];
    onEdits(next);
  }

  function keepMine(blockId: string, proposed: string) {
    const edit = edits[blockId];
    if (!edit) return;
    onEdits({ ...edits, [blockId]: { source: proposed, text: edit.text } });
  }

  async function saveAs() {
    const name = naming.trim();
    if (!name || !selection) return;
    setBusy(true);
    try {
      const response = await fetch("/api/safety-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, selection, edits }),
      });
      if (!response.ok) throw new Error("It could not be saved.");
      setNaming("");
      const listing = await fetch("/api/safety-presets", { cache: "no-store" });
      if (listing.ok) setSaved(await listing.json());
      setNote(`Saved as "${name}". It is under Your saved presets from now on.`);
    } catch {
      setNote("That preset could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  /* --- pieces ------------------------------------------------------------ */

  const isOpen = (key: string) => Boolean(opened[key]);
  const flip = (key: string) => setOpened((current) => ({ ...current, [key]: !current[key] }));

  function groupHead(id: string, label: string, count: number) {
    return (
      <button
        type="button"
        className={`safety-group-head ${isOpen(id) ? "is-open" : ""}`}
        aria-expanded={isOpen(id)}
        onClick={() => flip(id)}
      >
        <span className="safety-group-chevron" aria-hidden />
        <span className="safety-group-title">{label}</span>
        {count > 0 ? <span className="safety-group-count">{count} selected</span> : null}
      </button>
    );
  }

  function tick({
    key,
    on,
    label,
    note: hint,
    sub,
    disabled,
    onPress,
  }: {
    key: string;
    on: boolean;
    label: string;
    note?: string;
    sub?: boolean;
    disabled?: boolean;
    onPress: () => void;
  }) {
    return (
      <button
        key={key}
        type="button"
        role="checkbox"
        aria-checked={on}
        disabled={disabled}
        className={`issue-pick ${on ? "is-on" : ""} ${sub ? "is-sub" : ""}`}
        onClick={onPress}
      >
        <span className="issue-pick-mark" aria-hidden />
        <span className="issue-pick-body">
          <span className="issue-pick-label">{label}</span>
          {hint ? <span className="issue-pick-note">{hint}</span> : null}
        </span>
      </button>
    );
  }

  const hasPhase = ids.some((id) => RCD_PHASES.includes(id));
  const offered = (group: PresetGroup) =>
    PRESETS.filter((preset) => preset.group === group && !preset.legacy && !preset.rcdAttribute);

  return (
    <section className="safety-job">
      <div className="board-section-head">
        <h3 className="board-section-title">What is the job?</h3>
        <p className="board-section-note">
          Tick everything this visit includes, across as many categories as it takes.
          Nothing is added for you — an installation brings no testing unless testing is
          ticked too.
        </p>
      </div>

      {/* what is selected, readable without opening anything */}
      <div className="safety-summary" aria-live="polite">
        <p className="dialog-label">
          {ids.length === 0
            ? "Nothing selected yet"
            : `${ids.length} ${ids.length === 1 ? "activity" : "activities"} selected`}
        </p>
        {ids.length > 0 || mods.length > 0 ? (
          <ul className="safety-chips">
            {ids.map((id) => (
              <li key={id} className="safety-chip">
                {PRESET_BY_ID.get(id)?.rcdAttribute ? "RCD testing — " : ""}
                {PRESET_BY_ID.get(id)?.label}
                <button
                  type="button"
                  className="safety-chip-remove"
                  aria-label={`Remove ${PRESET_BY_ID.get(id)?.label}`}
                  onClick={() => toggleActivity(id)}
                >
                  ×
                </button>
              </li>
            ))}
            {mods.map((id) => (
              <li key={id} className="safety-chip is-site">
                {MODIFIER_BY_ID.get(id)?.label}
                <button
                  type="button"
                  className="safety-chip-remove"
                  aria-label={`Remove ${MODIFIER_BY_ID.get(id)?.label}`}
                  onClick={() => toggleModifier(id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="board-section-note">Open a category below, or start from a saved preset.</p>
        )}
        {legacyMethods.length > 0 ? (
          <p className="amp-hint is-standalone">
            Carried over from an earlier version of this job:{" "}
            {legacyMethods.map((method) => METHODS[method].label).join(", ")}.{" "}
            <button
              type="button"
              className="safety-link"
              onClick={() => selection && onSelection({ ...selection, methods: [] })}
            >
              Clear it
            </button>
          </p>
        ) : null}
      </div>

      {saved.length > 0 ? (
        <div className="safety-group">
          {groupHead("saved", `Your saved presets (${saved.length})`, 0)}
          {isOpen("saved") ? (
            <div className="issue-picks safety-group-body">
              {saved.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="issue-pick"
                  onClick={() => {
                    onSelection(preset.selection);
                    onEdits(preset.edits ?? {});
                    setNote(`Loaded "${preset.name}". Change anything below.`);
                  }}
                >
                  <span className="issue-pick-mark is-one" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{preset.name}</span>
                    <span className="issue-pick-note">
                      {activityIds(preset.selection)
                        .map((id) => PRESET_BY_ID.get(id)?.label)
                        .filter(Boolean)
                        .join(" · ") || "a saved selection"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {GROUP_ORDER.map((group) => {
        const count = ids.filter((id) => PRESET_BY_ID.get(id)?.group === group).length;
        return (
          <div className="safety-group" key={group}>
            {groupHead(group, GROUP_LABELS[group], count)}
            {isOpen(group) ? (
              <div className="issue-picks safety-group-body">
                {offered(group).map((preset) => (
                  tick({
                    key: preset.id,
                    on: ids.includes(preset.id),
                    label: preset.label,
                    onPress: () => toggleActivity(preset.id),
                  })
                ))}
                {group === "TESTING" ? (
                  <>
                    <p className="safety-sub-head">For the RCD testing above</p>
                    {PRESETS.filter((preset) => preset.rcdAttribute).map((preset) => (
                      tick({
                        key: preset.id,
                        sub: true,
                        on: ids.includes(preset.id),
                        label: preset.label,
                        note: hasPhase ? undefined : "Tick single- or three-phase RCD testing first",
                        disabled: !hasPhase && !ids.includes(preset.id),
                        onPress: () => toggleActivity(preset.id),
                      })
                    ))}
                  </>
                ) : null}
                {PRESETS.filter(
                  (preset) => preset.group === group && preset.legacy && ids.includes(preset.id),
                ).map((preset) => (
                  tick({
                    key: preset.id,
                    on: true,
                    label: preset.label,
                    note: "From an earlier version — untick it and tick the separate activities instead",
                    onPress: () => toggleActivity(preset.id),
                  })
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="safety-group">
        {groupHead(SITE, "Site conditions", mods.length)}
        {isOpen(SITE) ? (
          <div className="issue-picks safety-group-body">
            {!selection ? (
              <p className="board-section-note">Tick an activity first.</p>
            ) : (
              MODIFIERS.map((modifier) => (
                tick({
                  key: modifier.id,
                  on: mods.includes(modifier.id),
                  label: modifier.label,
                  note: modifier.question,
                  onPress: () => toggleModifier(modifier.id),
                })
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* only the follow-ups the ticked activities raise */}
      {follows.map((follow) => (
        <div className="safety-question is-follow-up safety-follow" key={follow.id}>
          <div className="board-section-head">
            <h3 className="board-section-title">{follow.question}</h3>
            {follow.note ? <p className="board-section-note">{follow.note}</p> : null}
          </div>
          <div className="issue-picks">
            {follow.options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={answers[follow.id] === option.value}
                className={`issue-pick ${answers[follow.id] === option.value ? "is-on" : ""}`}
                onClick={() => answer(follow.id, option.value)}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">{option.label}</span>
                  {option.note ? <span className="issue-pick-note">{option.note}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* the proposal, out of the way until wanted */}
      {selection ? (
        <div className={`safety-wording ${wordingOpen ? "is-open" : ""}`}>
          <button
            type="button"
            className={`safety-group-head ${wordingOpen ? "is-open" : ""}`}
            aria-expanded={wordingOpen}
            onClick={() => setWordingOpen((current) => !current)}
          >
            <span className="safety-group-chevron" aria-hidden />
            <span className="safety-group-title">Generated wording</span>
            <span className={`safety-group-count ${toReview > 0 ? "is-warn" : ""}`}>
              {toReview > 0
                ? `${toReview} to review`
                : editedCount > 0
                  ? `${editedCount} edited`
                  : `${blocks.length} sections`}
            </span>
          </button>

          {wordingOpen ? (
            <div className="safety-group-body">
              <p className="board-section-note">
                Proposed wording, written from the activities selected above. Edit anything —
                your edits are kept. If a change of activities would rewrite a section you
                edited, it is flagged here for you to decide.
              </p>

              {orphaned.map((entry) => (
                <div className="safety-stale" key={entry.id}>
                  <p className="dialog-label">{entry.heading} — no longer written</p>
                  <p className="board-section-note">
                    The selected activities no longer call for this section. Your edited text
                    is below if you want to copy any of it.
                  </p>
                  <textarea className="dialog-input is-area" readOnly value={entry.text} rows={3} />
                  <div className="tagging-actions">
                    <button type="button" className="issue-add is-quiet" onClick={() => takeProposed(entry.id)}>
                      Discard my edit
                    </button>
                  </div>
                </div>
              ))}

              {blocks.map((block) => (
                <div className={`dialog-field ${block.stale ? "safety-stale" : ""}`} key={block.id}>
                  <span className="dialog-label">
                    {block.heading}
                    {block.edited && !block.stale ? <span className="safety-tag">edited</span> : null}
                    {block.stale ? <span className="safety-tag is-warn">review</span> : null}
                  </span>
                  {block.stale ? (
                    <p className="board-section-note">
                      The activities changed after you edited this. Your wording is shown; the
                      updated proposal is underneath.
                    </p>
                  ) : null}
                  <textarea
                    className="dialog-input is-area"
                    aria-label={block.heading}
                    rows={Math.min(10, Math.max(3, block.text.split("\n").length + 2))}
                    value={block.text}
                    onChange={(event) => write(block.id, block.proposed, event.target.value, block.stale)}
                  />
                  {block.stale ? (
                    <>
                      <p className="safety-proposed">{block.proposed}</p>
                      <div className="tagging-actions">
                        <button type="button" className="issue-add" onClick={() => takeProposed(block.id)}>
                          Use the updated wording
                        </button>
                        <button
                          type="button"
                          className="issue-add is-quiet"
                          onClick={() => keepMine(block.id, block.proposed)}
                        >
                          Keep my edit
                        </button>
                      </div>
                    </>
                  ) : block.edited ? (
                    <button type="button" className="safety-link" onClick={() => takeProposed(block.id)}>
                      Reset to the proposed wording
                    </button>
                  ) : null}
                </div>
              ))}

              <p className="amp-hint is-standalone">{WORDING_LIMITS}</p>

              {composition && composition.confirm.length > 0 ? (
                <div className="safety-confirm">
                  <p className="dialog-label">Still to be confirmed on this job</p>
                  <ul className="safety-confirm-list">
                    {composition.confirm.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* saving the selection, apart from moving on */}
      {selection ? (
        <div className="safety-save">
          <label className="dialog-field">
            <span className="dialog-label">Save as a preset</span>
            <span className="board-section-note">
              Keeps these activities, answers, site conditions and any edited wording for
              the next job like it.
            </span>
          </label>
          <div className="safety-save-row">
            <input
              className="dialog-input"
              aria-label="Preset name"
              placeholder="Preset name, e.g. Depot GPOs + RCD test"
              value={naming}
              onChange={(event) => setNaming(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveAs();
              }}
            />
            <button
              type="button"
              className="issue-add"
              disabled={busy || !naming.trim()}
              onClick={() => void saveAs()}
            >
              {busy ? "Saving…" : "Save preset"}
            </button>
          </div>
        </div>
      ) : null}

      {note ? <p className="amp-warning safety-note">{note}</p> : null}

      <div className="dialog-actions safety-step-footer">
        <span className="safety-footer-status">
          {ids.length === 0
            ? "No activities selected"
            : toReview > 0
              ? "Some edited wording needs reviewing — see Generated wording"
              : unansweredFollows > 0
              ? `${unansweredFollows} follow-up${unansweredFollows === 1 ? "" : "s"} unanswered — listed as still to confirm`
              : `${ids.length} ${ids.length === 1 ? "activity" : "activities"} selected`}
        </span>
        <button
          type="button"
          className="dialog-confirm"
          disabled={ids.length === 0 || toReview > 0}
          onClick={() => onNext(wording)}
        >
          {ids.length === 0
            ? "Pick the job first"
            : toReview > 0
              ? "Review the changed wording first"
              : "Next — the questions this leaves"}
        </button>
      </div>
    </section>
  );
}
