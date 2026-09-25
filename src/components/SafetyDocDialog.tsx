"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BY_CODE, DISCREPANCIES, SIGNATORIES, TEMPLATES } from "@/lib/safety/catalogue";
import { COMPANY } from "@/lib/company";
import { personName } from "@/lib/contacts";
import {
  decide,
  manualCodes,
  unanswered as stillOpen,
  withManual,
  withoutManual,
  asked,
  type Answers,
} from "@/lib/safety/decide";
import { STANDING_RULES, rules } from "@/lib/safety/rules";
import { titleCase } from "@/lib/writing";
import { uploadFile } from "@/components/ImageUpload";
import { Whs002Form, type BoardOption } from "@/components/Whs002Form";
import { whsGaps, type Whs002 } from "@/lib/safety/whs002";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Getting a job's safe work paperwork out.
 *
 * The quote says what the job is, so it is read rather than asked about. What
 * it does not say is asked — about the work, never about the paperwork: is any
 * of it off the ground, is a board being opened, is anything opened up while
 * the supply is on. Which SWMS and which JSA follow from the answers, they are
 * shown with the reason for each before anything is generated, and anything
 * that looks wrong can be taken out or put back by hand.
 *
 * Two things happen at the end and nowhere else. The job number is asked for
 * and written into each document's own job field — never over the identifier
 * the document prints for itself. And each person reads the set and confirms
 * it, one at a time, because a signature the app holds is not a review: it
 * goes on a document when its owner says it does.
 */

type Read = {
  jobTitle: string;
  jobDescription: string;
  answered: Answers;
  candidates: { projectNames: string[]; people: string[]; numbers: string[] };
};

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
  sourceFileId: string | null;
  jobNumber: string | null;
  assessmentDate: string | null;
  signOff: Record<string, { at: string }> | null;
  energised: Whs002 | null;
};

export type SafetyContact = { name: string; phone: string | null };

