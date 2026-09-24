/**
 * What the RCD report has to explain to the person reading it.
 *
 * A client who gets a table of trip times and three colours has been handed
 * data, not a report. They need to know what the device does, what was done to
 * it, and what a verdict obliges them to do about it — written for New South
 * Wales, because that is where the work is and the obligations are local.
 *
 * Kept here rather than in the drawing code so the words can be read, argued
 * with and corrected without going anywhere near page geometry.
 */

export type Passage = { heading: string; body: string[] };

/**
 * The Standards and the legislation this report is written against.
 *
 * Named in one place and in full, because a report that says "the standard"
 * cannot be checked by the person reading it, and a report that cites the
 * wrong edition is worse than one that cites none.
 */
export const STANDARDS = {
  wiring: "AS/NZS 3000:2018 — Electrical installations (Australian/New Zealand Wiring Rules)",
  verification:
    "AS/NZS 3017:2022 — Electrical installations — Verification by inspection and testing",
  inService:
    "AS/NZS 3760:2022 — In-service safety inspection and testing of electrical equipment and RCDs",
  whs: "Work Health and Safety Regulation 2025 (NSW)",
} as const;

export const WHAT_IS_AN_RCD: Passage = {
  heading: "What a residual current device is",
  body: [
    "A Residual Current Device (RCD), commonly referred to as a safety switch, is an electrical safety device designed to reduce the risk of electric shock by detecting current flowing to earth.",
    "The RCD continuously compares the current flowing through the active conductor with the current returning through the neutral conductor. Under normal operating conditions these currents should be substantially equal. If an imbalance occurs because current is flowing to earth, the RCD detects the residual current and disconnects the protected circuit.",
    "RCDs used for additional personal protection are commonly rated at a maximum residual operating current of 30 mA. Their purpose is to provide rapid disconnection when an earth-leakage fault is detected, thereby significantly reducing the risk of serious electric shock or electrocution.",
    "An RCD does not eliminate all electrical hazards and must not be regarded as a substitute for correct installation, maintenance or safe electrical practices.",
    "An RCD provides protection against residual current or earth-leakage faults. Protection against overload and short-circuit current is normally provided by an overcurrent protective device such as a circuit breaker or fuse. A Residual Current Circuit Breaker with Overcurrent Protection (RCBO) combines residual-current protection and overcurrent protection within one device.",
  ],
};

export const IN_NEW_SOUTH_WALES: Passage = {
  heading: "What is required in New South Wales",
  body: [
    `Requirements for Residual Current Device protection within Australian electrical installations are contained in ${STANDARDS.wiring}. The specific RCD requirements applicable to a circuit depend on factors including the type of installation, circuit function, circuit rating, equipment supplied and the nature of any additions or alterations.`,
    `For workplaces in New South Wales, additional requirements are contained in the ${STANDARDS.whs}.`,
    "Section 164 requires the use of an appropriate RCD, so far as is reasonably practicable, for specified electrical equipment supplied through socket-outlets where operating conditions create an increased risk of damage or electrical hazard. Where applicable to a socket-outlet not exceeding 20 A, the RCD must have a tripping current not exceeding 30 mA.",
    "Section 165 requires a person with management or control of a workplace to take all reasonable steps to ensure that RCDs used at the workplace are tested regularly by a competent person to confirm that they are operating effectively. Records of testing, other than daily testing, are also required to be retained for the period prescribed by the Regulation.",
    `${STANDARDS.inService} provides recognised procedures and indicative intervals for the in-service inspection and testing of electrical equipment and RCDs. The appropriate test interval depends on the type of RCD, the equipment or installation involved, the operating environment and any other applicable legislative or site-specific requirements.`,
    "Where this report specifies a recommended next test date or test interval, that interval should be considered in conjunction with AS/NZS 3760:2022, applicable WHS requirements, the operating environment and the responsible person’s risk assessment.",
  ],
};

