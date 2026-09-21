"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BY_CODE } from "@/lib/safety/catalogue";
import { COMPANY } from "@/lib/company";
import { decide, openQuestions, type Answers } from "@/lib/safety/decide";
import { QUESTIONS } from "@/lib/safety/questions";
import { titleCase } from "@/lib/writing";
import { uploadFile } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Getting a job's safe work paperwork out in about a minute.
 *
 * The quote says what the job is, so it is read rather than asked about. What
 * it does not say is asked — about the work, never about the paperwork: is any
 * of it off the ground, is a board being opened, is anything being worked on
 * live. Which SWMS and which JSA follow from the answers, and the reason for
 * each one is shown beside it.
 *
 * The answers also finish the job description. A quote that says "installation
 * of floodlight" plus an answer that says it is going up from a scissor lift
 * makes a description neither of them was on its own, and that is the one the
 * documents are issued against.
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
};

export type SafetyContact = { name: string; phone: string | null };

type Step = "quote" | "questions" | "check";

const STEPS: [Step, string][] = [
  ["quote", "Quote"],
  ["questions", "The job"],
  ["check", "Check"],
];

export function SafetyDocDialog({
  docId,
  clientName,
  siteName,
  siteLocation,
  contacts,
  onClose,
}: {
  docId: string;
  clientName: string;
  siteName: string;
  siteLocation: string | null;
  contacts: SafetyContact[];
  onClose: () => void;
}) {
  const key = `safety:${docId}`;
  const [step, setStep] = usePersisted<Step>(`${key}:step`, "quote");
  const [read, setRead] = usePersisted<Read | null>(`${key}:read`, null);
  const [answers, setAnswers] = usePersisted<Answers>(`${key}:answers`, {});
  const [title, setTitle] = usePersisted<string>(`${key}:title`, "");
  const [manager, setManager] = usePersisted<string>(`${key}:manager`, "");
  const [number, setNumber] = usePersisted<string>(`${key}:number`, "");
  const [typing, setTyping] = usePersisted<boolean>(`${key}:typing`, false);
  const [busy, setBusy] = useState<"quote" | "save" | null>(null);
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
    if (doc.answers) {
      setAnswers((current) => (Object.keys(current).length ? current : doc.answers!));
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
  }, [docId, setTitle, setManager, setNumber, setAnswers, setRead]);

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
  const asking = useMemo(
    () => openQuestions(fromQuote).map((question) => question.key),
    [read],
  );
  const decision = useMemo(
    () =>
      decide(answers, {
        title: title || read?.jobTitle,
        description: read?.jobDescription,
      }),
    [answers, title, read],
  );

  const unanswered = QUESTIONS.filter((question) => answers[question.key] === undefined);
  const ready = unanswered.length === 0 && title.trim().length > 0;

  async function save() {
    if (!ready) return;
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(`/api/safety-docs/${docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers,
          jobTitle: title.trim(),
          jobDescription: read?.jobDescription ?? null,
          workDescription: decision.description,
          projectName: title.trim(),
          projectManager: manager.trim(),
          contactNumber: number.trim(),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That could not be saved.");
      }
      for (const part of ["step", "read", "answers", "title", "manager", "number", "typing"]) {
        clearSession(`${key}:${part}`);
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
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
      unique([...contacts.map((c) => c.name), ...(read?.candidates.people ?? []), "Scott Wells"]),
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
                          {Object.keys(read.answered).length} of {QUESTIONS.length} questions
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
                    paperwork. {asking.length < QUESTIONS.length
                      ? `The quote already answered ${QUESTIONS.length - asking.length} of them — those are ticked and can be changed.`
                      : "Tap through them."}
                  </p>
                </div>

                {QUESTIONS.map((question) => {
                  const fromTheQuote =
                    fromQuote[question.key] !== undefined &&
                    fromQuote[question.key] === answers[question.key];
                  return (
                    <div key={question.key} className="safety-question">
                      <div className="board-section-head">
                        <h3 className="board-section-title">
                          {question.question}
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
                    disabled={unanswered.length > 0}
                    onClick={() => setStep("check")}
                  >
                    {unanswered.length > 0
                      ? `${unanswered.length} left`
                      : `Next — ${decision.codes.length} documents`}
                  </button>
                </div>
              </section>
            ) : null}

            {step === "check" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">What you are getting</h3>
                  <p className="board-section-note">
                    Chosen from your answers. Each one says why it is here.
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
                            {code} · {template.title}
                          </span>
                          <span className="issue-pick-note">{decision.reasons[code]}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {decision.hazards.length > 0 ? (
                  <>
                    <div className="board-section-head">
                      <h3 className="board-section-title">
                        Added to the risk assessment
                      </h3>
                      <p className="board-section-note">
                        {decision.hazards.length}{" "}
                        {decision.hazards.length === 1 ? "row" : "rows"} this job brings with
                        it, on top of the ones already written. They are marked on the
                        document — read them before you sign it.
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
                    onClick={() => setStep("questions")}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={!ready || busy !== null}
                    onClick={() => void save()}
                  >
                    {busy === "save" ? "Saving…" : "Save"}
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
