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
  },
  {
    key: "notTested",
    question: "Anything not tested, and why.",
    freeText: true,
  },
];

/** Every yes/no has to be answered before a report can be issued. */
export function checklistComplete(answers: Record<string, boolean | string>): boolean {
  return CHECKLIST.every((item) => item.freeText || answers[item.key] === true);
}
