"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  METHODS,
  MODIFIERS,
  PRESETS,
  PRESET_BY_ID,
  WORDING_LIMITS,
  applyEdits,
  compose,
  type Edits,
  type MethodKey,
  type Selection,
} from "@/lib/safety/presets";

/**
 * Choosing the job, and reading back what that says.
 *
 * The main job first, then anything else on the same visit, then which tests
 * are actually being done, then what the site is like. Every one of those is
 * a tap, and between them they write the scope, the method, the alternatives
 * considered and the controls — which is the part that used to be typed.
 *
 * The preview is editable and the edit is kept against the wording it was an
 * edit of. Change an answer and the block recomposes; an edit that belonged
 * to the old wording is dropped and said to have been dropped, rather than
 * left sitting on top of a paragraph it was never written for. That is the
 * whole reason edits are stored as `{ source, text }` and not as text.
 */

export type Saved = { id: string; name: string; selection: Selection; edits: Edits | null };

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

  useEffect(() => {
    void fetch("/api/safety-presets", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setSaved)
      .catch(() => undefined);
  }, []);

  const composition = useMemo(
    () => (selection ? compose(selection) : null),
    [selection],
  );
  const applied = useMemo(
    () => (composition ? applyEdits(composition, edits) : null),
    [composition, edits],
  );

  /*
   * An edit that no longer belongs is dropped, once, with a word about it.
   *
   * `applyEdits` works it out; this is what acts on it. Clearing them from
   * state matters as much as telling the person: an edit left in state would
   * be sent to the server and come back to haunt the next composition.
   */
  useEffect(() => {
    if (!applied || applied.dropped.length === 0) return;
    const names = applied.dropped.map((block) => block.heading.toLowerCase());
    setNote(
      `Your changed answer rewrote ${names.join(" and ")}, so the wording you had typed there has been replaced.`,
    );
    const kept: Edits = {};
    for (const [id, edit] of Object.entries(edits)) {
      if (applied.dropped.some((block) => block.id === id)) continue;
      kept[id] = edit;
    }
    onEdits(kept);
    // `applied` is recomputed from edits, so this settles after one pass.
  }, [applied, edits, onEdits]);

  const main = selection ? PRESET_BY_ID.get(selection.presetId) : null;
  const blocks = applied?.blocks ?? [];
  const wording = blocks.map((block) => `${block.heading}\n${block.text}`).join("\n\n");

  const set = (patch: Partial<Selection>) => {
    if (!selection) return;
    onSelection({ ...selection, ...patch });
  };

  const toggle = <T extends string>(list: T[] | undefined, value: T): T[] =>
    (list ?? []).includes(value)
      ? (list ?? []).filter((item) => item !== value)
      : [...(list ?? []), value];

  /** Picking a main job proposes its own methods, and nothing more. */
  function choose(presetId: string) {
    const preset = PRESET_BY_ID.get(presetId);
    if (!preset) return;
    onSelection({
      presetId,
      alsoIds: [],
      methods: preset.methods ?? [],
      modifierIds: selection?.modifierIds ?? [],
    });
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
      setNote(`Saved as "${name}". It is in Your own presets from now on.`);
    } catch {
      setNote("That preset could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="board-section-head">
        <h3 className="board-section-title">What is the job?</h3>
        <p className="board-section-note">
          Pick the main job, then anything else on the same visit. Testing stands on its
          own — an RCD test, a thermal survey or a current recording is a whole job, and
          nothing has to be chosen in front of it.
        </p>
      </div>

      {saved.length > 0 ? (
        <div className="safety-question">
          <div className="board-section-head">
            <h3 className="board-section-title">Your own presets</h3>
          </div>
          <div className="issue-picks">
            {saved.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="issue-pick"
                onClick={() => {
                  onSelection(preset.selection);
                  onEdits(preset.edits ?? {});
                }}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">{preset.name}</span>
                  <span className="issue-pick-note">
                    {PRESET_BY_ID.get(preset.selection.presetId)?.label ?? "a saved selection"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {GROUP_ORDER.map((group) => (
        <div className="safety-question" key={group}>
          <div className="board-section-head">
            <h3 className="board-section-title">{GROUP_LABELS[group]}</h3>
          </div>
          <div className="issue-picks">
            {PRESETS.filter((preset) => preset.group === group).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`issue-pick ${selection?.presetId === preset.id ? "is-on" : ""}`}
                onClick={() => choose(preset.id)}
              >
                <span className="issue-pick-mark is-one" aria-hidden />
                <span className="issue-pick-body">
                  <span className="issue-pick-label">{preset.label}</span>
                  <span className="issue-pick-note">{preset.scope}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {main ? (
        <>
          <div className="safety-question is-follow-up">
            <div className="board-section-head">
              <h3 className="board-section-title">Anything else on the same visit?</h3>
              <p className="board-section-note">
                Only what is actually being done. Each one adds its own scope paragraph and
                brings its own statement.
              </p>
            </div>
            <div className="issue-picks">
              {PRESETS.filter((preset) => preset.id !== main.id).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`issue-pick ${
                    (selection?.alsoIds ?? []).includes(preset.id) ? "is-on" : ""
                  }`}
                  onClick={() => set({ alsoIds: toggle(selection?.alsoIds, preset.id) })}
                >
                  <span className="issue-pick-mark" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{preset.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="safety-question is-follow-up">
            <div className="board-section-head">
              <h3 className="board-section-title">Which tests are being done?</h3>
              <p className="board-section-note">
                Turn off anything that is not. Wording for a test nobody selected never
                appears, so an installation with nothing to test carries no test method at
                all.
              </p>
            </div>
            <div className="issue-picks">
              {(Object.keys(METHODS) as MethodKey[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`issue-pick ${
                    (selection?.methods ?? []).includes(method) ? "is-on" : ""
                  }`}
                  onClick={() => set({ methods: toggle(selection?.methods, method) })}
                >
                  <span className="issue-pick-mark" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{METHODS[method].label}</span>
                    <span className="issue-pick-note">{METHODS[method].note}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="safety-question is-follow-up">
            <div className="board-section-head">
              <h3 className="board-section-title">What is the site like?</h3>
            </div>
            <div className="issue-picks">
              {MODIFIERS.map((modifier) => (
                <button
                  key={modifier.id}
                  type="button"
                  className={`issue-pick ${
                    (selection?.modifierIds ?? []).includes(modifier.id) ? "is-on" : ""
                  }`}
                  onClick={() => set({ modifierIds: toggle(selection?.modifierIds, modifier.id) })}
                >
                  <span className="issue-pick-mark" aria-hidden />
                  <span className="issue-pick-body">
                    <span className="issue-pick-label">{modifier.question}</span>
                    <span className="issue-pick-note">{modifier.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* the preview */}
          <div className="safety-question">
            <div className="board-section-head">
              <h3 className="board-section-title">Proposed wording</h3>
              <p className="board-section-note">
                Edit anything. Change an answer above and the block it affects is written
                again from the new answer, so nothing from the old one is left behind.
              </p>
            </div>

            {note ? <p className="amp-warning">{note}</p> : null}

            {blocks.map((block) => (
              <label className="dialog-field" key={block.id}>
                <span className="dialog-label">{block.heading}</span>
                <textarea
                  className="dialog-input is-area"
                  rows={Math.min(10, Math.max(3, block.text.split("\n").length + 2))}
                  value={block.text}
                  onChange={(event) =>
                    onEdits({
                      ...edits,
                      [block.id]: {
                        source: composition?.blocks.find((one) => one.id === block.id)?.text ?? "",
                        text: event.target.value,
                      },
                    })
                  }
                />
              </label>
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

            <div className="tagging-actions">
              <input
                className="dialog-input"
                placeholder="Save this as a preset, called…"
                value={naming}
                onChange={(event) => setNaming(event.target.value)}
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
        </>
      ) : null}

      <div className="dialog-actions">
        <button
          type="button"
          className="dialog-confirm"
          disabled={!main}
          onClick={() => onNext(wording)}
        >
          {main ? "Next — the questions this leaves" : "Pick the job first"}
        </button>
      </div>
    </section>
  );
}
