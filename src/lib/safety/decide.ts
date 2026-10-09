import { BY_CODE, type Template } from "@/lib/safety/catalogue";
import { hazardsFor, type Hazard } from "@/lib/safety/hazards";
import {
  PRESET_BY_ID,
  activityIds,
  compose,
  normalise,
  type Composition,
  type MethodKey,
  type Selection,
} from "@/lib/safety/presets";
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

/**
 * The preset selection, riding along the same way.
 *
 * It lives in the answers rather than in a parameter so that everything which
 * already reloads, re-decides and re-renders from the answers keeps working
 * untouched — the dialog's live `decide`, the API's, and the builder's are one
 * code path, and a selection made on site survives a reload exactly as the
 * answers do.
 */
const PRESET_MAIN = "preset:main";
const PRESET_ALSO = "preset:also";
const PRESET_METHODS = "preset:methods";
const PRESET_MODS = "preset:mods";
/** Follow-up answers, as `id=value;id=value`. */
const PRESET_FOLLOW = "preset:follow";
/** Every nature the selected activities stand for, so follow-ups see them all. */
export const PRESET_NATURES = "preset:natures";
/** "1" while a selected activity, or a follow-up, needs the supply on. */
export const PRESET_LIVE = "preset:live";
/** The question keys the selection is currently answering for the operator. */
const PRESET_DERIVED = "preset:derived";

const list = (answers: Answers, key: string): string[] =>
  (answers[key] ?? "").split(",").map((value) => value.trim()).filter(Boolean);

/** The current selection, as `compose` wants it. Empty when none was made. */
export function selectionOf(answers: Answers): Selection | null {
  const presetId = (answers[PRESET_MAIN] ?? "").trim();
  if (!presetId || !PRESET_BY_ID.has(presetId)) return null;
  const follow: Record<string, string> = {};
  for (const pair of (answers[PRESET_FOLLOW] ?? "").split(";")) {
    const [id, value] = pair.split("=").map((part) => part?.trim());
    if (id && value) follow[id] = value;
  }
  return normalise({
    presetId,
    alsoIds: list(answers, PRESET_ALSO),
    methods: list(answers, PRESET_METHODS).filter(
      (method): method is MethodKey => method === "RCD" || method === "THERMAL" || method === "MEASURE",
    ),
    modifierIds: list(answers, PRESET_MODS),
    answers: follow,
  });
}

/**
 * The Questions-step answers the selected activities already give.
 *
 * Each of these is a question the job step has just been asked in other
 * words — is there thermal imaging, is anything tested live, is the site
 * occupied, is any of it at height — so it is answered here and not shown
 * again. A key left out is still asked.
 */
function derivedAnswers(selection: Selection): Answers {
  const chosen = activityIds(selection).map((id) => PRESET_BY_ID.get(id)!);
  const composition = compose(selection);
  const methods = composition.methods;
  const mods = selection.modifierIds ?? [];
  const out: Answers = {};

  out.thermal = methods.includes("THERMAL") ? "YES" : "NO";
  if (methods.length > 0) out.energised = "YES";
  // Nothing electrical selected at all: there is nothing to be live.
  else if (chosen.every((preset) => preset.group === "OTHER")) {
    out.energised = "NO";
    out.testing = "NO";
  }
  if (chosen.some((preset) => preset.id === "THERMAL_OPEN")) out.exposed = "OPEN";
  out.site = mods.includes("OCCUPIED") ? "YES" : "NO";
  if (!mods.includes("HEIGHT")) out.heights = "NONE";
  return out;
}

/** Choosing a preset, which also settles the questions the preset answers. */
export function withPreset(answers: Answers, input: Selection | null): Answers {
  const next = { ...answers };
  const before = list(answers, PRESET_DERIVED);
  for (const key of before) delete next[key];
  if (!input) {
    for (const key of [
      PRESET_MAIN, PRESET_ALSO, PRESET_METHODS, PRESET_MODS, PRESET_FOLLOW,
      PRESET_NATURES, PRESET_LIVE, PRESET_DERIVED,
    ]) {
      delete next[key];
    }
    return next;
  }

  const selection = normalise(input);
  const chosen = activityIds(selection).map((id) => PRESET_BY_ID.get(id)!);
  next[PRESET_MAIN] = selection.presetId;
  next[PRESET_ALSO] = (selection.alsoIds ?? []).join(",");
  next[PRESET_METHODS] = (selection.methods ?? []).join(",");
  next[PRESET_MODS] = (selection.modifierIds ?? []).join(",");
  next[PRESET_FOLLOW] = Object.entries(selection.answers ?? {})
    .map(([id, value]) => `${id}=${value}`)
    .join(";");

  // The activities say what kind of job it is, so "What is the job?" is
  // answered rather than asked again in different words. The first activity's
  // nature stands as the main one; all of them are kept for the follow-ups.
  const natures = [...new Set(chosen.map((preset) => preset.nature).filter(Boolean))] as string[];
  next[PRESET_NATURES] = natures.join(",");
  if (natures[0]) next.nature = natures[0];
  else delete next.nature;

  const derived = derivedAnswers(selection);
  Object.assign(next, derived);
  next[PRESET_DERIVED] = Object.keys(derived).join(",");
  next[PRESET_LIVE] = compose(selection).methods.length > 0 ? "1" : "";

  // RCD testing is chosen on the job step, so the testing question only asks
  // about test-and-tag or commissioning. An earlier answer is kept, moved to
  // whichever of its options still means the same thing.
  const rcd = compose(selection).methods.includes("RCD");
  if (!derived.testing) {
    const testing = next.testing;
    if (rcd && testing === "NO") next.testing = "RCD";
    else if (rcd && testing === "TAG") next.testing = "BOTH";
    else if (!rcd && testing === "RCD") next.testing = "NO";
    else if (!rcd && testing === "BOTH") next.testing = "TAG";
  }
  return next;
}