type Step = "quote" | "questions" | "documents" | "details" | "energised" | "sign";

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
  const [step, setStep] = usePersisted<Step>(`${key}:step`, "quote");
  const [read, setRead] = usePersisted<Read | null>(`${key}:read`, null);
  const [answers, setAnswers] = usePersisted<Answers>(`${key}:answers`, {});
  const [title, setTitle] = usePersisted<string>(`${key}:title`, "");
  const [manager, setManager] = usePersisted<string>(`${key}:manager`, "");
  const [number, setNumber] = usePersisted<string>(`${key}:number`, "");
  const [jobNumber, setJobNumber] = usePersisted<string>(`${key}:job`, "");
  const [assessed, setAssessed] = usePersisted<string>(`${key}:assessed`, "");
  const [energised, setEnergised] = usePersisted<Whs002>(`${key}:whs`, {});
  const [typing, setTyping] = usePersisted<boolean>(`${key}:typing`, false);
  const [showRules, setShowRules] = useState(false);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"quote" | "save" | "sign" | null>(null);
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
    setManager((current) => current || doc.projectManager || "");
    setNumber((current) => current || doc.contactNumber || "");
    setJobNumber((current) => current || doc.jobNumber || "");
    setAssessed((current) => current || (doc.assessmentDate ?? "").slice(0, 10));
    setSigned(
      Object.fromEntries(
        Object.entries(doc.signOff ?? {}).map(([who, value]) => [who, value.at]),
      ),
    );
    if (doc.answers) {
      setAnswers((current) => (Object.keys(current).length ? current : doc.answers!));
    }
    if (doc.energised) {
      setEnergised((current) => (Object.keys(current).length ? current : doc.energised!));
    }

    // The quote is kept against the job, so coming back tomorrow reads it
    // again rather than losing what it said.
    if (!doc.sourceFileId) return;
    const again = await fetch("/api/safety-docs/read-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: doc.sourceFileId }),
    });
    if (!again.ok) return;
    setRead((await again.json()) as Read);
  }, [
    docId,
    setTitle,
    setManager,
    setNumber,
    setAnswers,
    setRead,
    setJobNumber,
    setAssessed,
    setEnergised,
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

  async function readQuote(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy("quote");
    setError(null);
    try {
      const stored = await uploadFile(file);
      const response = await fetch("/api/safety-docs/read-quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: stored.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That quote could not be read.");
      }
      const result = (await response.json()) as Read;
      setRead(result);
      if (result.jobTitle) setTitle(result.jobTitle);
      // What the quote settles is filled in, and shown as such on the way past.
      setAnswers((current) => ({ ...result.answered, ...current }));

      await fetch(`/api/safety-docs/${docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceFileId: stored.id,
          jobTitle: result.jobTitle || null,
          jobDescription: result.jobDescription || null,
        }),
      });
      setStep("questions");
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "That quote could not be read.");
    } finally {
      setBusy(null);
    }
  }

  /** What the quote answered, and what is still open. */
  const fromQuote = read?.answered ?? {};
  const asking = useMemo(() => asked(answers), [answers]);
  const decision = useMemo(
    () =>
      decide(answers, {
        title: title || read?.jobTitle,
        description: read?.jobDescription,
      }),
    [answers, title, read],
  );
  const manual = manualCodes(answers);

  const open = stillOpen(answers);
  const needsWhs = decision.codes.includes("WHS002");
  const whsLeft = needsWhs ? whsGaps(energised).length : 0;
  const ready = open.length === 0 && title.trim().length > 0;

  const STEPS: [Step, string][] = [
    ["quote", "Quote"],
    ["questions", "The job"],
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
      jobDescription: read?.jobDescription ?? null,
      workDescription: decision.description,
      projectName: title.trim(),
      projectManager: manager.trim(),
      contactNumber: number.trim(),
      jobNumber: jobNumber.trim(),
      assessmentDate: assessed || null,
      energised: needsWhs ? energised : null,
    }),
    [answers, title, read, decision, manager, number, jobNumber, assessed, energised, needsWhs],
  );

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
          "step", "read", "answers", "title", "manager", "number",
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

  const titleOptions = useMemo(
    () =>
      unique([
        read?.jobTitle ?? "",
        ...(read?.candidates.projectNames ?? []),
        `${titleCase(siteName)} — ${titleCase(clientName)}`,
      ]),
    [read, siteName, clientName],
  );

  const managerOptions = useMemo(
    () =>
      // The person, not their job title: "Site Manager - Dean Mills" is a
      // contact record, and "Dean Mills" is who is running the job.
      unique([
        ...contacts.map((c) => personName(c.name)),
        ...(read?.candidates.people ?? []),
        "Scott Wells",
      ]),
    [contacts, read],
  );

  const numberOptions = useMemo(
    () =>
      unique([
        ...contacts.map((c) => c.phone ?? "").filter(Boolean),
        ...(read?.candidates.numbers ?? []),
        COMPANY.phone,
      ]),
    [contacts, read],
  );

  /** Anything the library disagrees with itself about, for the chosen set. */
  const problems = DISCREPANCIES.filter(
    (entry) => decision.codes.includes(entry.code) || entry.code === "every SWMS",
  );

  return (
    <div className="dialog-layer" role="dialog" aria-modal aria-label="Safe work paperwork">
      <button className="dialog-scrim" onClick={onClose} aria-label="Close" tabIndex={-1} />

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
            {step === "quote" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">The quote for this job</h3>
                  <p className="board-section-note">
                    Upload it as a PDF or the CSV the accounting software exports. The job
                    and what it involves are read out of it, and whatever it does not say
                    is asked on the next step.
                  </p>
                </div>

                <label className="rcd-drop">
                  {busy === "quote"
                    ? "Reading…"
                    : read
                      ? "Use a different quote"
                      : "Choose the quote"}
                  <input
                    type="file"
                    accept=".csv,.pdf,text/csv,application/pdf"
                    hidden
                    onChange={(event) => {
                      void readQuote(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>

                {read ? (
                  <>
                    <div className="board-section-head">
                      <h3 className="board-section-title">What it says</h3>
                    </div>
                    <dl className="rcd-facts">
                      <div>
                        <dt>Job</dt>
                        <dd>{read.jobTitle || "Not named — you can name it at the end"}</dd>
                      </div>
                      <div>
                        <dt>Answered</dt>
                        <dd>
                          {Object.keys(read.answered).length} of {asking.length} questions
                        </dd>
                      </div>
                    </dl>
                    {read.jobDescription ? (
                      <p className="issue-empty">{read.jobDescription.slice(0, 900)}</p>
                    ) : (
                      <p className="issue-empty">
                        No description found in it. The questions will carry the whole job
                        instead, which works — it just means a few more taps.
                      </p>
                    )}
                  </>
                ) : null}

                {error ? <p className="dialog-error">{error}</p> : null}

                <div className="dialog-actions">
                  <button
                    type="button"
                    className={read ? "dialog-confirm" : "dialog-cancel"}
                    onClick={() => setStep("questions")}
                  >
                    {read ? "Next" : "Skip — no quote"}
                  </button>
                </div>
              </section>
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
                  const fromTheQuote =
                    fromQuote[question.key] !== undefined &&
                    fromQuote[question.key] === answers[question.key];
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
                          {fromTheQuote ? (
                            <span className="safety-from-quote">from the quote</span>
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
                  <button type="button" className="dialog-cancel" onClick={() => setStep("quote")}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={open.length > 0}
                    onClick={() => setStep("documents")}
                  >
                    {open.length > 0
                      ? `${open.length} left`
                      : `Next — ${decision.codes.length} documents`}
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
                    return (
                      <div key={code} className="issue-pick is-on is-static">
                        <span className="issue-pick-body">
                          <span className="issue-pick-label">
                            OEC-{code} · {template.title}
                          </span>
                          <span className="issue-pick-note">{decision.reasons[code]}</span>
                        </span>
                        <button
                          type="button"
                          className="whs-drop"
                          onClick={() => setAnswers((current) => withManual(current, code, false))}
                        >
                          Take out
                        </button>
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
                      <span className="issue-pick-note">For a job the quote never named</span>
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
                  <h3 className="board-section-title">Who is running it?</h3>
                </div>
                <div className="issue-picks">
                  {managerOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`issue-pick ${manager === option ? "is-on" : ""}`}
                      onClick={() => setManager(manager === option ? "" : option)}
                    >
                      <span className="issue-pick-mark is-one" aria-hidden />
                      <span className="issue-pick-body">
                        <span className="issue-pick-label">{option}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="board-section-head">
                  <h3 className="board-section-title">And on what number?</h3>
                </div>
                <div className="issue-picks">
                  {numberOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`issue-pick ${number === option ? "is-on" : ""}`}
                      onClick={() => setNumber(number === option ? "" : option)}
                    >
                      <span className="issue-pick-mark is-one" aria-hidden />
                      <span className="issue-pick-body">
                        <span className="issue-pick-label">{option}</span>
                      </span>
                    </button>
                  ))}
                </div>

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

                <div className="issue-picks">
                  {SIGNATORIES.map((person) => {
                    const at = signed[person.key];
                    return (
                      <div
                        key={person.key}
                        className={`issue-pick is-static ${at ? "is-on" : ""}`}
                      >
                        <span className="issue-pick-body">
                          <span className="issue-pick-label">
                            {person.name} — {person.position}
                          </span>
                          <span className="issue-pick-note">
                            {at
                              ? `Confirmed ${new Date(at).toLocaleString("en-AU")}. Signature applied to every document above.`
                              : "Has not confirmed. Name and position are printed; the date and signature are left blank."}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={at ? "whs-drop" : "dialog-confirm is-small"}
                          disabled={busy !== null || !ready}
                          onClick={() => void sign(person.key, !at)}
                        >
                          {at ? "Withdraw" : `I am ${person.name.split(" ")[0]} — I have read these`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <p className="issue-empty">
                  Changing any answer withdraws both confirmations, because what was read
                  would no longer be what comes out.
                </p>

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
