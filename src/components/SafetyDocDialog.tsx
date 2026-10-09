"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BY_CODE, DISCREPANCIES, SIGNATORIES, TEMPLATES } from "@/lib/safety/catalogue";
import { personName } from "@/lib/contacts";
import {
  decide,
  manualCodes,
  unanswered as stillOpen,
  withManual,
  withoutManual,
  asked,
  selectionOf,
  withPreset,
  type Answers,
} from "@/lib/safety/decide";
import { SafetyPresetStep } from "@/components/SafetyPresetStep";
import type { Edits } from "@/lib/safety/presets";
import { STANDING_RULES, rules } from "@/lib/safety/rules";
import { titleCase } from "@/lib/writing";
import { RichTextBox } from "@/components/RichTextBox";
import { isEmpty, summarise, type RichText } from "@/lib/richText";
import { Whs002Form, type BoardOption } from "@/components/Whs002Form";
import { whsGaps, type Whs002 } from "@/lib/safety/whs002";
import { clearSession, usePersisted } from "@/lib/session";
import { PreparedByPicks } from "@/components/PreparedByPicks";
import { DialogScrim } from "@/components/DialogScrim";

/**
 * Getting a job's safe work paperwork out.
 *
 * It starts with what the job is — any of the eighteen scopes the company has
 * written a statement for, because any of them can be the whole job. A day of
 * RCD testing is not an installation with testing bolted on. Everything after
 * that adds to it, and a question the first answer has already settled is not
 * asked again.
 *
 * Then the scope of works, written once in the operator's own words. That goes
 * on a page of its own in front of every document, and into the scope panel
 * the SWMS templates leave blank. Where one document needs to say something
 * different, its scope can be edited on its own.
 *
 * Two things happen at the end and nowhere else. The job number is asked for
 * and written into each document's own job field — never over the identifier
 * the document prints for itself. And each person reads the set and confirms
 * it, one at a time, because a signature the app holds is not a review: it
 * goes on a document when its owner says it does.
 */

type Doc = {
  id: string;
  codes: string[];
  date: string;
  projectName: string | null;
  projectManager: string | null;
  contactNumber: string | null;
  jobTitle: string | null;
  jobDescription: string | null;
  workDescription: string | null;
  answers: Answers | null;
  jobNumber: string | null;
  contactId: string | null;
  scope: RichText | null;
  scopeOverrides: Record<string, RichText> | null;
  assessmentDate: string | null;
  signOff: Record<string, { at: string }> | null;
  preparedBy?: string[];
  energised: Whs002 | null;
  preset: { edits?: Edits } | null;
};

export type SafetyContact = { id: string; name: string; phone: string | null };

type Step = "preset" | "questions" | "scope" | "documents" | "details" | "energised" | "sign";