/**
 * The answer options still worth offering for a question.
 *
 * Only the testing question changes: with a job step selection, whether there
 * is RCD testing is already said, so its options are cut to the ones that
 * agree with it and asked as a question about test-and-tag alone.
 */
export function optionsFor(question: Question, answers: Answers): Option[] {
  // With the job step's "at height" ticked, the only thing left to ask is how.
  if (question.key === "heights" && selectionOf(answers)) {
    return question.options.filter((option) => option.value !== "NONE");
  }
  const selection = selectionOf(answers);
  if (question.key !== "testing" || !selection) return question.options;
  const rcd = compose(selection).methods.includes("RCD");
  const labels: Record<string, string> = rcd
    ? { RCD: "No — only the RCD testing chosen on the job", BOTH: "Yes — test and tag or commissioning as well" }
    : { NO: "No", TAG: "Yes — test and tag, or commissioning" };
  return question.options
    .filter((option) => option.value in labels)
    .map((option) => ({ ...option, label: labels[option.value] }));
}

/** The wording of a question as shown, given the job step. */
export function questionText(question: Question, answers: Answers): string {
  if (!selectionOf(answers)) return question.question;
  if (question.key === "testing") return "Any test and tag, or commissioning?";
  if (question.key === "heights") return "How is the height reached?";
  return question.question;
}

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

/**
 * The questions put on screen.
 *
 * Every question in play, less the ones the job step has answered: what the
 * job is, and anything `withPreset` derived from the activities. Those answers
 * still count in `decide` — they are simply not asked twice.
 */
export function shown(answers: Answers): Question[] {
  if (!selectionOf(answers)) return asked(answers);
  const derived = list(answers, PRESET_DERIVED);
  return asked(answers).filter(
    (question) => question.key !== "nature" && !derived.includes(question.key),
  );
}

/** The ones still waiting for an answer. */
export function unanswered(answers: Answers): Question[] {
  return shown(answers).filter((question) => answers[question.key] === undefined);
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
  /** The preset wording, where a preset was chosen. */
  composition: Composition | null;
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

  /*
   * What the preset brings.
   *
   * It is folded in here rather than at the end so a statement the preset
   * calls for is paired with its risk assessment by the pairing loop below,
   * and so the operator can still take it out by hand afterwards — a preset
   * is a starting point, not a thing that overrules a person.
   */
  const selection = selectionOf(answers);
  const composition = selection ? compose(selection) : null;
  if (selection && composition) {
    /*
     * The preset's own nature, applied here rather than trusted to be in the
     * answers.
     *
     * `withPreset` writes `nature` when somebody picks a preset in the app,
     * and the loop above would then pick it up. But a decision must be total
     * over what it is handed: a selection arriving from the API, from a saved
     * custom preset or from a test has a main job on it and must produce that
     * job's statement whether or not anything mirrored it into `nature`.
     * Applying it twice is harmless — `add` is idempotent on the codes and
     * the sentences are deduplicated below.
     */
    for (const preset of activityIds(selection).map((id) => PRESET_BY_ID.get(id))) {
      if (!preset?.nature) continue;
      const option = optionFor("nature", preset.nature);
      if (option) add(option, { key: "nature", question: "What is the job?", options: [] });
    }

    for (const code of composition.codes) {
      if (!BY_CODE.has(code) || codes.includes(code)) continue;
      codes.push(code);
      reasons[code] = composition.why[code] ?? "The job";
    }
    hazardKeys.push(...composition.hazards);
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
    /*
     * The preset's wording leads, in the order it was read.
     *
     * All of it, not just the scope: this is what fills the scope panel the
     * statements leave blank, and that panel is where a reader looks for how
     * the job is done as well as what it is. What the answers added follows
     * it. It is composed, so a method that is no longer selected is simply
     * not here.
     */
    description: describe(quote, [
      ...(composition ? composition.blocks.map((block) => block.text) : []),
      ...sentences,
    ]),
    composition,
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
  // Deduplicated, because a preset's nature can be added from two directions
  // — the answered question and the preset itself — and the description
  // should not say the same thing twice for it.
  parts.push(...sentences.filter((text) => text.trim()));

  return [...new Set(parts)].join(" ").replace(/\s+/g, " ").trim().slice(0, 3000);
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
