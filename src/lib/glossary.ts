/**
 * Plain-English glossary. Only the terms actually used in a report are
 * printed, so the client is not handed four pages of definitions they do not
 * need.
 */

export type GlossaryEntry = {
  term: string;
  definition: string;
  /** Words that, if they appear in the report, mean this entry is relevant. */
  triggers: string[];
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "RCD (safety switch)",
    definition:
      "A Residual Current Device, usually called a safety switch. It constantly compares the electricity flowing out to the electricity coming back. If some is escaping — for example through a person — it cuts the power in a fraction of a second.",
    triggers: ["rcd", "safety switch", "rcbo"],
  },
  {
    term: "RCBO",
    definition:
      "A single device that combines a safety switch (RCD) and a circuit breaker, so it protects against both electric shock and overload on the one circuit.",
    triggers: ["rcbo"],
  },
  {
    term: "Trip time",
    definition:
      "How long a safety switch takes to cut the power once it detects a fault, measured in milliseconds (thousandths of a second). AS/NZS 3017 sets the maximum times a device is allowed to take.",
    triggers: ["trip time", "rcd", "ms", "disconnection"],
  },
  {
    term: "I∆n (rated residual current)",
    definition:
      "The amount of escaping current a safety switch is designed to react to. A typical household safety switch is 30 mA — thirty thousandths of an amp.",
    triggers: ["i∆n", "rcd", "ma", "residual"],
  },
  {
    term: "Ramp test",
    definition:
      "A test that slowly increases the leakage current until the safety switch lets go, showing the exact point at which it operates. It should release somewhere between half and all of its rated current.",
    triggers: ["ramp"],
  },
  {
    term: "Thermographic (infrared) survey",
    definition:
      "A survey carried out with a thermal imaging camera while the installation is running under normal load. Electrical faults almost always produce heat before they produce a failure, so the camera finds problems long before anything visibly goes wrong.",
    triggers: ["thermal", "thermograph", "infrared", "hot spot"],
  },
  {
    term: "ΔT (delta T / temperature rise)",
    definition:
      "The difference in temperature between a hot spot and its reference — either an identical component doing the same job beside it, or the surrounding air. The bigger the difference, the more serious the fault.",
    triggers: ["δt", "delta", "thermal", "temperature rise"],
  },
  {
    term: "Emissivity",
    definition:
      "A setting on the thermal camera that accounts for how well a particular surface radiates heat. Setting it correctly is what makes the temperature readings accurate.",
    triggers: ["emissivity"],
  },
  {
    term: "Switchboard",
    definition:
      "The panel that receives the incoming supply and splits it into the individual circuits around the property, housing the main switch, circuit breakers and safety switches.",
    triggers: ["switchboard", "board", "distribution board"],
  },
  {
    term: "Circuit breaker",
    definition:
      "A protective switch that automatically cuts a circuit if it draws more current than it is rated for, protecting the wiring from overheating. It does not protect people from shock — that is the safety switch's job.",
    triggers: ["circuit breaker", "mcb", "breaker"],
  },
  {
    term: "Loose termination",
    definition:
      "A connection that is not tight. A loose connection has more electrical resistance, and resistance makes heat — which is why loose terminations show up clearly on a thermal camera and are one of the most common causes of switchboard fires.",
    triggers: ["loose", "termination", "terminate"],
  },
  {
    term: "AS/NZS 3000",
    definition:
      "The Australian/New Zealand Wiring Rules — the standard that sets out how an electrical installation must be designed, installed and verified.",
    triggers: ["3000", "wiring rules"],
  },
  {
    term: "AS/NZS 3017",
    definition:
      "The Australian/New Zealand verification standard. It sets out the test methods and the pass/fail limits used to confirm an installation is safe, including the maximum trip times for safety switches.",
    triggers: ["3017", "rcd", "trip time"],
  },
  {
    term: "Isolation",
    definition:
      "Switching a circuit off and locking it out so it cannot be turned back on while someone is working on it. Some repairs require a short planned outage for this reason.",
    triggers: ["isolat", "shutdown", "de-energise", "outage"],
  },
];

export function relevantGlossary(text: string): GlossaryEntry[] {
  const haystack = text.toLowerCase();
  return GLOSSARY.filter((entry) =>
    entry.triggers.some((trigger) => haystack.includes(trigger)),
  );
}