export const WHAT_WAS_DONE: Passage = {
  heading: "What was done to each device",
  body: [
    "Each RCD was tested using an RCD test instrument that applies a controlled residual test current and records the response of the device.",
    "The automated test sequence recorded results at:",
    "• 0.5 times the rated residual current (0.5 x rated residual current);",
    "• 1 times the rated residual current (1 x rated residual current); and",
    "• 5 times the rated residual current (5 x rated residual current).",
    "Where supported by the instrument, testing was performed at both 0° and 180° points of the AC waveform. Testing at both points assists in identifying differences in operating response that may occur depending on the point on the waveform at which the test current is applied.",
    "At 0.5 x rated residual current, the test confirms that the RCD remains stable and does not operate at the reduced test current.",
    "At 1 x rated residual current and 5 x rated residual current, the instrument records the operating time of the RCD for comparison with the applicable acceptance criteria for the device and test method.",
    "Where two polarity or waveform-angle results are recorded for the same test level, the slower operating time is used for assessment so that both recorded results are considered.",
    "The instrument also records touch voltage where available. Operation of the RCD’s integral test button is recorded separately as a functional site check.",
    "Testing and verification of RCD operation should be considered in conjunction with AS/NZS 3000:2018 Clause 8.3.10, AS/NZS 3017:2022 and, for in-service testing, AS/NZS 3760:2022, as applicable.",
  ],
};

/** What each verdict obliges the client to do. */
export function verdictPassages(concernPercent: number): Passage[] {
  return [
    {
      heading: "Failed",
      body: [
        "A result is classified as Failed where the RCD does not satisfy one or more of the acceptance criteria applied to the test.",
        "This may include operation at a test current at which the device is required to remain stable, failure to operate when required, or an operating time exceeding the applicable limit used for the assessment.",
        "An RCD classified as Failed should not be relied upon as providing the intended level of residual-current protection. The affected device should be taken out of service or otherwise made safe, investigated by an appropriately qualified person and replaced where required.",
        "Following replacement or corrective work, the circuit and RCD should be retested to confirm satisfactory operation in accordance with the applicable requirements of AS/NZS 3000:2018, AS/NZS 3017:2022 and/or AS/NZS 3760:2022, as applicable.",
      ],
    },
    {
      heading: "Concern",
      body: [
        `A result is classified as a Concern where the RCD satisfies the applicable pass criteria but one or more recorded operating times are at or above ${concernPercent}% of the maximum time limit adopted for this report.`,
        "“Concern” is an advisory category used within this report. It is not a separate pass/fail classification specified by AS/NZS 3000:2018, AS/NZS 3017:2022 or AS/NZS 3760:2022.",
        "A device identified as a Concern has passed the test criteria applied on the date of testing; however, the recorded result is comparatively close to the applicable assessment limit. The device should therefore be monitored at future scheduled testing and may warrant earlier investigation where operating conditions, previous test history or other observations indicate deterioration.",
        "Classification as a Concern does not, by itself, mean that the RCD has failed or requires immediate replacement.",
      ],
    },
    {
      heading: "Passed",
      body: [
        "A result is classified as Passed where the RCD satisfied all acceptance criteria applied during the test sequence.",
        "For the test sequence used in this report, this includes remaining stable during the 0.5 x rated residual current test and achieving acceptable recorded operating results at the applicable higher test currents and waveform angles.",
        "A Passed result confirms that the device satisfied the test criteria applied on the date of testing. It does not constitute a guarantee of future operation or confirm the condition of other parts of the electrical installation.",
        "The RCD remains subject to the applicable inspection, functional testing and periodic testing requirements of AS/NZS 3000:2018, AS/NZS 3760:2022, workplace procedures and any other relevant requirements.",
      ],
    },
  ];
}

/** Read out on the report so the numbers can be traced back to a machine. */
export function instrumentPassage(instrument: string | null): Passage {
  return {
    heading: "The instrument",
    body: [
      instrument
        ? `Electrical test results were obtained using the ${instrument}, the test instrument identified in this report.`
        : "Electrical test results were obtained using the test instrument identified in this report.",
      "The original instrument-generated test record is reproduced at the rear of this report and, where provided, included with the electronic report. This allows the reported test results to be traced back to the source data recorded by the instrument.",
      "Measured test values presented in the results are taken from the instrument data and are not altered to change the recorded electrical result.",
      "The instrument may also retain incomplete test records, test sequences performed without a connected device, or repeated test records. Where such records are excluded from the assessed results, they are identified separately under “Corrections Applied” to maintain traceability and transparency.",
      "The original instrument-generated record remains unchanged and is retained as the source test record.",
    ],
  };
}