export function SafetyDocDialog({
  docId,
  clientName,
  siteName,
  siteLocation,
  contacts,
  boards,
  onClose,
}: {
  docId: string;
  clientName: string;
  siteName: string;
  siteLocation: string | null;
  contacts: SafetyContact[];
  boards: BoardOption[];
  onClose: () => void;
}) {
  const key = `safety:${docId}`;
  const [step, setStep] = usePersisted<Step>(`${key}:step`, "preset");
  const [edits, setEdits] = usePersisted<Edits>(`${key}:edits`, {});
  const [answers, setAnswers] = usePersisted<Answers>(`${key}:answers`, {});
  const [title, setTitle] = usePersisted<string>(`${key}:title`, "");
  const [contactId, setContactId] = usePersisted<string>(`${key}:contact`, "");
  const [scope, setScope] = usePersisted<RichText>(`${key}:scope`, []);
  const [overrides, setOverrides] = usePersisted<Record<string, RichText>>(`${key}:scopes`, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [jobNumber, setJobNumber] = usePersisted<string>(`${key}:job`, "");
  const [assessed, setAssessed] = usePersisted<string>(`${key}:assessed`, "");
  const [energised, setEnergised] = usePersisted<Whs002>(`${key}:whs`, {});
  const [typing, setTyping] = usePersisted<boolean>(`${key}:typing`, false);
  const [showRules, setShowRules] = useState(false);
  const [signed, setSigned] = useState<Record<string, string>>({});
  /** Everybody on file, so the step can say who the SWMS cannot carry. */
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [preparedBy, setPreparedBy] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [step]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/safety-docs/${docId}`, { cache: "no-store" });
    if (!response.ok) return;
    const doc = (await response.json()) as Doc;
    setTitle((current) => current || doc.jobTitle || doc.projectName || "");
    setContactId((current) => current || doc.contactId || "");
    setJobNumber((current) => current || doc.jobNumber || "");
    setAssessed((current) => current || (doc.assessmentDate ?? "").slice(0, 10));
    setSigned(
      Object.fromEntries(
        Object.entries(doc.signOff ?? {}).map(([who, value]) => [who, value.at]),
      ),
    );
    setPreparedBy(doc.preparedBy ?? []);
    if (doc.answers) {
      setAnswers((current) => (Object.keys(current).length ? current : doc.answers!));
    }
    if (doc.energised) {
      setEnergised((current) => (Object.keys(current).length ? current : doc.energised!));
    }
    if (doc.preset?.edits) {
      setEdits((current) => (Object.keys(current).length ? current : doc.preset!.edits!));
    }
    if (doc.scope) setScope((current) => (current.length ? current : doc.scope!));
    if (doc.scopeOverrides) {
      setOverrides((current) => (Object.keys(current).length ? current : doc.scopeOverrides!));
    }
  }, [
    docId,
    setTitle,
    setContactId,
    setAnswers,
    setJobNumber,
    setAssessed,
    setEnergised,
    setScope,
    setOverrides,
    setEdits,
  ]);

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

  const asking = useMemo(() => asked(answers), [answers]);
  const decision = useMemo(
    () => decide(answers, { title }),
    [answers, title],
  );
  const manual = manualCodes(answers);

  const open = stillOpen(answers);
  const needsWhs = decision.codes.includes("WHS002");
  const whsLeft = needsWhs ? whsGaps(energised).length : 0;
  const chosen = contacts.find((one) => one.id === contactId) ?? null;
  const ready = open.length === 0 && title.trim().length > 0 && !isEmpty(scope);

  const STEPS: [Step, string][] = [
    ["preset", "The job"],
    ["questions", "Questions"],
    ["scope", "Scope"],
    ["documents", "Documents"],
    ["details", "Details"],
    ...(needsWhs ? ([["energised", "Energised"]] as [Step, string][]) : []),
    ["sign", "Sign"],
  ];

  /** Everything but the signatures, which are their own act. */
  const body = useCallback(
    () => ({
      answers,
      jobTitle: title.trim(),
      workDescription: decision.description,
      projectName: title.trim(),
      contactId: contactId || null,
      scope,
      scopeOverrides: overrides,
      jobNumber: jobNumber.trim(),
      assessmentDate: assessed || null,
      energised: needsWhs ? energised : null,
      preset: { edits },
    }),
    [answers, title, decision, contactId, scope, overrides, jobNumber, assessed, energised, needsWhs, edits],
  );

  /**
   * Who has read these documents.
   *
   * Choosing somebody is the record of it, so it is saved as it is chosen
   * rather than at the end: the documents are filled on the way out and
   * whoever is named here is named on them.
   */
  async function saveSigners(next: string[]) {
    setPreparedBy(next);
    await fetch(`/api/safety-docs/${docId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preparedBy: next }),
    }).catch(() => setError("That could not be saved."));
  }

  /**
   * Whoever was chosen that the released SWMS have no row for.
   *
   * Seventeen of the eighteen print Scott's and Kye's names beside their
   * signatory rows. That is the controlled document; anybody else signs the
   * JSAs, which have four rows and no printed names, and OEC-SWMS013.
   */
  const unplaceable = preparedBy
    .map((id) => people.find((person) => person.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .filter((name) => !SIGNATORIES.some((person) => person.name.toLowerCase() === name.toLowerCase()));

  async function save(then: "close" | "stay") {
    if (!ready) return;
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(`/api/safety-docs/${docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That could not be saved.");
      }
      // Saving changes what would be downloaded, so any confirmation that was
      // given against the old answers is withdrawn — here and on the server.
      setSigned({});
      if (then === "close") {
        for (const part of [
          "step", "answers", "title", "contact", "scope", "scopes", "edits",
          "typing", "job", "assessed", "whs",
        ]) {
          clearSession(`${key}:${part}`);
        }
        onClose();
        return;
      }
      setBusy(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
      setBusy(null);
    }
  }

  /**
   * One person, confirming for themselves.
   *
   * The documents are saved first, so what is confirmed is exactly what would
   * come out of the download button a second later.
   */
  async function sign(who: string, confirmed: boolean) {
    setBusy("sign");
    setError(null);
    try {
      if (confirmed) {
        const saved = await fetch(`/api/safety-docs/${docId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body()),
        });
        if (!saved.ok) throw new Error("That could not be saved.");
      }
      const response = await fetch(`/api/safety-docs/${docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sign: { key: who, confirmed } }),
      });
      if (!response.ok) throw new Error("That could not be recorded.");
      const doc = (await response.json()) as Doc;
      setSigned(
        Object.fromEntries(
          Object.entries(doc.signOff ?? {}).map(([person, value]) => [person, value.at]),
        ),
      );
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : "That could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  /** A name for the job, from what has been answered about it. */
  /**
   * A document, or the lot.
   *
   * Saved first, because the documents are filled from what is on file rather
   * than from what is on screen, and downloading something that does not match
   * what was just typed would be the worst kind of surprise.
   */
  async function take(code?: string) {
    if (!ready) return;
    setBusy("save");
    setError(null);
    try {
      const saved = await fetch(`/api/safety-docs/${docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      if (!saved.ok) throw new Error("That could not be saved.");
      const link = document.createElement("a");
      link.href = `/api/safety-docs/${docId}/download${code ? `?only=${code}` : ""}`;
      link.rel = "noopener";
      link.download = "";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (downloadError) {
      setError(
        downloadError instanceof Error ? downloadError.message : "That could not be built.",
      );
    } finally {
      setBusy(null);
    }
  }

  const titleOptions = useMemo(() => {
    const main = asking[0]?.options.find((one) => one.value === answers.nature);
    return unique([
      main ? `${main.label} — ${titleCase(siteName)}` : "",
      `${titleCase(siteName)} — ${titleCase(clientName)}`,
    ]);
  }, [asking, answers.nature, siteName, clientName]);

  /** Anything the library disagrees with itself about, for the chosen set. */
  const problems = DISCREPANCIES.filter(
    (entry) => decision.codes.includes(entry.code) || entry.code === "every SWMS",
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Safe work paperwork">
      <DialogScrim />

      <div className="board is-viewer">
        <header className="board-head">
          <div className="board-head-main">
            <h2 className="dialog-title">Safe work paperwork</h2>
            <p className="board-section-note">
              {siteName}
              {siteLocation?.trim() ? ` · ${siteLocation.trim()}` : ""}
            </p>
          </div>
          <div className="board-head-side">
            <nav className="rcd-steps" aria-label="Steps">
              {STEPS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rcd-step ${step === id ? "is-on" : ""}`}
                  onClick={() => setStep(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="board-scroll" ref={scroller}>
          <div className="board-body">
            {step === "preset" ? (
              <SafetyPresetStep
                selection={selectionOf(answers)}
                edits={edits}
                onSelection={(next) => setAnswers((current) => withPreset(current, next))}
                onEdits={setEdits}
                onNext={(wording) => {
                  // The composed wording seeds the scope of works, so the
                  // scope step opens with the job already described. It is
                  // seeded only while the scope is still empty: once somebody
                  // has written there, that is theirs.
                  if (isEmpty(scope) && wording.trim()) {
                    setScope(
                      wording
                        .split("\n")
                        .filter((line) => line.trim())
                        .map((line) => ({ kind: "p" as const, runs: [{ text: line }] })),
                    );
                  }
                  setStep("questions");
                }}
              />
            ) : null}

            {step === "questions" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">About the job</h3>
                  <p className="board-section-note">
                    Which statements you need follows from these, so none of them ask about
                    paperwork. Answer one and another may appear: where two answers cannot
                    both be true, the app asks rather than picking one.
                  </p>
                </div>

                {asking.map((question) => {
                  return (
                    <div
                      key={question.key}
                      className={`safety-question ${question.when ? "is-follow-up" : ""}`}
                    >
                      <div className="board-section-head">
                        <h3 className="board-section-title">
                          {question.question}
                          {question.when ? (
                            <span className="safety-from-quote is-follow">follow-up</span>
                          ) : null}
                        </h3>
                        {question.note ? (
                          <p className="board-section-note">{question.note}</p>
                        ) : null}
                      </div>
                      <div className="issue-picks">
                        {question.options.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`issue-pick ${
                              answers[question.key] === option.value ? "is-on" : ""
                            }`}
                            onClick={() =>
                              setAnswers((current) => ({
                                ...current,
                                [question.key]: option.value,
                              }))
                            }
                          >
                            <span className="issue-pick-mark is-one" aria-hidden />
                            <span className="issue-pick-body">
                              <span className="issue-pick-label">{option.label}</span>
                              {option.note ? (
                                <span className="issue-pick-note">{option.note}</span>
                              ) : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="dialog-actions">
                  <button type="button" className="dialog-cancel" onClick={() => setStep("preset")}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={open.length > 0}
                    onClick={() => setStep("scope")}
                  >
                    {open.length > 0 ? `${open.length} left` : "Next — the scope of works"}
                  </button>
                </div>
              </section>
            ) : null}

            {step === "scope" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">The scope of works</h3>
                  <p className="board-section-note">
                    What is actually being done on this job, in your words. It goes on a
                    page of its own in front of every document, and into the scope panel
                    the statements leave blank. Paragraphs, dot points, bold and italics all
                    come through onto the page.
                  </p>
                </div>

                <RichTextBox value={scope} onChange={setScope} />

                {isEmpty(scope) ? (
                  <p className="issue-empty">
                    Nothing yet. The documents cannot go out without it — every one of them
                    was written to be used on any job, so this is the only part that says
                    which job.
                  </p>
                ) : null}

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="dialog-cancel"
                    onClick={() => setStep("questions")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={isEmpty(scope)}
                    onClick={() => setStep("documents")}
                  >
                    {isEmpty(scope) ? "Write the scope first" : `Next — ${decision.codes.length} documents`}
                  </button>
                </div>
              </section>
            ) : null}

            {step === "documents" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">What you are getting, and why</h3>
                  <p className="board-section-note">
                    Chosen from your answers. Each one says what put it there. Nothing has
                    been generated yet — take anything out that does not belong, and add
                    anything the questions missed.
                  </p>
                </div>
                <div className="issue-picks">
                  {decision.codes.map((code) => {
                    const template = BY_CODE.get(code);
                    if (!template) return null;
                    const own = overrides[code];
                    const separate = own && !isEmpty(own);
                    return (
                      <div key={code} className="doc-row">
                        <div className="issue-pick is-on is-static">
                          <span className="issue-pick-body">
                            <span className="issue-pick-label">
                              OEC-{code} · {template.title}
                            </span>
                            <span className="issue-pick-note">{decision.reasons[code]}</span>
                            <span className="issue-pick-note">
                              {separate
                                ? `Its own scope: ${summarise(own, 90)}`
                                : "Uses the job's scope of works"}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="whs-fill"
                            onClick={() =>
                              setEditing((current) => (current === code ? null : code))
                            }
                          >
                            {editing === code ? "Done" : separate ? "Edit its scope" : "Give it its own scope"}
                          </button>
                          <button
                            type="button"
                            className="whs-drop"
                            onClick={() => setAnswers((current) => withManual(current, code, false))}
                          >
                            Take out
                          </button>
                        </div>
                        {editing === code ? (
                          <div className="doc-scope">
                            <p className="board-section-note">
                              What OEC-{code} says the work is. Everything else keeps the
                              job&apos;s scope.
                            </p>
                            <RichTextBox
                              value={separate ? own : scope}
                              onChange={(next) =>
                                setOverrides((current) => ({ ...current, [code]: next }))
                              }
                            />
                            {separate ? (
                              <button
                                type="button"
                                className="whs-drop"
                                onClick={() =>
                                  setOverrides((current) => {
                                    const next = { ...current };
                                    delete next[code];
                                    return next;
                                  })
                                }
                              >
                                Put it back on the job&apos;s scope
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {manual.dropped.length > 0 ? (
                  <>
                    <div className="board-section-head">
                      <h3 className="board-section-title">Taken out by hand</h3>
                      <p className="board-section-note">
                        These were chosen by the answers and removed afterwards.
                      </p>
                    </div>
                    <div className="issue-picks">
                      {manual.dropped.map((code) => (
                        <div key={code} className="issue-pick is-static">
                          <span className="issue-pick-body">
                            <span className="issue-pick-label">
                              OEC-{code} · {BY_CODE.get(code)?.title ?? code}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="whs-drop"
                            onClick={() =>
                              setAnswers((current) => withoutManual(current, code))
                            }
                          >
                            Put back
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                <div className="board-section-head">
                  <h3 className="board-section-title">Add one by hand</h3>
                  <p className="board-section-note">
                    Everything in the library. Anything added here is marked on the list
                    above as added by hand.
                  </p>
                </div>
                <div className="issue-picks">
                  {TEMPLATES.filter((template) => !decision.codes.includes(template.code)).map(
                    (template) => (
                      <button
                        key={template.code}
                        type="button"
                        className="issue-pick"
                        onClick={() =>
                          setAnswers((current) => withManual(current, template.code, true))
                        }
                      >
                        <span className="issue-pick-mark" aria-hidden />
                        <span className="issue-pick-body">
                          <span className="issue-pick-label">
                            OEC-{template.code} · {template.title}
                          </span>
                        </span>
                      </button>
                    ),
                  )}
                </div>

                {decision.hazards.length > 0 ? (
                  <>
                    <div className="board-section-head">
                      <h3 className="board-section-title">Raise these at the pre-start</h3>
                      <p className="board-section-note">
                        {decision.hazards.length}{" "}
                        {decision.hazards.length === 1 ? "hazard" : "hazards"} this job
                        brings that the standard risk assessments do not list. They are not
                        written into the released tables — those are controlled documents
                        and are handed over exactly as approved — so they go in the job
                        description and belong in the toolbox talk.
                      </p>
                    </div>
                    <ul className="safety-hazards">
                      {decision.hazards.map((hazard) => (
                        <li key={hazard.key}>
                          <strong>{hazard.task}</strong>
                          <span>{hazard.hazard}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <div className="board-section-head">
                  <h3 className="board-section-title">The job, as it will read</h3>
                  <p className="board-section-note">
                    The quote and your answers together. This is printed on the documents.
                  </p>
                </div>
                <p className="issue-empty">{decision.description || "—"}</p>

                <button
                  type="button"
                  className="whs-fill"
                  onClick={() => setShowRules((current) => !current)}
                >
                  {showRules ? "Hide the rules" : "Show the rules these came from"}
                </button>

                {showRules ? (
                  <>
                    {rules().map((rule) => (
                      <div key={rule.question} className="safety-question">
                        <div className="board-section-head">
                          <h3 className="board-section-title">
                            {rule.question}
                            {rule.followUp ? (
                              <span className="safety-from-quote is-follow">follow-up</span>
                            ) : null}
                          </h3>
                        </div>
                        <ul className="safety-hazards">
                          {rule.answers
                            .filter((answer) => answer.gives.length > 0)
                            .map((answer) => (
                              <li key={answer.label}>
                                <strong>{answer.label}</strong>
                                <span>
                                  brings{" "}
                                  {answer.gives.map((code) => `OEC-${code}`).join(", ")}
                                  {BY_CODE.get(answer.gives[0])?.pairs
                                    ? ` and the risk assessment paired with it`
                                    : ""}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                    <ul className="safety-hazards">
                      {STANDING_RULES.map((rule) => (
                        <li key={rule}>
                          <strong>{rule}</strong>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {problems.length > 0 ? (
                  <>
                    <div className="board-section-head">
                      <h3 className="board-section-title">
                        Known problems with these source documents
                      </h3>
                      <p className="board-section-note">
                        Found by reading the released files. None of them is corrected
                        automatically — a controlled document number is not ours to
                        rewrite — so they are listed here for the author to fix at the
                        source.
                      </p>
                    </div>
                    <ul className="safety-hazards">
                      {problems.map((entry, index) => (
                        <li key={`${entry.code}-${index}`}>
                          <strong>
                            {entry.code} — {entry.where} reads “{entry.says}”
                          </strong>
                          <span>{entry.shouldRead}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <div className="dialog-actions">
                  <button type="button" className="dialog-cancel" onClick={() => setStep("scope")}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    onClick={() => setStep("details")}
                  >
                    Next
                  </button>
                </div>
              </section>
            ) : null}

            {step === "details" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">The job number</h3>
                  <p className="board-section-note">
                    Written into each document&apos;s own job or project field, beneath the
                    OEC-SWMS or OEC-JSA number the document prints for itself. That number
                    is never changed — this is a separate value.
                  </p>
                </div>
                <label className="dialog-field">
                  <span className="dialog-label">Job number</span>
                  <input
                    className="dialog-input"
                    placeholder="e.g. 2026-118"
                    value={jobNumber}
                    onChange={(event) => setJobNumber(event.target.value)}
                  />
                </label>

                <div className="board-section-head">
                  <h3 className="board-section-title">When was the assessment done?</h3>
                  <p className="board-section-note">
                    The day it was actually carried out. Leave it empty until it has been —
                    nothing is dated for work that has not happened.
                  </p>
                </div>
                <label className="dialog-field">
                  <span className="dialog-label">Assessment date</span>
                  <input
                    className="dialog-input"
                    type="date"
                    value={assessed}
                    onChange={(event) => setAssessed(event.target.value)}
                  />
                </label>

                <div className="board-section-head">
                  <h3 className="board-section-title">What is it called?</h3>
                </div>
                <div className="issue-picks">
                  {titleOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`issue-pick ${title === option ? "is-on" : ""}`}
                      onClick={() => {
                        setTitle(option);
                        setTyping(false);
                      }}
                    >
                      <span className="issue-pick-mark is-one" aria-hidden />
                      <span className="issue-pick-body">
                        <span className="issue-pick-label">{option}</span>
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`issue-pick ${typing ? "is-on" : ""}`}
                    onClick={() => {
                      setTyping(true);
                      setTitle("");
                    }}
                  >
                    <span className="issue-pick-mark is-one" aria-hidden />
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">Something else</span>
                      <span className="issue-pick-note">A name of your own</span>
                    </span>
                  </button>
                </div>
                {typing ? (
                  <label className="dialog-field">
                    <span className="dialog-label">Job name</span>
                    <input
                      className="dialog-input"
                      autoFocus
                      placeholder="e.g. Floodlight installation — rear yard"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                ) : null}

                <div className="board-section-head">
                  <h3 className="board-section-title">Who is the site contact?</h3>
                  <p className="board-section-note">
                    The people saved against this site. Their number comes with them and is
                    printed on the documents as it is held here.
                  </p>
                </div>
                {contacts.length === 0 ? (
                  <p className="issue-empty">
                    Nobody is saved against this site yet. Add them under Sites &amp;
                    contacts and they will appear here.
                  </p>
                ) : (
                  <div className="issue-picks">
                    {contacts.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        className={`issue-pick ${contactId === person.id ? "is-on" : ""}`}
                        onClick={() => setContactId(contactId === person.id ? "" : person.id)}
                      >
                        <span className="issue-pick-mark is-one" aria-hidden />
                        <span className="issue-pick-body">
                          <span className="issue-pick-label">{personName(person.name)}</span>
                          <span className="issue-pick-note">
                            {person.phone?.trim()
                              ? person.phone
                              : "No phone number saved against this contact"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {chosen ? (
                  <label className="dialog-field">
                    <span className="dialog-label">Contact number</span>
                    <input
                      className="dialog-input is-locked"
                      value={chosen.phone?.trim() || ""}
                      placeholder="No number saved"
                      readOnly
                      tabIndex={-1}
                    />
                    <span className="dialog-help">
                      {chosen.phone?.trim()
                        ? `Read from ${personName(chosen.name)}'s contact record. If it is wrong, correct it under Sites & contacts — this workflow will not hold a different number to the one on file.`
                        : `${personName(chosen.name)} has no phone number saved. Add it under Sites & contacts; it cannot be typed here, because a number that only exists on one job is a number nobody can ring twice.`}
                    </span>
                  </label>
                ) : null}

                {error ? <p className="dialog-error">{error}</p> : null}

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="dialog-cancel"
                    onClick={() => setStep("documents")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={!ready}
                    onClick={() => setStep(needsWhs ? "energised" : "sign")}
                  >
                    {ready ? "Next" : "Name the job first"}
                  </button>
                </div>
              </section>
            ) : null}

            {step === "energised" && needsWhs ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">
                    OEC-WHS002 — energised testing justification
                  </h3>
                  <p className="board-section-note">
                    This form is here because you said an escutcheon, cover or barrier comes
                    off while the supply is on — not because the job is RCD testing.
                    Choosing RCD testing authorises nothing on its own.
                  </p>
                </div>
                <Whs002Form
                  value={energised}
                  onChange={setEnergised}
                  boards={boards}
                  jobNumber={jobNumber.trim()}
                />
                {error ? <p className="dialog-error">{error}</p> : null}
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="dialog-cancel"
                    onClick={() => setStep("details")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    onClick={() => setStep("sign")}
                  >
                    Next
                  </button>
                </div>
              </section>
            ) : null}

            {step === "sign" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">Read it, then sign it</h3>
                  <p className="board-section-note">
                    Each person confirms for themselves. Until somebody confirms, their
                    signature is not applied and their row is left blank and undated — the
                    app holding a signature is not the same as a person having read
                    something.
                  </p>
                </div>

                <ul className="safety-hazards">
                  {decision.codes.map((code) => (
                    <li key={code}>
                      <strong>
                        OEC-{code} · {BY_CODE.get(code)?.title ?? code}
                      </strong>
                      <span>
                        {BY_CODE.get(code)?.format === "docx" ? "Word document" : "PDF"} ·
                        filled in place, handed over as released
                      </span>
                    </li>
                  ))}
                </ul>

                {needsWhs && whsLeft > 0 ? (
                  <p className="dialog-error">
                    OEC-WHS002 still has {whsLeft}{" "}
                    {whsLeft === 1 ? "answer" : "answers"} outstanding. It will download
                    with those boxes empty.
                  </p>
                ) : null}

                <PreparedByPicks
                  chosen={preparedBy}
                  needs="safety"
                  onChange={(next) => void saveSigners(next)}
                  onLoaded={setPeople}
                />

                {unplaceable.length > 0 ? (
                  <p className="dialog-error">
                    {unplaceable.join(" and ")}{" "}
                    {unplaceable.length === 1 ? "signs" : "sign"} the JSAs and OEC-SWMS013.
                    The other SWMS print Scott Wells and Kye Wells in their two signatory
                    rows — that is the released document, not something the app can
                    rewrite — so no signature is put against a name that is not theirs.
                  </p>
                ) : null}

                <p className="issue-empty">
                  Choosing somebody here is the record that they have read these documents:
                  their name, position and signature are applied to every one of them, dated
                  the day the assessment was carried out. Changing any answer clears the
                  selection, because what was read would no longer be what comes out.
                </p>

                <div className="board-section-head">
                  <h3 className="board-section-title">Take them away</h3>
                  <p className="board-section-note">
                    Saved as it stands, then built. Every statement and risk assessment is a
                    PDF with the scope of works in front of it; OEC-WHS002, where the job
                    needs one, stays the Word form so it can be completed and signed on
                    site.
                  </p>
                </div>
                <div className="issue-picks">
                  <button
                    type="button"
                    className="issue-pick is-download"
                    disabled={!ready || busy !== null}
                    onClick={() => void take()}
                  >
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">
                        All {decision.codes.length} documents, as one zip
                      </span>
                      <span className="issue-pick-note">
                        {busy === "save" ? "Building…" : "One file to forward or print"}
                      </span>
                    </span>
                  </button>
                  {decision.codes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className="issue-pick is-download"
                      disabled={!ready || busy !== null}
                      onClick={() => void take(code)}
                    >
                      <span className="issue-pick-body">
                        <span className="issue-pick-label">
                          OEC-{code} · {BY_CODE.get(code)?.title ?? code}
                        </span>
                        <span className="issue-pick-note">
                          {BY_CODE.get(code)?.kind === "WHS" ? "Word" : "PDF"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                {error ? <p className="dialog-error">{error}</p> : null}

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="dialog-cancel"
                    onClick={() => setStep(needsWhs ? "energised" : "details")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={!ready || busy !== null}
                    onClick={() => void save("close")}
                  >
                    {busy === "save" ? "Saving…" : "Save and close"}
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
