import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/report/theme";
import { titleCase } from "@/lib/writing";
import { SIGNATORIES } from "@/lib/safety/catalogue";
import { decide, type Answers } from "@/lib/safety/decide";
import { renderJsaPdf, type JsaSignatory } from "@/lib/safety/jsaPdf";
import { readJsa } from "@/lib/safety/readJsa";
import { canFill, fillSwms } from "@/lib/safety/fillSwms";
import { signatureBytes, templateBytes, templateFor } from "@/lib/safety/library";

/**
 * Turning one set of answers into the documents themselves.
 *
 * Nothing is stored finished. The answers are kept and the documents are
 * filled on the way out, so correcting a project manager's name or replacing a
 * revised template takes effect on the next download rather than needing
 * everything regenerated.
 *
 * Everything comes out as a PDF. A SWMS already is one and is stamped in
 * place; a JSA was written in Word, so it is read out of the .docx and drawn
 * as a PDF — the same words, ratings, colours and column proportions, plus
 * whatever rows this job's answers added.
 */

export type Built = { name: string; mimeType: string; bytes: Buffer };

export async function buildSafetyDocs(id: string): Promise<Built[] | null> {
  const doc = await prisma.safetyDoc.findUnique({
    where: { id },
    include: { site: { include: { client: true } } },
  });
  if (!doc) return null;

  const date = shortDate(doc.date);
  const who = await signatories(date);
  const answers = (doc.answers ?? {}) as Answers;
  const decision = decide(answers, {
    title: doc.jobTitle,
    description: doc.jobDescription,
  });
  const description = doc.workDescription?.trim() || decision.description;
  const logo = await brandBytes("logo.jpg");
  const out: Built[] = [];

  for (const code of doc.codes) {
    const template = templateFor(code);
    const bytes = await templateBytes(code);
    if (!template || !bytes) continue;

    let filled: Buffer;
    if (template.format === "docx" && template.kind === "JSA") {
      const jsa = await readJsa(bytes);
      if (!jsa) continue;
      filled = await renderJsaPdf(
        jsa,
        {
          clientName: doc.site.client.name,
          siteName: doc.site.name,
          siteAddress: doc.site.location ?? "",
          projectName: doc.projectName ?? doc.jobTitle ?? "",
          projectManager: doc.projectManager ?? "",
          contactNumber: doc.contactNumber ?? "",
          date,
          description,
          code,
        },
        who,
        decision.hazards,
        logo,
      );
    } else if (template.format === "docx") {
      // An authorisation form is signed by hand on site; it goes out as it is.
      continue;
    } else {
      filled = await fillSwms(code, bytes, {
        clientName: doc.site.client.name,
        projectName: doc.projectName ?? doc.jobTitle ?? undefined,
        projectAddress: doc.site.location ?? doc.site.name,
        projectManager: doc.projectManager ?? undefined,
        contactNumber: doc.contactNumber ?? undefined,
        submissionDate: date,
        issueDate: date,
        approvalDate: date,
        consultDateScott: date,
        consultDateKye: date,
      });
    }

    out.push({
      name: fileName(code, template.title, doc.site.client.name, doc.date),
      mimeType: "application/pdf",
      bytes: filled,
    });
  }

  return out;
}

/** Both names, with whichever signatures the app holds. */
async function signatories(date: string): Promise<JsaSignatory[]> {
  const out: JsaSignatory[] = [];
  for (const person of SIGNATORIES) {
    const signature = await signatureBytes(person.key);
    out.push({
      name: person.name,
      position: person.position,
      date,
      signature: signature ?? undefined,
    });
  }
  return out;
}

/**
 * "SWMS014 RCD Testing - Transdev John Holland - 2026-09-21"
 *
 * Plain ASCII: this is going into an email to a client who may be opening it
 * on anything, and a dash a title happens to be written with is not worth a
 * file that will not open.
 */
function fileName(code: string, title: string, client: string, date: Date): string {
  const when = date.toISOString().slice(0, 10);
  return plain(`${code} ${titleCase(title)} - ${client} - ${when}`);
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

async function brandBytes(name: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "brand", name));
  } catch {
    return null;
  }
}

/** True when a document can actually be filled rather than handed over blank. */
export function fillable(code: string): boolean {
  const template = templateFor(code);
  if (!template) return false;
  return template.kind === "JSA" || canFill(code);
}
