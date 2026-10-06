import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/report/theme";
import { titleCase } from "@/lib/writing";
import { SIGNATORIES, type Template } from "@/lib/safety/catalogue";
import { decide, type Answers } from "@/lib/safety/decide";
import { canFillJsaPdf, fillJsaPdf, type JsaPdfValues } from "@/lib/safety/fillJsaPdf";
import { fillWhs002 } from "@/lib/safety/fillWhs002";
import { canFill, fillSwms, type SwmsValues } from "@/lib/safety/fillSwms";
import { pdfBytes, signatureBytes, templateBytes, templateFor } from "@/lib/safety/library";
import { signatories as profileSignatories } from "@/lib/profiles.server";
import { personName } from "@/lib/contacts";
import { clean, toPlain, type RichText } from "@/lib/richText";
import { scopePage } from "@/lib/safety/scopePage";
import { CIRCUMSTANCES, HAZARDS, conditionOf, type Whs002 } from "@/lib/safety/whs002";

/**
 * Turning one set of answers into the documents themselves.
 *
 * Nothing is stored finished. The answers are kept and the documents are
 * filled on the way out, so correcting a project manager's name or replacing a
 * revised template takes effect on the next download rather than needing
 * everything regenerated.
 *
 * Every SWMS and JSA comes back as a PDF, stamped in the boxes its own pages
 * left blank. Four of the JSAs were released as Word files and are filled
 * through a PDF rendition of the released file — see `library.ts`. None of
 * them is redrawn: whatever the document's page size, tables, column widths,
 * colours, logo and page breaks were when it was approved, they still are, and
 * the only difference is that the blanks have something in them.
 *
 * In front of each one goes a scope of works page. The released documents were
 * written to be used on any job and none of them says what *this* job is, so
 * that page carries the words the electrician wrote about this work. It is an
 * addition — the document's own pages follow it, untouched.
 *
 * OEC-WHS002 is the exception on both counts. It is not a method statement or
 * a risk assessment but an authorisation that gets completed and signed on
 * site, so it stays the Word form it was written as and gets no scope page.
 *
 * Two things are never written automatically. The document's own identifier —
 * OEC-SWMS014, OEC-JSA001 — is left exactly as printed; the job number is a
 * separate value and goes in the job or project field. And a signature is
 * applied only for a person who has confirmed, at the signing step, that they
 * have read that set of documents. A saved signature is not a review.
 */

export type Built = { code: string; name: string; mimeType: string; bytes: Buffer };

/** Recorded when a person confirms they have read the documents. */
export type SignOff = Record<string, { at: string } | undefined>;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function buildSafetyDocs(id: string): Promise<Built[] | null> {
  const doc = await prisma.safetyDoc.findUnique({
    where: { id },
    include: { site: { include: { client: true } }, contact: true },
  });
  if (!doc) return null;

  const answers = (doc.answers ?? {}) as Answers;
  const decision = decide(answers, { title: doc.jobTitle, description: doc.jobDescription });
  const scope = clean(doc.scope);
  const overrides = (doc.scopeOverrides ?? {}) as Record<string, unknown>;
  // The scope is the job in the operator's own words, so it is what the
  // documents say the work is. The answers only fill in behind it.
  const description = toPlain(scope) || doc.workDescription?.trim() || decision.description;
  const signOff = (doc.signOff ?? {}) as SignOff;

  // The date the assessment was actually carried out. Where nobody has said,
  // nothing is dated — a document dated for work that has not happened yet is
  // a worse answer than a blank.
  const assessed = doc.assessmentDate ? shortDate(doc.assessmentDate) : "";
  const issued = shortDate(doc.date);

  const projectName = doc.projectName?.trim() || doc.jobTitle?.trim() || "";
  const jobNumber = doc.jobNumber?.trim() ?? "";
  const who = await signatories(doc.preparedBy ?? [], signOff, assessed || issued);

  const out: Built[] = [];

  for (const code of doc.codes) {
    const template = templateFor(code);
    if (!template) continue;
    // A JSA released as Word is filled through the PDF rendition of it.
    const bytes =
      template.kind === "WHS" ? await templateBytes(code) : await pdfBytes(code);
    if (!bytes) continue;

    const own = clean(overrides[code]);
    const values: Values = {
      clientName: doc.site.client.name,
      siteName: doc.site.name,
      siteAddress: doc.site.location ?? doc.site.name,
      projectName,
      jobNumber,
      // Read from the contact record every time, so correcting the contact
      // corrects the paperwork.
      projectManager: personName(doc.contact?.name ?? "") || doc.projectManager || "",
      contactNumber: doc.contact?.phone?.trim() ?? "",
      description: own.length > 0 ? toPlain(own) : description,
      issued,
      assessed,
      who,
      linked: linkedTo(doc.codes),
      energised: readable((doc.energised ?? {}) as Whs002),
    };

    const drawn = await one(template, bytes, values);
    if (!drawn) continue;
    let filled = drawn;

    const paper = template.kind === "WHS" ? "docx" : "pdf";
    if (paper === "pdf") {
      filled = await withScope(filled, code, template.title, own.length > 0 ? own : scope, values);
    }

    out.push({
      code,
      name: fileName(code, template.title, doc.site.client.name, doc.date, paper),
      mimeType: paper === "docx" ? DOCX : "application/pdf",
      bytes: filled,
    });
  }

  return out;
}

