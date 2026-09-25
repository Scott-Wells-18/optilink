import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/report/theme";
import { titleCase } from "@/lib/writing";
import { SIGNATORIES, type Template } from "@/lib/safety/catalogue";
import { decide, type Answers } from "@/lib/safety/decide";
import { canFillJsaPdf, fillJsaPdf, type JsaPdfValues } from "@/lib/safety/fillJsaPdf";
import { fillJsaDocx } from "@/lib/safety/fillJsaDocx";
import { fillWhs002 } from "@/lib/safety/fillWhs002";
import { canFill, fillSwms } from "@/lib/safety/fillSwms";
import { signatureBytes, templateBytes, templateFor } from "@/lib/safety/library";
import type { Whs002 } from "@/lib/safety/whs002";

/**
 * Turning one set of answers into the documents themselves.
 *
 * Nothing is stored finished. The answers are kept and the documents are
 * filled on the way out, so correcting a project manager's name or replacing a
 * revised template takes effect on the next download rather than needing
 * everything regenerated.
 *
 * Every document comes back in the format it was released in. A SWMS is a PDF
 * and is stamped in the boxes its own pages leave blank; a JSA released as a
 * PDF is stamped the same way; a JSA released as Word is edited inside the
 * .docx and handed back as Word. None of them is redrawn. Whatever the
 * document's page size, tables, column widths, colours, logo and page breaks
 * were when it was approved, they still are — the only difference is that the
 * blanks have something in them.
 *
 * Two things are never written automatically. The document's own identifier —
 * OEC-SWMS014, OEC-JSA001 — is left exactly as printed; the job number is a
 * separate value and goes in the job or project field. And a signature is
 * applied only for a person who has confirmed, at the signing step, that they
 * have read that set of documents. A saved signature is not a review.
 */

export type Built = { name: string; mimeType: string; bytes: Buffer };

/** Recorded when a person confirms they have read the documents. */
export type SignOff = Record<string, { at: string } | undefined>;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function buildSafetyDocs(id: string): Promise<Built[] | null> {
  const doc = await prisma.safetyDoc.findUnique({
    where: { id },
    include: { site: { include: { client: true } } },
  });
  if (!doc) return null;

  const answers = (doc.answers ?? {}) as Answers;
  const decision = decide(answers, { title: doc.jobTitle, description: doc.jobDescription });
  const description = doc.workDescription?.trim() || decision.description;
  const signOff = (doc.signOff ?? {}) as SignOff;

  // The date the assessment was actually carried out. Where nobody has said,
  // nothing is dated — a document dated for work that has not happened yet is
  // a worse answer than a blank.
  const assessed = doc.assessmentDate ? shortDate(doc.assessmentDate) : "";
  const issued = shortDate(doc.date);

  const projectName = doc.projectName?.trim() || doc.jobTitle?.trim() || "";
  const jobNumber = doc.jobNumber?.trim() ?? "";
  const who = await signatories(signOff);

  const out: Built[] = [];

  for (const code of doc.codes) {
    const template = templateFor(code);
    const bytes = await templateBytes(code);
    if (!template || !bytes) continue;

    const filled = await one(template, bytes, {
      clientName: doc.site.client.name,
      siteName: doc.site.name,
      siteAddress: doc.site.location ?? doc.site.name,
      projectName,
      jobNumber,
      projectManager: doc.projectManager ?? "",
      contactNumber: doc.contactNumber ?? "",
      description,
      issued,
      assessed,
      who,
      linked: linkedTo(doc.codes),
      energised: readable((doc.energised ?? {}) as Whs002),
    });
    if (!filled) continue;

    out.push({
      name: fileName(code, template.title, doc.site.client.name, doc.date, template.format),
      mimeType: template.format === "docx" ? DOCX : "application/pdf",
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
    if (template.format === "docx") return fillJsaDocx(bytes, jsa);
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
    // Beside a signature that the released template already has printed on it.
    // Dated only for someone who has actually confirmed.
    consultDateScott: signed("scott") || undefined,
    consultDateKye: signed("kye") || undefined,
    scopeOfWorks: values.description,
  });
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
async function signatories(signOff: SignOff): Promise<Person[]> {
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
  if (template.kind === "JSA") return template.format === "docx" || canFillJsaPdf(code);
  return canFill(code);
}
