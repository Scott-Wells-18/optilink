import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/report/theme";
import { titleCase } from "@/lib/writing";
import { SIGNATORIES } from "@/lib/safety/catalogue";
import { fillJsa, type Signatory } from "@/lib/safety/fillJsa";
import { canFill, fillSwms } from "@/lib/safety/fillSwms";
import { signatureBytes, templateBytes, templateFor } from "@/lib/safety/library";

/**
 * Turning one set of answers into the documents themselves.
 *
 * Nothing is stored finished. The answers are kept and the documents are
 * filled on the way out, so correcting a project manager's name or replacing a
 * revised template takes effect on the next download rather than needing
 * everything regenerated.
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
  const out: Built[] = [];

  for (const code of doc.codes) {
    const template = templateFor(code);
    const bytes = await templateBytes(code);
    if (!template || !bytes) continue;

    const filled =
      template.format === "docx"
        ? await fillJsa(bytes, who)
        : await fillSwms(code, bytes, {
            clientName: doc.site.client.name,
            projectName: doc.projectName ?? undefined,
            projectAddress: doc.site.location ?? doc.site.name,
            projectManager: doc.projectManager ?? undefined,
            contactNumber: doc.contactNumber ?? undefined,
            submissionDate: date,
            issueDate: date,
            approvalDate: date,
            consultDateScott: date,
            consultDateKye: date,
          });

    out.push({
      name: fileName(code, template.title, doc.site.client.name, doc.date),
      mimeType:
        template.format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      bytes: filled,
    });
  }

  return out;
}

/** Both names, with whichever signatures the app holds. */
async function signatories(date: string): Promise<Signatory[]> {
  const out: Signatory[] = [];
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

/** True when a SWMS can actually be filled rather than handed over blank. */
export function fillable(code: string): boolean {
  const template = templateFor(code);
  if (!template) return false;
  return template.format === "docx" || canFill(code);
}
