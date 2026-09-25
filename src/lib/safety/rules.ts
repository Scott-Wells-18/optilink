import { BY_CODE } from "@/lib/safety/catalogue";
import { QUESTIONS } from "@/lib/safety/questions";

/**
 * The rules, written out.
 *
 * Nothing here is a second copy of the logic — it is read off the questions
 * themselves, so what this shows is exactly what the app does. If a rule looks
 * wrong on the screen, it is wrong in the app, which is the point of showing
 * it at all.
 */

export type Rule = {
  question: string;
  /** Asked only when the answers so far call for it. */
  followUp: boolean;
  answers: { label: string; note?: string; gives: string[] }[];
};

export function rules(): Rule[] {
  return QUESTIONS.filter((question) =>
    question.options.some((option) => (option.requires ?? []).length > 0),
  ).map((question) => ({
    question: question.question,
    followUp: Boolean(question.when),
    answers: question.options.map((option) => ({
      label: option.label,
      note: option.note,
      gives: (option.requires ?? []).filter((code) => BY_CODE.has(code)),
    })),
  }));
}

/**
 * The two rules that are not an answer to any one question.
 */
export const STANDING_RULES = [
  "Every method statement is issued with the risk assessment written for it. Answering that part of the work happens at height brings OEC-SWMS007 and OEC-JSA007 together, on top of whichever pair the job already had.",
  "A job whose answers bring no method statement at all is issued OEC-SWMS001 and OEC-JSA001, general electrical equipment and cabling, rather than issued with nothing.",
  "Where two answers cannot both be true — testing that needs the supply on, on a job that said nothing is live — neither is overruled. A follow-up question is asked and it decides.",
  "OEC-WHS002 is never brought in by the kind of testing alone. It is brought in by an escutcheon, a cover or a barrier coming off, or by a person otherwise being near an exposed energised part.",
];
