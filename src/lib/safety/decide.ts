import { BY_CODE, type Template } from "@/lib/safety/catalogue";
import { hazardsFor, type Hazard } from "@/lib/safety/hazards";
import { QUESTIONS, optionFor, type Option, type Question } from "@/lib/safety/questions";

/**
 * Working out a job's paperwork from what the job is.
 *
 * The quote answers what it can, the operator answers the rest, and the
 * documents follow. Nobody picks a SWMS: every code here is the consequence of
 * something that was said about the work, and the reason is kept beside it so
 * the choice can be argued with.
 */

export type Answers = Record<string, string>;

/**
 * Documents the operator has added or thrown out by hand.
 *
 * They ride along in the answers under keys no question uses, so a hand-picked
 * list survives a reload the same way the answers do. The reason is kept: a
 * document that is here because somebody put it here should say so.
 */
const ADDED = "manual:add";
const DROPPED = "manual:drop";

export function manualCodes(answers: Answers): { added: string[]; dropped: string[] } {
  const read = (key: string) =>
    (answers[key] ?? "").split(",").map((code) => code.trim()).filter(Boolean);
  return { added: read(ADDED), dropped: read(DROPPED) };
}

/** Adds or removes one code by hand, returning the answers to save. */
export function withManual(answers: Answers, code: string, keep: boolean): Answers {
  const { added, dropped } = manualCodes(answers);
  const without = (list: string[]) => list.filter((entry) => entry !== code);
  const next = keep
    ? { added: [...without(added), code], dropped: without(dropped) }
    : { added: without(added), dropped: [...without(dropped), code] };
  return { ...answers, [ADDED]: next.added.join(","), [DROPPED]: next.dropped.join(",") };
}

/** Puts a code back under whatever the answers decide. */
export function withoutManual(answers: Answers, code: string): Answers {
  const { added, dropped } = manualCodes(answers);
  const without = (list: string[]) => list.filter((entry) => entry !== code);
  return { ...answers, [ADDED]: without(added).join(","), [DROPPED]: without(dropped).join(",") };
}

/** What the quote's own words already settle. */
export function readAnswers(text: string): Answers {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const found: Answers = {};

  for (const question of QUESTIONS) {
    let best: { value: string; weight: number } | null = null;
    for (const option of question.options) {
      for (const phrase of option.evidence ?? []) {
        if (!haystack.includes(` ${phrase} `)) continue;
        // A longer phrase is a stronger signal: "new switchboard" over "rcd".
        const weight = phrase.split(" ").length * 10 + phrase.length;
        if (!best || weight > best.weight) best = { value: option.value, weight };
      }
    }
    if (best) found[question.key] = best.value;
  }

  return found;
}

/**
 * Every question in play, given what has been answered so far.
 *
 * Most are always in play. The follow-ups are not: they appear only when two
 * answers disagree, and they disappear again when the disagreement is settled.
 */
export function asked(answers: Answers): Question[] {
  return QUESTIONS.filter((question) => !question.when || question.when(answers));
}

/** The ones still waiting for an answer. */
export function unanswered(answers: Answers): Question[] {
  return asked(answers).filter((question) => answers[question.key] === undefined);
}

/**
 * The questions still worth asking.
 *
 * One the quote has answered is left out — that is what reading it was for —
 * except the two that are always asked, because a quote never says whether the
 * site will be occupied and the nature of the job is too important to infer.
 */
export function openQuestions(answered: Answers): Question[] {
  return asked(answered).filter(
    (question) => question.always || answered[question.key] === undefined,
  );
}

export type Decision = {
  /** Every template code, SWMS then JSA then authorisations. */
  codes: string[];
  /** Why each one is there, keyed by code. */
  reasons: Record<string, string>;
  /** Extra rows for the JSA's risk table. */
  hazards: Hazard[];
  /** The job written out from the quote and the answers together. */
  description: string;
};

/**
 * What to issue, given everything that has been said about the job.
 *
 * The nature of the work brings the core SWMS and its risk assessment; every
 * other answer adds a statement on top. A job with no answered nature still
 * gets the general electrical pair, because a job with no paperwork at all is
 * not a safer outcome than a general one.
 */
export function decide(
  answers: Answers,
  quote: { title?: string | null; description?: string | null } = {},
): Decision {
  const codes: string[] = [];
  const reasons: Record<string, string> = {};
  const hazardKeys: string[] = [];
  const sentences: string[] = [];

  const add = (option: Option, question: Question) => {
    for (const code of option.requires ?? []) {
      if (!BY_CODE.has(code)) continue;
      if (!codes.includes(code)) codes.push(code);
      reasons[code] ??= `${question.question} — ${option.label}`;
    }
    hazardKeys.push(...(option.hazards ?? []));
    if (option.describes) sentences.push(option.describes);
  };

  for (const question of asked(answers)) {
    const value = answers[question.key];
    if (value === undefined) continue;
    const option = optionFor(question.key, value);
    if (option) add(option, question);
  }

  // Nothing said what kind of job it is, so it is treated as general
  // electrical work rather than issued with nothing.
  if (!codes.some((code) => BY_CODE.get(code)?.kind === "SWMS")) {
    for (const code of ["SWMS001"]) {
      if (!codes.includes(code)) codes.push(code);
      reasons[code] ??= "The default statement for general electrical work";
    }
  }

  // Every method statement travels with its own risk assessment. Heights is
  // the case that matters: a job that goes up a ladder needs SWMS007 *and*
  // JSA007 on top of whatever its main pair already is, and one without the
  // other is a statement nobody has assessed or an assessment of nothing.
  for (const code of [...codes]) {
    const pair = BY_CODE.get(code)?.pairs;
    if (!pair || !BY_CODE.has(pair) || codes.includes(pair)) continue;
    codes.push(pair);
    reasons[pair] = `The risk assessment that goes with ${code} — ${reasons[code] ?? "selected for this job"}`;
  }

  // What the operator said, last. A document taken out by hand stays out and a
  // document put in by hand stays in, and both say which they are.
  const { added, dropped } = manualCodes(answers);
  const kept = codes.filter((code) => !dropped.includes(code));
  for (const code of added) {
    if (!BY_CODE.has(code) || kept.includes(code)) continue;
    kept.push(code);
    reasons[code] = "Added by hand";
  }

  return {
    codes: sortCodes(kept),
    reasons,
    hazards: hazardsFor(hazardKeys),
    description: describe(quote, sentences),
  };
}

/**
 * The job, written out.
 *
 * The quote's own words first — they are the client's description of what was
 * agreed — then what the answers added. A quote that says "installation of
 * floodlight" and an answer that says it is going up from a scissor lift make
 * a description that neither of them was on its own, and that is the one the
 * documents are issued against.
 */
function describe(
  quote: { title?: string | null; description?: string | null },
  sentences: string[],
): string {
  const parts: string[] = [];
  const title = quote.title?.trim();
  const body = quote.description?.trim();

  if (title) parts.push(sentence(title));
  if (body && (!title || !body.toLowerCase().startsWith(title.toLowerCase()))) {
    parts.push(sentence(body));
  }
  parts.push(...sentences);

  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 3000);
}

function sentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const capped = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/** SWMS in code order, then the JSAs, then the authorisations. */
function sortCodes(codes: string[]): string[] {
  const rank = (code: string) => {
    const kind = BY_CODE.get(code)?.kind;
    return kind === "SWMS" ? 0 : kind === "JSA" ? 1 : 2;
  };
  return [...codes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function templatesFor(codes: string[]): Template[] {
  return codes.map((code) => BY_CODE.get(code)).filter(Boolean) as Template[];
}
