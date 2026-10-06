/**
 * BFT boom barriers and sliding gate operators.
 *
 * A starting list, not a catalogue of everything BFT has ever made. It was put
 * together from BFT product literature and supplier listings reachable from
 * here; the manufacturer's own PDFs and BFT Australia's site were not, so
 * every entry carries what could actually be checked and what could not.
 *
 * `verified` says whether the model was found on an AUSTRALIAN supplier's
 * listing. "au" means it was; "overseas" means the model is real but every
 * source found for it was UK, European or US, so whether this exact variant is
 * sold or supported here is unconfirmed. Nothing in the list is marked
 * verified on the strength of a model number looking plausible.
 *
 * Whatever is on the gate in front of you wins. Every list here ends with
 * "Other — enter manually", because a twenty-year-old barrier with a faded
 * plate is a real thing to service and refusing to write it down is not an
 * option.
 */

export type GateType = "BOOM" | "SLIDING";

export const GATE_TYPE_LABELS: Record<GateType, string> = {
  BOOM: "Boom barrier",
  SLIDING: "Sliding gate",
};

/** Whether the model was found on an Australian supplier's listing. */
export type Checked = "au" | "overseas";

export type GateModel = {
  /** Exactly as the maker writes it. */
  name: string;
  type: GateType;
  /** Supply voltage as published, where it was stated. */
  supply: string | null;
  /** Arm length for a barrier, gate weight for an operator. */
  capacity: string | null;
  checked: Checked;
  /** Where it was found, or the manual it is covered by. */
  reference: string;
  /** The control board, only where a source actually named one. */
  board?: string;
};

/** The value the pickers use for anything not on the list. */
export const OTHER_MODEL = "__other__";

/**
 * The boom barriers.
 *
 * GIOTTO is first because it is the one on the report this section was built
 * from, and the only one whose manual reference came with the job.
 */
export const BOOM_MODELS: GateModel[] = [
  {
    name: "GIOTTO BT A ULTRA 36",
    type: "BOOM",
    supply: "24 V",
    capacity: "3 m to 6 m arm",
    checked: "overseas",
    reference:
      "BFT GIOTTO BT A ULTRA 36 installation and user manual D814017 2FA00_02, 26 April 2021, covering the XL configuration.",
  },
  {
    name: "GIOTTO BT A ULTRA 36 XL",
    type: "BOOM",
    supply: "24 V",
    capacity: "6 m arm",
    checked: "overseas",
    reference:
      "BFT GIOTTO BT A ULTRA 36 installation and user manual D814017 2FA00_02, 26 April 2021, XL configuration.",
  },
  {
    name: "GIOTTO BT B ULTRA 36",
    type: "BOOM",
    supply: "24 V",
    capacity: "3 m to 6 m arm",
    checked: "overseas",
    reference: "BFT GIOTTO BT B ULTRA 36 barrier kit listings; same 36 series as the BT A.",
  },
  {
    name: "MICHELANGELO BT A60",
    type: "BOOM",
    supply: "24 V",
    capacity: "clear opening to 6 m",
    checked: "overseas",
    reference: "BFT MICHELANGELO BT A product literature.",
    board: "Merak BM",
  },
  {
    name: "MICHELANGELO BT A80",
    type: "BOOM",
    supply: "24 V",
    capacity: "clear opening to 8 m",
    checked: "overseas",
    reference: "BFT MICHELANGELO BT A product literature.",
    board: "Merak BM",
  },
  {
    name: "MOOVI 30",
    type: "BOOM",
    supply: "24 V",
    capacity: "3.3 m mast, 3 m useful span",
    checked: "overseas",
    reference: "BFT MOOVI 30 supplier listings; semi-intensive, 4.0 s opening.",
  },
  {
    name: "MOOVI 60",
    type: "BOOM",
    supply: "24 V",
    capacity: "5.3 m mast, 5 m useful span",
    checked: "overseas",
    reference: "BFT MOOVI 60 supplier listings; semi-intensive, 8.0 s opening.",
  },
  {
    name: "MAXIMA ULTRA 35",
    type: "BOOM",
    supply: "230 V, three-phase motor with inverter",
    capacity: "1.7 m to 5 m clear opening",
    checked: "overseas",
    reference: "BFT MAXIMA ULTRA 35 product literature; intensive use.",
  },
  {
    name: "MAXIMA ULTRA 36",
    type: "BOOM",
    supply: "230 V, three-phase motor with inverter",
    capacity: "to about 6 m clear opening",
    checked: "overseas",
    reference: "BFT MAXIMA ULTRA 36 product literature. Capacity not confirmed from a primary source.",
  },
  {
    name: "MAXIMA ULTRA 68",
    type: "BOOM",
    supply: "230 V, three-phase motor with inverter",
    capacity: "4 m to 8 m clear opening",
    checked: "overseas",
    reference: "BFT MAXIMA ULTRA 68 product literature; up to 30,000 cycles a day.",
  },
];

