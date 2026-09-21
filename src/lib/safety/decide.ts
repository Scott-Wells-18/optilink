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
 * The questions still worth asking.
 *
 * One the quote has answered is left out — that is what reading it was for —
 * except the two that are always asked, because a quote never says whether the
 * site will be occupied and the nature of the job is too important to infer.
 */
export function openQuestions(answered: Answers): Question[] {
  return QUESTIONS.filter(
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

  for (const question of QUESTIONS) {
    const value = answers[question.key];
    if (value === undefined) continue;
    const option = optionFor(question.key, value);
    if (option) add(option, question);
  }

  // Nothing said what kind of job it is, so it is treated as general
  // electrical work rather than issued with nothing.
  if (!codes.some((code) => BY_CODE.get(code)?.kind === "JSA")) {
    for (const code of ["SWMS001", "JSA001"]) {
      if (!codes.includes(code)) codes.push(code);
      reasons[code] ??= "The default risk assessment for general electrical work";
    }
  }

  return {
    codes: sortCodes(codes),
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
