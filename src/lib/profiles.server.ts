import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { COMPANY } from "@/lib/company";
import { fullName, roleOf, type Title } from "@/lib/profiles";

/**
 * Reading profiles for a document.
 *
 * Kept apart from the rules themselves because this half reaches the database
 * and the file store, and the other half is read by the screens as well.
 */

/** A profile as a report needs it: the name, the credentials, the mark. */
export type Signatory = {
  id: string;
  name: string;
  /** "Director · Electrician", or "Apprentice Electrician". */
  role: string;
  licence: string | null;
  supervisor: string | null;
  signature: Buffer | null;
};


/**
 * The chosen people, in the order they are listed rather than the order they
 * were clicked, with their signatures read off disk.
 *
 * An id naming a profile that has since been deleted is dropped rather than
 * printed as a blank line.
 */
export async function signatories(ids: string[]): Promise<Signatory[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.profile.findMany({
    where: { id: { in: ids } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { signatureFile: true },
  });

  const out: Signatory[] = [];
  for (const row of rows) {
    out.push({
      id: row.id,
      name: fullName(row),
      role: roleOf({ titles: row.titles as Title[], director: row.director }),
      licence: row.licence,
      supervisor: row.supervisor,
      signature: row.signatureFile
        ? await readUpload(row.signatureFile.storedName).catch(() => null)
        : null,
    });
  }
  return out;
}

/**
 * Who a report is prepared by when nobody has said.
 *
 * The director, who is who it was before any of this could be chosen. A report
 * drawn for a job filed before profiles existed still comes out signed rather
 * than blank.
 */
export async function defaultSignatories(): Promise<Signatory[]> {
  await ensureProfiles();
  const director = await prisma.profile.findFirst({
    where: { director: true, licence: { not: null } },
    orderBy: { position: "asc" },
    include: { signatureFile: true },
  });
  return director ? signatories([director.id]) : [];
}

/* --- the two the company starts with -------------------------------------- */

/**
 * Scott and Kye, created once from the signatures already on file.
 *
 * Scott carries both numbers and is the director; Kye is the apprentice, with
 * a name and a signature and nothing else — which is exactly enough to sign a
 * SWMS and not enough to be named on a report, and that is the rule working
 * rather than an omission.
 */
export async function ensureProfiles(): Promise<void> {
  const held = await prisma.profile.count();
  if (held > 0) return;

  // The signatures are imported from the company's own release the first time
  // anything asks for one.
  const { ensureLibrary } = await import("@/lib/safety/library");
  await ensureLibrary().catch(() => {});

  const marks = await prisma.signature.findMany();
  const markFor = (key: string) => marks.find((mark) => mark.key === key)?.fileId ?? null;

  const seeds = [
    {
      firstName: "Scott",
      lastName: "Wells",
      licence: COMPANY.licence,
      supervisor: COMPANY.supervisor,
      titles: ["ELECTRICIAN" as Title],
      director: true,
      signatureFileId: markFor("scott"),
      position: 0,
    },
    {
      firstName: "Kye",
      lastName: "Wells",
      licence: null,
      supervisor: null,
      titles: ["APPRENTICE" as Title],
      director: false,
      signatureFileId: markFor("kye"),
      position: 1,
    },
  ];

  for (const seed of seeds) {
    await prisma.profile.create({ data: seed }).catch(() => {});
  }
}

