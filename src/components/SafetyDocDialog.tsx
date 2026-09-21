"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATES, type DocKind, type Template } from "@/lib/safety/catalogue";
import { COMPANY } from "@/lib/company";
import { titleCase } from "@/lib/writing";
import { uploadFile } from "@/components/ImageUpload";
import { clearSession, usePersisted } from "@/lib/session";

/**
 * Getting a job's safe work paperwork out in about a minute.
 *
 * The quote already says how the job is going to be done, so it is read rather
 * than asked about: the job description comes out of it, the statements that
 * cover that description are put forward with the words that matched, and
 * everything else the documents ask for is offered as answers to tap. Nothing
 * here needs typing — the one text box is a fallback for a job the quote never
 * named.
 */

type Wanted = "SWMS" | "JSA" | "BOTH";

type Suggestion = {
  code: string;
  kind: DocKind;
  title: string;
  pairs: string | null;
  matched: string[];
};

type Read = {
  jobDescription: string;
  suggestions: Suggestion[];
  candidates: { projectNames: string[]; people: string[]; numbers: string[] };
};

type Doc = {
  id: string;
  codes: string[];
  date: string;
  projectName: string | null;
  projectManager: string | null;
  contactNumber: string | null;
  jobDescription: string | null;
  sourceFileId: string | null;
};

export type SafetyContact = { name: string; phone: string | null };

type Step = "quote" | "documents" | "details";

