/**
 * The checks the instrument cannot record for itself.
 *
 * AS/NZS 3000 Clause 8 requires the device's own test button to be operated as
 * well as an instrument test, and no meter can know whether a circuit was left
 * out because nobody could reach it. So these are asked once, before the
 * report is issued, and printed on it.
 */

export type ChecklistItem = {
  key: string;
  question: string;
  /**
   * How the same question is put where only particular circuit breakers were
   * tested. Asking whether every RCD on the board was tested, on a test that
   * never set out to cover the board, is a question with no honest answer.
   */
  picked?: string;
  /** A note rather than a yes/no. */
  freeText?: boolean;
};

export const CHECKLIST: ChecklistItem[] = [
  {
    key: "buttons",
    question:
      "Each RCD's own test button was operated and the device tripped (AS/NZS 3000 Clause 8).",
  },
  {
    key: "restored",
    question: "All circuits were restored and confirmed live on completion.",
  },
  {
    key: "allTested",
    question: "Every accessible RCD on this board was tested.",
    picked: "Every circuit breaker selected for this test was tested.",
  },
  {
    key: "notTested",
    question: "Anything not tested, and why.",
    freeText: true,
  },
];

/**
 * The checks, worded for the test that was actually carried out.
 *
 * The keys do not change, so an answer given before the scope was settled
 * still stands against the question it answered.
 */
export function checklistFor(wholeBoard: boolean): ChecklistItem[] {
  if (wholeBoard) return CHECKLIST;
  return CHECKLIST.map((item) =>
    item.picked ? { ...item, question: item.picked } : item,
  );
}

/** Every yes/no has to be answered before a report can be issued. */
export function checklistComplete(answers: Record<string, boolean | string>): boolean {
  return CHECKLIST.every((item) => item.freeText || answers[item.key] === true);
}
