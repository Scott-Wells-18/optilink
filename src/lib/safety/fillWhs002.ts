import sharp from "sharp";
import {
  editZip,
  fillRowCell,
  markRating,
  putSignatures,
  readMain,
  tickBox,
  writeMain,
  type Placement,
  type Where,
} from "@/lib/safety/docx";
import {
  ACTIVITIES,
  ALTERNATIVES,
  CLOSE_OUT,
  CIRCUMSTANCES,
  CONSULTED,
  DECISIONS,
  EQUIPMENT,
  HAZARDS,
  PRELIMINARIES,
  PRE_START,
  conditionOf,
  hazardsInPlay,
  type Whs002,
} from "@/lib/safety/whs002";

/**
 * Filling in OEC-WHS002.
 *
 * The form is a Word document and stays one. Every answer goes into the cell
 * the form left for it, every box the assessor ticked is ticked as the form's
 * own "[ ]", and the two risk ratings are marked where the form prints the
 * scale — so a reader can see both what was offered and what was chosen,
 * which is the point of a form that prints its own scale.
 *
 * Whatever was not answered stays blank. This is an authorisation; a blank in
 * it is a question nobody answered, and filling it with something plausible
 * would be the worst thing this file could do.
 */

export type Whs002Values = {
  clientName: string;
  siteAddress: string;
  projectName: string;
  /** Written into "Assessment reference". The printed OEC number is untouched. */
  jobNumber: string;
  /** Which statements this authorisation is attached to, as the form asks. */
  linked: string;
  answers: Whs002;
  /** Applied only for a person who has confirmed at the signing step. */
  authorisation?: {
    name: string;
    position: string;
    at: string;
    signature?: Buffer | null;
  } | null;
  /** The workers who have accepted it, for the acceptance table at the back. */
  accepted?: { role: string; name: string; at: string; signature?: Buffer | null }[];
};

const SIGNATURE_HEIGHT = 24;

/**
 * The acceptance table at the back.
 *
 * "Safety observer" is also a row in the consultation table earlier in the
 * document, so the second one is asked for by name rather than by hoping.
 */
const ACCEPTANCE: Record<string, Where> = {
  "Electrical worker": { label: "Electrical worker" },
  Thermographer: { label: "Thermographer" },
  "Safety observer": { label: "Safety observer", nth: 1 },
  "Person restoring / closing board": { label: "Person restoring / closing board" },
};