const STEPS: [Step, string][] = [
  ["quote", "Quote"],
  ["documents", "Documents"],
  ["details", "Details"],
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
  const [wanted, setWanted] = usePersisted<Wanted>(`${key}:wanted`, "BOTH");
  const [codes, setCodes] = usePersisted<string[]>(`${key}:codes`, []);
  const [read, setRead] = usePersisted<Read | null>(`${key}:read`, null);
  const [project, setProject] = usePersisted<string>(`${key}:project`, "");
  const [manager, setManager] = usePersisted<string>(`${key}:manager`, "");
  const [number, setNumber] = usePersisted<string>(`${key}:number`, "");
  const [typing, setTyping] = usePersisted<boolean>(`${key}:typing`, false);
  const [busy, setBusy] = useState<"quote" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // A step is a fresh question, so it starts at its own top rather than
  // wherever the last one had been scrolled to.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [step]);

  /** Whatever was answered last time this job's paperwork was opened. */
  const load = useCallback(async () => {
    const response = await fetch(`/api/safety-docs/${docId}`, { cache: "no-store" });
    if (!response.ok) return;
    const doc = (await response.json()) as Doc;
    setCodes((current) => (current.length ? current : doc.codes));
    setProject((current) => current || doc.projectName || "");
    setManager((current) => current || doc.projectManager || "");
    setNumber((current) => current || doc.contactNumber || "");

    // The quote is kept against the job, so coming back to it tomorrow reads
    // it again rather than losing the names and numbers it put forward.
    if (!doc.sourceFileId) return;
    const again = await fetch("/api/safety-docs/read-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: doc.sourceFileId }),
    });
    if (!again.ok) return;
    const result = (await again.json()) as Read;
    setRead(result);
  }, [docId, setCodes, setProject, setManager, setNumber, setRead]);

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

      // Keep the quote against the job, so a suggestion can be explained
      // months later without anyone hunting for the file.
      await fetch(`/api/safety-docs/${docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceFileId: stored.id,
          jobDescription: result.jobDescription || null,
        }),
      });

      // The strongest suggestion, and its partner where the pair exists, are
      // ticked on arrival — they are still shown and still removable.
      const best = result.suggestions[0];
      if (best && codes.length === 0) setCodes(withPartner([best.code], wanted));
      setStep("documents");
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "That quote could not be read.");
    } finally {
      setBusy(null);
    }
  }

  function toggle(code: string) {
    setCodes((current) =>
      current.includes(code)
        ? current.filter((held) => held !== code)
        : withPartner([...current, code], wanted),
    );
  }

  /** Changing what is wanted prunes anything that no longer belongs. */
  function want(next: Wanted) {
    setWanted(next);
    setCodes((current) => withPartner(current.filter((code) => allowed(code, next)), next));
  }

  const suggested = read?.suggestions ?? [];
  const suggestedCodes = new Set(suggested.map((entry) => entry.code));

  const shown = useMemo(() => {
    const rest = TEMPLATES.filter(
      (template) => allowed(template.code, wanted) && !suggestedCodes.has(template.code),
    );
    return { rest };
    // suggestedCodes is derived from read, which is in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, read]);

  const projectOptions = useMemo(
    () =>
      unique([
        ...(read?.candidates.projectNames ?? []),
        ...chosenTemplates(codes)
          .filter((template) => template.kind === "SWMS")
          .slice(0, 2)
          .map((template) => `${template.title} — ${titleCase(siteName)}`),
        `${titleCase(siteName)} — ${titleCase(clientName)}`,
      ]),
    [read, codes, siteName, clientName],
  );

  const managerOptions = useMemo(
    () =>
      unique([
        ...contacts.map((contact) => contact.name),
        ...(read?.candidates.people ?? []),
        "Scott Wells",
      ]),
    [contacts, read],
  );

  const numberOptions = useMemo(
    () =>
      unique([
        ...contacts.map((contact) => contact.phone ?? "").filter(Boolean),
        ...(read?.candidates.numbers ?? []),
        COMPANY.phone,
      ]),
    [contacts, read],
  );

  const ready = codes.length > 0 && project.trim().length > 0;

  /**
   * SWMS chosen that have no JSA written for them yet.
   *
   * Only four of the statements have their risk assessment written so far, so
   * asking for both and quietly getting one would be a lie about what is being
   * handed over.
   */
  const unpaired = useMemo(
    () =>
      wanted === "BOTH"
        ? chosenTemplates(codes).filter(
            (template) => template.kind === "SWMS" && !template.pairs,
          )
        : [],
    [codes, wanted],
  );

  async function save() {
    if (!ready) return;
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(`/api/safety-docs/${docId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          codes,
          projectName: project.trim(),
          projectManager: manager.trim(),
          contactNumber: number.trim(),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "That could not be saved.");
      }
      for (const part of ["step", "wanted", "codes", "read", "project", "manager", "number", "typing"]) {
        clearSession(`${key}:${part}`);
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
      setBusy(null);
    }
  }

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
                    The job description in it says how the work is going to be done, which
                    is what decides the paperwork. Upload it as a PDF or the CSV the
                    accounting software exports, and the statements that cover it are put
                    forward — or skip, and pick them yourself.
                  </p>
                </div>

                <label className="rcd-drop">
                  {busy === "quote" ? "Reading…" : read ? "Use a different quote" : "Choose the quote"}
                  {/* Both spellings of a CSV, because a browser asks the
                      operating system what a .csv is and gets a different
                      answer on every one of them. */}
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
                    <dl className="rcd-facts">
                      <div>
                        <dt>Job description</dt>
                        <dd>{read.jobDescription ? "Found" : "Not headed — whole quote read"}</dd>
                      </div>
                      <div>
                        <dt>Suggested</dt>
                        <dd>{read.suggestions.length || "None"}</dd>
                      </div>
                    </dl>
                    {read.jobDescription ? (
                      <p className="issue-empty">{read.jobDescription.slice(0, 600)}</p>
                    ) : null}
                  </>
                ) : null}

                <div className="dialog-actions">
                  <button type="button" className="dialog-cancel" onClick={() => setStep("documents")}>
                    {read ? "Next" : "Skip — I'll pick them"}
                  </button>
                </div>
              </section>
            ) : null}

            {step === "documents" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">What do you need?</h3>
                  <p className="board-section-note">
                    A SWMS is the method; a JSA is the risk assessment behind it. Most jobs
                    want both, and where a SWMS has a JSA written for it, picking one picks
                    the other.
                  </p>
                </div>

                <div className="issue-picks">
                  {(
                    [
                      ["BOTH", "Both", "The SWMS and its JSA"],
                      ["SWMS", "SWMS only", "Safe work method statement"],
                      ["JSA", "JSA only", "Job safety analysis"],
                    ] as [Wanted, string, string][]
                  ).map(([id, label, note]) => (
                    <button
                      key={id}
                      type="button"
                      className={`issue-pick ${wanted === id ? "is-on" : ""}`}
                      onClick={() => want(id)}
                    >
                      <span className="issue-pick-mark is-one" aria-hidden />
                      <span className="issue-pick-body">
                        <span className="issue-pick-label">{label}</span>
                        <span className="issue-pick-note">{note}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {suggested.length > 0 ? (
                  <>
                    <div className="board-section-head">
                      <h3 className="board-section-title">From the quote</h3>
                      <p className="board-section-note">
                        Put forward because of the words underneath each one. Nothing was
                        chosen for you beyond the first — read them and tick what applies.
                      </p>
                    </div>
                    <div className="issue-picks">
                      {suggested
                        .filter((entry) => allowed(entry.code, wanted))
                        .map((entry) => (
                          <Pick
                            key={entry.code}
                            code={entry.code}
                            title={entry.title}
                            note={`Matched ${entry.matched.join(", ")}`}
                            on={codes.includes(entry.code)}
                            onClick={() => toggle(entry.code)}
                          />
                        ))}
                    </div>
                  </>
                ) : null}

                <div className="board-section-head">
                  <h3 className="board-section-title">
                    {suggested.length > 0 ? "Everything else" : "The library"}
                  </h3>
                  <p className="board-section-note">
                    Every statement OptiLink has written. Add whatever else the job touches
                    — heights, hot works, asbestos, an energised testing authorisation.
                  </p>
                </div>
                <div className="issue-picks">
                  {shown.rest.map((template) => (
                    <Pick
                      key={template.code}
                      code={template.code}
                      title={template.title}
                      note={template.kind === "WHS" ? "Authorisation" : template.kind}
                      on={codes.includes(template.code)}
                      onClick={() => toggle(template.code)}
                    />
                  ))}
                </div>

                {unpaired.length > 0 ? (
                  <section className="rcd-warning">
                    <h3 className="board-section-title">No JSA for these yet</h3>
                    <p>
                      {unpaired.map((template) => template.code).join(", ")} —{" "}
                      {unpaired.length === 1 ? "its" : "their"} risk assessment has not
                      been written, so only the SWMS comes out.
                    </p>
                  </section>
                ) : null}

                <div className="dialog-actions">
                  <button type="button" className="dialog-cancel" onClick={() => setStep("quote")}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="dialog-confirm"
                    disabled={codes.length === 0}
                    onClick={() => setStep("details")}
                  >
                    Next — {codes.length} chosen
                  </button>
                </div>
              </section>
            ) : null}

            {step === "details" ? (
              <section>
                <div className="board-section-head">
                  <h3 className="board-section-title">What is the job called?</h3>
                  <p className="board-section-note">
                    This is printed at the top of every document, so it wants to read the
                    way the client would describe the job.
                  </p>
                </div>
                <div className="issue-picks">
                  {projectOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`issue-pick ${project === option ? "is-on" : ""}`}
                      onClick={() => {
                        setProject(option);
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
                      setProject("");
                    }}
                  >
                    <span className="issue-pick-mark is-one" aria-hidden />
                    <span className="issue-pick-body">
                      <span className="issue-pick-label">Something else</span>
                      <span className="issue-pick-note">
                        For a job the quote never named
                      </span>
                    </span>
                  </button>
                </div>
                {typing ? (
                  <label className="dialog-field">
                    <span className="dialog-label">Job name</span>
                    <input
                      className="dialog-input"
                      autoFocus
                      placeholder="e.g. Annual RCD testing"
                      value={project}
                      onChange={(event) => setProject(event.target.value)}
                    />
                  </label>
                ) : null}

                <div className="board-section-head">
                  <h3 className="board-section-title">Who is running it?</h3>
                  <p className="board-section-note">
                    The person the client or the principal contractor rings about this job.
                  </p>
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

                <div className="board-section-head">
                  <h3 className="board-section-title">Ready to issue</h3>
                  <p className="board-section-note">
                    {chosenTemplates(codes)
                      .map((template) => `${template.code} ${template.title}`)
                      .join(" · ") || "Nothing chosen yet"}
                  </p>
                </div>
                <p className="issue-empty">
                  Both signatures go on as they are saved, and the site address comes off
                  the site itself. Download it from the row once this is saved.
                </p>

                {error ? <p className="dialog-error">{error}</p> : null}

                <div className="dialog-actions">
                  <button type="button" className="dialog-cancel" onClick={() => setStep("documents")}>
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

            {error && step !== "details" ? <p className="dialog-error">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pick({
  code,
  title,
  note,
  on,
  onClick,
}: {
  code: string;
  title: string;
  note: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`issue-pick ${on ? "is-on" : ""}`} onClick={onClick}>
      <span className="issue-pick-mark" aria-hidden />
      <span className="issue-pick-body">
        <span className="issue-pick-label">
          {code} · {title}
        </span>
        <span className="issue-pick-note">{note}</span>
      </span>
    </button>
  );
}

/* --- which documents belong together -------------------------------------- */

/** A WHS authorisation is neither a SWMS nor a JSA, so it is always offered. */
function allowed(code: string, wanted: Wanted): boolean {
  const template = TEMPLATES.find((entry) => entry.code === code);
  if (!template) return false;
  if (template.kind === "WHS") return true;
  return wanted === "BOTH" || template.kind === wanted;
}

/**
 * A SWMS and its JSA are one piece of paperwork in two halves, so picking
 * either brings the other with it — unless only one of the two was asked for.
 */
function withPartner(codes: string[], wanted: Wanted): string[] {
  if (wanted !== "BOTH") return unique(codes);
  const out = [...codes];
  for (const code of codes) {
    const template = TEMPLATES.find((entry) => entry.code === code);
    if (template?.pairs) out.push(template.pairs);
    const owner = TEMPLATES.find((entry) => entry.pairs === code);
    if (owner) out.push(owner.code);
  }
  return unique(out);
}

function chosenTemplates(codes: string[]): Template[] {
  return TEMPLATES.filter((template) => codes.includes(template.code));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