/**
 * What this report does and does not cover.
 *
 * Technical and factual: the limits of the work actually performed, not a
 * blanket exclusion of liability. A limitation a client cannot act on is not
 * a limitation, it is a disclaimer.
 */
export const LIMITATIONS: string[] = [
  "This report relates only to the RCDs and associated checks specifically identified as having been tested or inspected during this visit. It is not a comprehensive assessment of the entire electrical installation unless expressly stated otherwise.",
  "Test results represent the condition and operation of the devices at the time of testing. A satisfactory result confirms compliance with the test criteria applied on that date but does not guarantee future operation or service life.",
  "The testing does not provide a warranty as to the condition, suitability or performance of wiring, electrical equipment or circuits that were outside the stated scope of the inspection and testing.",
  "Any visual inspection was limited to components and areas that were accessible at the time of attendance. Concealed wiring, inaccessible equipment and components that could not be safely accessed were not visually assessed unless specifically stated.",
  "Test results may be influenced by the configuration and condition of the installation, connected loads, standing leakage current and other site conditions existing at the time of testing.",
  "This report should be read together with the recorded test results, site checks, stated corrections and the original instrument data.",
  `Testing has been carried out and reported with reference to the applicable requirements and guidance of AS/NZS 3000:2018, AS/NZS 3017:2022, AS/NZS 3760:2022 and the ${STANDARDS.whs}, as applicable to the scope of work performed.`,
  "This report records the results of the inspection and testing performed. It does not remove the responsibility of the person with management or control of the workplace to maintain electrical safety, arrange appropriate ongoing testing and respond to identified defects or changes in operating conditions.",
];

/**
 * How the instrument's own record is reconciled with the assessed results.
 *
 * The instrument keeps everything it was asked to do, including the sequences
 * that never reached a device. Saying which records were set aside, and why,
 * is what lets a reader check the assessed results against the raw ones.
 */
export const CORRECTIONS_NOTE: string[] = [
  "The test instrument may retain all initiated test sequences, including incomplete records, tests performed without a connected RCD and repeat tests.",
  "Before the final results were compiled, the instrument data was reviewed to identify records that did not represent a completed device test or that duplicated a subsequent valid test.",
  "Any records excluded from the assessed results are identified below. The original instrument data has not been altered; excluded records remain traceable within the source instrument report.",
];

export const NOT_TESTED_NOTE =
  "Device or circuit positions shown as “not tested” were not included in the assessed RCD test results for this report. Their appearance in this section identifies their status only and must not be interpreted as either a pass or a failure.";

/**
 * The criteria a general 30 mA RCD is assessed against.
 *
 * Written for a general 30 mA device specifically, because that is what these
 * boards carry and because the limits differ for 10 mA, 100 mA, 300 mA and
 * selective devices. The report does not present this table for anything else.
 */
export const THIRTY_MA_CRITERIA: [string, string, string][] = [
  ["0.5 x rated (15 mA)", "Must not trip", "Non-trip / sensitivity check"],
  ["1 x rated (30 mA)", "300 ms maximum", "Rated residual-current trip test"],
  ["5 x rated (150 mA)", "40 ms maximum", "High residual-current trip test"],
];

export const CRITERIA_NOTE: string[] = [
  "For a general 30 mA RCD, the automatic test sequence assesses the device at 0.5, 1 and 5 times its rated residual operating current.",
  "At 0.5 x rated residual current, the RCD is expected to remain closed and must not operate during the test.",
  "At 1 x rated residual current, the RCD is tested at its rated residual operating current. A general 30 mA RCD is assessed against a maximum operating time of 300 ms.",
  "At 5 x rated residual current, the RCD is subjected to a higher residual test current to confirm rapid operation. A maximum operating time of 40 ms is applied for this test.",
  "Where the instrument performs tests at both 0° and 180° of the AC waveform, both results are retained and the slower operating time is used when assessing compliance with the applicable operating-time limit.",
];

export const CRITERIA_STANDARDS_NOTE =
  "Assessment is made with reference to the applicable requirements of AS/NZS 3000:2018, AS/NZS 3760:2022 and the relevant RCD product requirements, as applicable to the device and test performed.";