type Values = {
  clientName: string;
  siteName: string;
  siteAddress: string;
  projectName: string;
  jobNumber: string;
  projectManager: string;
  contactNumber: string;
  description: string;
  issued: string;
  assessed: string;
  who: Person[];
  linked: string;
  energised: Whs002;
};

type Person = {
  key: string;
  name: string;
  position: string;
  /** The date they confirmed, or "" where they have not. */
  date: string;
  signature: Buffer | null;
};

/** One document, filled the way its own format wants. */
async function one(
  template: Template,
  bytes: Buffer,
  values: Values,
): Promise<Buffer | null> {
  if (template.kind === "WHS") {
    return fillWhs002(bytes, {
      clientName: values.clientName,
      siteAddress: values.siteAddress,
      projectName: values.projectName,
      jobNumber: values.jobNumber,
      linked: values.linked,
      answers: values.energised,
      authorisation: authorisation(values),
      accepted: accepted(values),
    });
  }

  if (template.kind === "JSA") {
    const jsa: JsaPdfValues = {
      jobLine: jobLine(values),
      signatories: values.who.map((person) => ({
        name: person.name,
        position: person.position,
        date: person.date,
        signature: person.signature,
      })),
    };
    if (canFillJsaPdf(template.code)) return fillJsaPdf(template.code, bytes, jsa);
    return bytes;
  }

  if (!canFill(template.code)) return bytes;
  const signed = (key: string) => values.who.find((person) => person.key === key)?.date ?? "";
  return fillSwms(template.code, bytes, {
    clientName: values.clientName,
    // The job number goes in the project field, beneath the identifier the
    // document prints for itself. That identifier is never touched.
    projectName: withJobNumber(values),
    projectAddress: values.siteAddress,
    projectManager: values.projectManager || undefined,
    contactNumber: values.contactNumber || undefined,
    submissionDate: values.issued,
    issueDate: values.issued,
    approvalDate: values.assessed || undefined,
    // Beside a signature that the released template already has printed on it,
    // both in the consultation table on page one and in the signatories table
    // at the back. Dated only for someone who has actually confirmed.
    consultDateScott: signed("scott") || undefined,
    consultDateKye: signed("kye") || undefined,
    signatoryDateScott: signed("scott") || undefined,
    signatoryDateKye: signed("kye") || undefined,
    // Two of the templates print these names and one leaves them blank beside
    // the signature. Naming whose signature that is is not a claim that they
    // have read anything, so unlike the date it does not wait for the signing
    // step.
    signatoryNameScott: values.who.find((person) => person.key === "scott")?.name,
    signatoryNameKye: values.who.find((person) => person.key === "kye")?.name,
    scopeOfWorks: values.description,
    ...addendum(values),
  });
}