export async function fillWhs002(template: Buffer, values: Whs002Values): Promise<Buffer> {
  const answers = values.answers;
  const placements: Placement[] = [];

  return editZip(template, async (zip) => {
    let xml = await readMain(zip);
    const put = (where: Where, cell: number, value: string | undefined) => {
      if (value?.trim()) xml = fillRowCell(xml, where, cell, value);
    };

    /* 1 — what this authorises ------------------------------------------- */
    put({ label: "Project / client" }, 1, `${values.projectName} — ${values.clientName}`.trim());
    put({ label: "Project / client" }, 3, values.siteAddress);
    put({ label: "Switchboard ID and location" }, 1, answers.switchboardId);
    put({ label: "Switchboard ID and location" }, 3, answers.nominalVoltage);
    put({ label: "RCD / circuit identification" }, 1, answers.circuits);
    put({ label: "RCD / circuit identification" }, 3, answers.supplyInfo);
    // The printed "OEC-SWMS014 / OEC-JSA014" is the form's own; where this job
    // is issued against different statements they are added beside it.
    if (values.linked && values.linked !== "OEC-SWMS014 / OEC-JSA014") {
      put({ label: "Linked SWMS / JSA" }, 1, `· this job: ${values.linked}`);
    }
    put({ label: "Linked SWMS / JSA" }, 3, values.jobNumber);
    put({ label: "Assessment date / time" }, 1, when(answers.assessedOn, answers.assessedAt));
    put({ label: "Assessment date / time" }, 3, span(answers.validFrom, answers.validTo));

    /* 2 — the activity ---------------------------------------------------- */
    for (const activity of ACTIVITIES) {
      if (answers.activity !== activity.value) continue;
      const where = { contains: activity.label };
      xml = tickBox(xml, where);
      put(where, 2, answers.activityMethod);
    }

    /* 3 — the permitted circumstance -------------------------------------- */
    for (const circumstance of CIRCUMSTANCES) {
      if (answers.circumstance !== circumstance.value) continue;
      const where = { contains: circumstance.label };
      xml = tickBox(xml, where);
      put(where, 2, answers.circumstanceEvidence);
    }

    /* 4 — what was considered instead ------------------------------------- */
    for (const alternative of ALTERNATIVES) {
      put({ label: alternative.label }, 1, answers.alternatives?.[alternative.key]);
    }

    /* 5 — the risk assessment --------------------------------------------- */
    const inPlay = hazardsInPlay(answers);
    for (const hazard of HAZARDS) {
      const where = { label: hazard.hazard };
      if (!inPlay.includes(hazard)) {
        // A row for something this job does not do says so, rather than being
        // left looking like a question nobody got to.
        put(where, 1, "Not applicable to this job.");
        continue;
      }
      const row = answers.risk?.[hazard.key];
      if (!row) continue;

      const condition = conditionOf(hazard, row.condition);
      put(where, 1, [condition?.label, row.note?.trim()].filter(Boolean).join(" "));
      if (condition) put(where, 3, condition.controls);
      if (row.initial) xml = markRating(xml, where, 2, row.initial);
      if (row.residual) xml = markRating(xml, where, 4, row.residual);
      put(where, 5, "Scott Wells");
    }

    /* 6 — section 158 preliminaries --------------------------------------- */
    for (const item of PRELIMINARIES) {
      const evidence = answers.preliminaries?.[item.key];
      if (!evidence?.trim()) continue;
      xml = tickBox(xml, { contains: item.label });
      put({ contains: item.label }, 2, evidence);
    }

    /* 7 — consultation ----------------------------------------------------- */
    for (const role of CONSULTED) {
      put({ label: role.role }, 1, answers.consultation?.[role.key]);
      if (answers.consultation?.[role.key]?.trim()) {
        put({ label: role.role }, 3, dateOnly(answers.assessedOn));
      }
    }

    /* 8 — competency, equipment and PPE ------------------------------------ */
    for (const item of EQUIPMENT) {
      const detail = answers.equipment?.[item.key];
      if (!detail?.trim()) continue;
      put({ label: item.label }, 1, detail);
      xml = tickBox(xml, { label: item.label });
    }

    /* 9 — the safety observer ---------------------------------------------- */
    if (answers.observer === "APPOINTED") {
      const where = { contains: "Safety observer appointed" };
      xml = tickBox(xml, where);
      // "Isolation location understood: [ ]" is the row's second box.
      xml = tickBox(xml, where, 1);
      put(
        where,
        1,
        [
          answers.observerName ? `Observer: ${answers.observerName}.` : "",
          answers.observerCompetency ? `CPR/LVR competency: ${answers.observerCompetency}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    if (answers.observer === "EXEMPT") {
      const where = { contains: "Observer exemption requested" };
      xml = tickBox(xml, where);
      put(where, 1, answers.observerBasis);
    }

    /* 10 — the pre-start check --------------------------------------------- */
    for (const item of PRE_START) {
      const detail = answers.preStart?.[item.key];
      if (!detail?.trim()) continue;
      xml = tickBox(xml, { contains: item.label });
      put({ contains: item.label }, 2, detail);
    }

    /* 12 — the authorisation ----------------------------------------------- */
    // The row prints "[ ] Approved [ ] Not approved [ ] Approved with
    // conditions", which is not the order they are offered in.
    const ORDER: Record<string, number> = { APPROVED: 0, REFUSED: 1, CONDITIONS: 2 };
    if (answers.decision && answers.decision in ORDER) {
      xml = tickBox(xml, { label: "Authorisation decision" }, ORDER[answers.decision]);
    }
    put({ label: "Authorisation decision" }, 3, span(answers.validFrom, answers.validTo));
    put({ label: "Conditions / limitations" }, 1, answers.conditions);

    if (values.authorisation) {
      put({ label: "PCBU / authorised person" }, 1, values.authorisation.name);
      put({ label: "PCBU / authorised person" }, 3, values.authorisation.position);
      put({ label: "Organisation" }, 3, values.authorisation.at);
      put({ label: "Signature" }, 3, dateOnly(values.authorisation.at));
      const picture = await measure(values.authorisation.signature);
      if (picture) placements.push({ where: { label: "Signature" }, cell: 1, picture });
    }

    /* 13 — the workers who accepted it -------------------------------------- */
    for (const person of values.accepted ?? []) {
      const where = ACCEPTANCE[person.role];
      if (!where) continue;
      put(where, 1, person.name);
      put(where, 3, person.at);
      const picture = await measure(person.signature);
      if (picture) placements.push({ where, cell: 2, picture });
    }

    /* 14 — close-out -------------------------------------------------------- */
    for (const [index, item] of CLOSE_OUT.entries()) {
      if (!answers.closeOut?.includes(item.key)) continue;
      xml = tickBox(xml, { label: "Close-out confirmation" }, index);
    }
    put({ label: "Defects / abnormal findings / follow-up" }, 1, answers.defects);

    writeMain(zip, xml);
    await putSignatures(zip, placements);
  });
}

/** "25 September 2026, 09:40" — and just the date where no time was given. */
function when(date?: string, time?: string): string {
  if (!date?.trim()) return "";
  return time?.trim() ? `${date.trim()}, ${time.trim()}` : date.trim();
}

function span(from?: string, to?: string): string {
  if (!from?.trim() || !to?.trim()) return "";
  return `${from.trim()} — ${to.trim()}`;
}

function dateOnly(value?: string): string {
  return value?.trim().split(",")[0] ?? "";
}

async function measure(png: Buffer | null | undefined) {
  if (!png) return null;
  const { width, height } = await sharp(png).metadata();
  if (!width || !height) return null;
  return {
    png,
    heightPt: SIGNATURE_HEIGHT,
    widthPt: Math.round((width / height) * SIGNATURE_HEIGHT),
  };
}