/**
 * The sliding gate operators.
 *
 * These fared better: an Australian supplier lists most of them, so the
 * Australian column on this half is worth something.
 */
export const SLIDING_MODELS: GateModel[] = [
  {
    name: "DEIMOS BT A400",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 400 kg, 12 m/min",
    checked: "au",
    reference: "Listed by an Australian BFT supplier.",
  },
  {
    name: "DEIMOS BT A600",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 600 kg, 12 m/min",
    checked: "overseas",
    reference: "BFT DEIMOS BT A product literature.",
  },
  {
    name: "DEIMOS ULTRA BT A400",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 400 kg",
    checked: "au",
    reference: "Listed by an Australian BFT supplier.",
  },
  {
    name: "DEIMOS ULTRA BT A600",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 600 kg, 12 m/min",
    checked: "au",
    reference: "Listed by Australian BFT suppliers; D-Track obstacle detection.",
  },
  {
    name: "DEIMOS AC A600",
    type: "SLIDING",
    supply: "230 V",
    capacity: "leaf to 600 kg",
    checked: "overseas",
    reference: "BFT DEIMOS AC kit listings.",
  },
  {
    name: "ARES BT A1000",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 1000 kg, 9 m/min",
    checked: "au",
    reference: "Listed by an Australian BFT supplier.",
  },
  {
    name: "ARES ULTRA BT A500",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 500 kg, 12 m/min",
    checked: "overseas",
    reference: "BFT ARES ULTRA BT product literature.",
  },
  {
    name: "ARES ULTRA BT A1000",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 1000 kg, 9 m/min",
    checked: "au",
    reference: "Listed by an Australian BFT supplier.",
  },
  {
    name: "ARES ULTRA BT A1500",
    type: "SLIDING",
    supply: "24 V",
    capacity: "leaf to 1500 kg",
    checked: "overseas",
    reference: "BFT ARES range literature. Capacity not confirmed from a primary source.",
  },
  {
    name: "ICARO SMART AC A2000",
    type: "SLIDING",
    supply: "230 V",
    capacity: "leaf to 2000 kg",
    checked: "overseas",
    reference: "BFT ICARO SMART product literature.",
  },
  {
    name: "ICARO ULTRA AC A2000",
    type: "SLIDING",
    supply: "230 V",
    capacity: "leaf to 2000 kg",
    checked: "au",
    reference: "Listed by an Australian BFT supplier; very intensive use.",
  },
  {
    name: "ICARO VELOCE SMART AC A2000",
    type: "SLIDING",
    supply: "230 V",
    capacity: "leaf to 2000 kg",
    checked: "au",
    reference: "Listed by an Australian BFT supplier.",
  },
];

export const ALL_MODELS: GateModel[] = [...BOOM_MODELS, ...SLIDING_MODELS];

export function modelsFor(type: GateType): GateModel[] {
  return type === "BOOM" ? BOOM_MODELS : SLIDING_MODELS;
}

export function findModel(name: string | null | undefined): GateModel | null {
  if (!name) return null;
  const key = name.trim().toLocaleLowerCase();
  return ALL_MODELS.find((model) => model.name.toLocaleLowerCase() === key) ?? null;
}

/** "24 V · 3 m to 6 m arm" — what to show beside a name in a picker. */
export function describeModel(model: GateModel): string {
  return [model.supply, model.capacity].filter(Boolean).join("  ·  ");
}

/**
 * What the report says about where a model came from.
 *
 * Printed under the asset details, because a service report that silently
 * implies the manual it quotes applies to the unit in front of you is worse
 * than one that says it was not confirmed.
 */
export function provenanceOf(model: GateModel): string {
  const head =
    model.checked === "au"
      ? "Listed by an Australian BFT supplier."
      : "Model details taken from overseas BFT literature; Australian availability and support for this exact variant were not confirmed.";
  return `${head} ${model.reference}`;
}

/**
 * The arm lengths offered for a boom gate.
 *
 * Half-metre steps across the range BFT's own barriers cover, because that is
 * how booms are sold and how a technician thinks about them. Anything else
 * goes in as a number.
 */
export const ARM_LENGTHS: number[] = [
  2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
];
