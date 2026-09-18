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

export const WHAT_IS_AN_RCD: Passage = {
  heading: "What a residual current device is",
  body: [
    "A residual current device — a safety switch — watches the current flowing out along the active conductor and the current coming back along the neutral. In a healthy circuit the two are the same. If some of the current is finding its way to earth instead of returning — through damp insulation, through a damaged appliance, through a person — the two no longer balance, and the device opens the circuit.",
    "A 30 mA device opens on an imbalance of about thirty thousandths of an amp, within a few hundredths of a second. That is chosen to be fast enough that a shock through a healthy adult is unlikely to stop the heart. It is not a guarantee of safety; it is a very large reduction in the chance of an electrocution.",
    "An RCD does not protect against overload or a short circuit. That is the circuit breaker's job, and it is a different mechanism entirely — which is why a board can be full of breakers and still have no safety switching at all. A combined device (an RCBO) does both jobs in one module.",
  ],
};

export const IN_NEW_SOUTH_WALES: Passage = {
  heading: "What is required in New South Wales",
  body: [
    "RCD protection in a fixed installation is required by AS/NZS 3000, the Wiring Rules, which is the standard called up for electrical installation work in New South Wales. Which circuits must be protected, and at what rating, depends on when the installation was wired and what has been altered since.",
    "At a workplace the duty is additional and sits with the person conducting the business. Clause 165 of the Work Health and Safety Regulation 2017 (NSW) requires residual current devices for specified plug-in electrical equipment, requires that those devices be tested by a competent person, and requires that a record of the testing be kept. This report is that record.",
    "Testing intervals are normally taken from AS/NZS 3760, which sets a shorter interval for the push-button check than for the instrument test, and shorter intervals again for hostile environments such as construction and demolition sites. The interval that applies to a given site should be agreed in writing; unless something else has been agreed, this report is issued on a twelve-month cycle.",
  ],
};

export const WHAT_WAS_DONE: Passage = {
  heading: "What was done to each device",
  body: [
    "Each device was tested with an instrument that injects a known residual current between active and earth and times how long the device takes to open. Every test was taken twice, at 0° and at 180°, because a device can behave differently depending on where in the alternating cycle the fault appears. Where the two disagree, the slower of the two is the one reported: the device has to pass on both.",
    "At half its rated residual current the device must NOT operate. A device that trips here is over-sensitive, and will drop circuits for no reason — a nuisance that ends with someone wedging the switch or leaving it off.",
    "At its rated residual current, and again at five times rated, the device must operate within the maximum disconnection time the standard allows for its type. Five times rated stands for a heavy fault, and the device is required to clear it far faster.",
    "Touch voltage is recorded alongside: the voltage that would appear on exposed metalwork while the fault is being cleared. The push-button check, which tests the mechanism rather than its timing, is recorded separately under Site Checks.",
  ],
};

/** What each verdict obliges the client to do. */
export function verdictPassages(concernPercent: number): Passage[] {
  return [
    {
      heading: "Failed",
      body: [
        "The device did not do what the standard requires of it. Either it operated at half its rated residual current when it should have held, or it took longer than the maximum disconnection time at rated or at five times rated current.",
        "A failed device is not providing the protection it was fitted to provide, and the circuits behind it should be treated as unprotected until it is replaced. Replacement is the remedy, not adjustment: an RCD is a sealed assembly and its operating time cannot be brought back within specification. Any device listed as failed should be replaced and retested.",
      ],
    },
    {
      heading: "Concern",
      body: [
        `The device passed every test, but at least one of its readings sits at or above ${concernPercent}% of the time it is allowed. It meets the standard today.`,
        "Operating times drift upward as a device ages and its mechanism stiffens, so a device this close to its limit is the one most likely to fail at the next test. Nothing has to be done now. It should be expected to need replacing, and budgeted for, rather than come as a surprise.",
      ],
    },
    {
      heading: "Passed",
      body: [
        "The device held without operating at half its rated residual current, and opened within the time allowed at both rated and five times rated current, on both polarities, with margin in hand.",
        "It is providing the protection it was fitted to provide, and needs nothing beyond the ordinary push-button check between tests.",
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
        ? `Readings were taken on a ${instrument} tester. Its own export, exactly as it came off the machine, is reproduced at the back of this report and is also attached to this PDF as a file, so any reading printed here can be traced back to the instrument that took it.`
        : "The instrument's own export, exactly as it came off the machine, is reproduced at the back of this report and is also attached to this PDF as a file, so any reading printed here can be traced back to the instrument that took it.",
      "Nothing in the results has been rounded, adjusted or re-typed. Records the instrument took without a device connected, and records left behind where a device was tested more than once, are set aside before the results are drawn up; what was set aside is listed under Corrections Applied.",
    ],
  };
}