/**
 * OEC-SWMS014's energised-work addendum.
 *
 * The RCD testing statement carries three pages the others do not: a recorded
 * site-specific risk assessment, a method, and an authorisation to complete
 * before work starts. They ask for what OEC-WHS002 asks for, so they are
 * answered from the same place rather than asked for twice — and they stay
 * blank when the job never needed OEC-WHS002, because an addendum nobody
 * filled in is an honest blank and an addendum filled in from nothing is not.
 */
function addendum(values: Values): Pick<SwmsValues, "addendum" | "ticks"> {
  const energised = values.energised;
  if (!energised.activity && !energised.switchboardId) return {};

  const risk = energised.risk ?? {};
  const said = (key: string) => {
    const row = risk[key];
    const hazard = HAZARDS.find((entry) => entry.key === key);
    const condition = hazard ? conditionOf(hazard, row?.condition) : undefined;
    if (!condition) return "";
    const note = row?.note?.trim();
    const rating = row?.initial && row?.residual ? ` Initial ${row.initial}, residual ${row.residual}.` : "";
    return `${condition.label}${note ? ` ${note}` : ""}${rating}`;
  };
  const from = (group: Record<string, string> | undefined, key: string) => group?.[key]?.trim() ?? "";
  const signed = (key: string) => values.who.find((person) => person.key === key);
  const accepted = (person?: Person) => (person?.date ? `${person.name} — ${person.date}` : "");

  const REASONS: Record<string, number> = { SAFETY: 1, PROPER: 2, S155: 3, NO_ALTERNATIVE: 4 };
  const ticks: string[] = [];
  if (energised.circumstance && REASONS[energised.circumstance]) {
    ticks.push(`reason${REASONS[energised.circumstance]}`);
  }
  // The authorisation's eleven lines, in the order the page prints them.
  const checks: [number, string][] = [
    [1, from(energised.preStart, "RISK")],
    [2, from(energised.preStart, "CIRCUMSTANCE")],
    [3, from(energised.preStart, "IDENTIFIED")],
    [4, from(energised.preStart, "ISOLATION")],
    [5, from(energised.preStart, "ACCESS")],
    [6, from(energised.preStart, "GEAR")],
    [7, from(energised.equipment, "ARC")],
    [8, energised.observer === "APPOINTED" ? "yes" : ""],
    [9, energised.observer === "EXEMPT" ? "yes" : ""],
    [10, from(energised.preStart, "RESCUE")],
    [11, from(energised.preStart, "DOCS")],
  ];
  for (const [n, answered] of checks) if (answered) ticks.push(`check${n}`);

  const reason = CIRCUMSTANCES.find((one) => one.value === energised.circumstance);

  return {
    ticks,
    addendum: {
      addProject: [values.projectName, values.clientName, values.siteAddress]
        .filter(Boolean)
        .join(" — "),
      addBoard: energised.switchboardId ?? "",
      addVoltage: [energised.nominalVoltage, energised.supplyInfo].filter(Boolean).join(" · "),
      addCircuits: energised.circuits ?? "",
      addMethod: [energised.activityMethod, from(energised.equipment, "TESTER")]
        .filter(Boolean)
        .join(" Instrument: "),
      addWorker: from(energised.equipment, "LICENCE"),
      addAssessor: from(energised.consultation, "ASSESSOR"),
      addWhen: [energised.assessedOn, energised.assessedAt].filter(Boolean).join(", "),
      addConsulted: from(energised.consultation, "PCBU"),
      addIsolation: from(energised.preliminaries, "ISOLATION"),
      addJustification: energised.circumstanceEvidence ?? "",
      addShock: said("shock"),
      addArc: said("arc"),
      addAdjacent: said("adjacent"),
      addDamaged: said("condition"),
      addOutage: said("outage"),
      addAccess: said("access"),
      addOther: said("rescue"),
      authReference: values.jobNumber ? `Job ${values.jobNumber}` : "",
      authReason: reason ? reason.label : "",
      authBoard: [energised.switchboardId, energised.circuits].filter(Boolean).join(" · "),
      authIsolation: from(energised.preliminaries, "ISOLATION"),
      authVerified: accepted(signed("scott")),
      authTester: from(energised.equipment, "TESTER"),
      authPpe: from(energised.equipment, "ARC"),
      authObserver: energised.observerName ?? "",
      authObserverDate: energised.observerCompetency ?? "",
      authExemption: energised.observerBasis ?? "",
      authEmergency: from(energised.preStart, "RESCUE"),
      authWorker: accepted(signed("scott")),
      authAssessor: accepted(signed("scott")),
      authConsulted: from(energised.consultation, "PCBU"),
      authPcbu: accepted(signed("scott")),
      authValid: [energised.validFrom, energised.validTo].filter(Boolean).join(" — "),
    },
  };
}

function withJobNumber(values: Values): string {
  if (!values.jobNumber) return values.projectName;
  if (!values.projectName) return `Job ${values.jobNumber}`;
  return `Job ${values.jobNumber} — ${values.projectName}`;
}

/** The line written under a JSA's title, where the form has no field for one. */
function jobLine(values: Values): string {
  return [
    values.jobNumber ? `Job ${values.jobNumber}` : "",
    values.projectName,
    `${values.clientName} — ${values.siteName}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The scope of works page, bound onto the front.
 *
 * Drawn at the page size of the document it belongs to, then put in front of
 * it. The document's own pages are copied across untouched — nothing about
 * them is re-laid out, resized or re-encoded beyond what copying a page is.
 */
async function withScope(
  filled: Buffer,
  code: string,
  title: string,
  scope: RichText,
  values: Values,
): Promise<Buffer> {
  const source = await PDFDocument.load(filled);
  const first = source.getPage(0);
  const size = { width: first.getWidth(), height: first.getHeight() };

  const page = await scopePage(size, {
    scope,
    facts: {
      code: `OEC-${code}`,
      title,
      clientName: values.clientName,
      siteName: values.siteName,
      siteAddress: values.siteAddress,
      projectName: values.projectName,
      jobNumber: values.jobNumber ? `Job ${values.jobNumber}` : "",
      contactName: values.projectManager,
      contactNumber: values.contactNumber,
      date: values.issued,
      assessed: values.assessed,
    },
  });

  const out = await PDFDocument.create();
  const front = await PDFDocument.load(page);
  for (const copied of await out.copyPages(front, front.getPageIndices())) out.addPage(copied);
  for (const copied of await out.copyPages(source, source.getPageIndices())) out.addPage(copied);
  return Buffer.from(await out.save());
}

/**
 * The calendar answers, written the way the rest of the document is.
 *
 * The form asks for them on a calendar, which hands back 2026-09-25; the page
 * they land on says 25 September 2026 everywhere else.
 */
function readable(answers: Whs002): Whs002 {
  const day = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return shortDate(new Date(`${value}T00:00:00Z`));
  };
  return {
    ...answers,
    assessedOn: day(answers.assessedOn),
    validFrom: day(answers.validFrom),
    validTo: day(answers.validTo),
  };
}

/** "OEC-SWMS014 / OEC-JSA014", as OEC-WHS002 asks for it. */
function linkedTo(codes: string[]): string {
  return codes
    .filter((code) => code.startsWith("SWMS") || code.startsWith("JSA"))
    .map((code) => `OEC-${code}`)
    .join(" / ");
}

/**
 * Both names, and a signature only where its owner has confirmed.
 *
 * The name and the position are printed either way: the form asks who the
 * assessment covers, and it covers both of them whether or not they have got
 * to the signing step yet. The date and the signature are the part that says
 * somebody read it, so those wait.
 */
async function signatories(
  chosen: string[],
  signOff: SignOff,
  dated: string,
): Promise<Person[]> {
  // Nobody picked: the documents behave as they did before anyone could be
  // picked, so paperwork filed last month still comes out the way it did.
  if (chosen.length === 0) {
    const out: Person[] = [];
    for (const person of SIGNATORIES) {
      const confirmed = signOff[person.key];
      out.push({
        key: person.key,
        name: person.name,
        position: person.position,
        date: confirmed ? shortDate(new Date(confirmed.at)) : "",
        signature: confirmed ? await signatureBytes(person.key) : null,
      });
    }
    return out;
  }

  const people = await profileSignatories(chosen);
  return people.map((person) => ({
    // Two of the released SWMS rows carry a name in print. Somebody whose name
    // is one of those takes that row; anybody else is their own person, which
    // the JSAs can take and those two SWMS rows cannot.
    key: printedRow(person.name) ?? person.id,
    name: person.name,
    position: person.role || "Electrician",
    date: dated,
    signature: person.signature,
  }));
}

/** Which pre-printed signatory row a name belongs in, where it is one of them. */
function printedRow(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return SIGNATORIES.find((person) => person.name.toLowerCase() === wanted)?.key ?? null;
}

/**
 * Who among the chosen cannot be placed on a released SWMS.
 *
 * Seventeen of the eighteen print their two signatory names, which is not ours
 * to rewrite. Anyone else signs the JSAs — which have four rows and no printed
 * names — and OEC-SWMS013, and the report says so rather than printing one
 * person's name over another's signature.
 */
export function unplaceable(people: Person[]): string[] {
  return people.filter((person) => !printedRow(person.name)).map((person) => person.name);
}

/** Scott authorises OEC-WHS002, and only once he has confirmed. */
function authorisation(values: Values) {
  const scott = values.who.find((person) => person.key === "scott");
  if (!scott?.date) return null;
  const at = values.energised.assessedAt?.trim();
  return {
    name: scott.name,
    position: scott.position,
    at: at ? `${scott.date}, ${at}` : scott.date,
    signature: scott.signature,
  };
}

/** The workers who have accepted it, for the table at the back of WHS002. */
function accepted(values: Values) {
  const out: { role: string; name: string; at: string; signature?: Buffer | null }[] = [];
  const scott = values.who.find((person) => person.key === "scott");
  const kye = values.who.find((person) => person.key === "kye");
  const doingThermal =
    values.energised.activity === "THERMAL" || values.energised.activity === "BOTH";

  if (scott?.date) {
    out.push({ role: "Electrical worker", name: scott.name, at: scott.date, signature: scott.signature });
    if (doingThermal) {
      out.push({ role: "Thermographer", name: scott.name, at: scott.date, signature: scott.signature });
    }
  }
  if (kye?.date && values.energised.observer === "APPOINTED") {
    out.push({ role: "Safety observer", name: kye.name, at: kye.date, signature: kye.signature });
  }
  return out;
}

/**
 * "SWMS014 RCD Testing - Transdev John Holland - 2026-09-21.pdf"
 *
 * Plain ASCII: this is going into an email to a client who may be opening it
 * on anything, and a dash a title happens to be written with is not worth a
 * file that will not open.
 */
function fileName(
  code: string,
  title: string,
  client: string,
  date: Date,
  format: string,
): string {
  const when = date.toISOString().slice(0, 10);
  return `${plain(`${code} ${titleCase(title)} - ${client} - ${when}`)}.${format}`;
}

function plain(name: string): string {
  return name
    .replace(/[‒-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*-\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a document can actually be filled rather than handed over blank. */
export function fillable(code: string): boolean {
  const template = templateFor(code);
  if (!template) return false;
  if (template.kind === "WHS") return true;
  if (template.kind === "JSA") return canFillJsaPdf(code);
  return canFill(code);
}
