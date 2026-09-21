import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { readUpload, uploadDir } from "@/lib/storage";
import { BY_CODE, SIGNATORIES, TEMPLATES, type Template } from "@/lib/safety/catalogue";

/**
 * Getting the paperwork into the app, and out again.
 *
 * The templates and both signatures were uploaded to a GitHub release. They
 * are fetched from there once and kept in the app's own file store, because a
 * release is a public URL and a signature is the thing that makes a document
 * binding — it has no business being reachable by anyone who guesses a link.
 *
 * After the import nothing reaches out to GitHub again: the app owns its
 * copies, and the release can be deleted or made private without breaking it.
 */

const RELEASE = "https://github.com/Scott-Wells-18/optilink/releases/download/jsaswms";

const SIGNATURE_FILES: Record<string, string> = {
  scott: "Scott.Signature.png",
  kye: "Kye.s.Signature.png",
};

export type ImportResult = {
  templates: { code: string; status: "added" | "already here" | "failed"; detail?: string }[];
  signatures: { key: string; status: "added" | "already here" | "failed"; detail?: string }[];
};

/** Pulls anything not already held. Safe to run again; it skips what it has. */
export async function importLibrary(force = false): Promise<ImportResult> {
  const result: ImportResult = { templates: [], signatures: [] };

  for (const template of TEMPLATES) {
    const held = await prisma.safetyTemplate.findUnique({ where: { code: template.code } });
    if (held && !force) {
      result.templates.push({ code: template.code, status: "already here" });
      continue;
    }
    try {
      const bytes = await fetchAsset(template.file);
      const file = await store(bytes, template.file, mimeFor(template.format));
      await prisma.safetyTemplate.upsert({
        where: { code: template.code },
        create: {
          code: template.code,
          kind: template.kind,
          title: template.title,
          format: template.format,
          fileName: template.file,
          fileId: file.id,
        },
        update: { title: template.title, fileName: template.file, fileId: file.id },
      });
      result.templates.push({ code: template.code, status: "added" });
    } catch (error) {
      result.templates.push({
        code: template.code,
        status: "failed",
        detail: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  for (const who of SIGNATORIES) {
    const held = await prisma.signature.findUnique({ where: { key: who.key } });
    if (held && !force) {
      result.signatures.push({ key: who.key, status: "already here" });
      continue;
    }
    try {
      const bytes = await fetchAsset(SIGNATURE_FILES[who.key]);
      const file = await store(bytes, SIGNATURE_FILES[who.key], "image/png");
      await prisma.signature.upsert({
        where: { key: who.key },
        create: { key: who.key, name: who.name, position: who.position, fileId: file.id },
        update: { name: who.name, position: who.position, fileId: file.id },
      });
      result.signatures.push({ key: who.key, status: "added" });
    } catch (error) {
      result.signatures.push({
        key: who.key,
        status: "failed",
        detail: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return result;
}

/** What the app holds right now, whether or not the import has been run. */
export async function libraryState() {
  const [templates, signatures] = await Promise.all([
    prisma.safetyTemplate.findMany({ orderBy: { code: "asc" } }),
    prisma.signature.findMany(),
  ]);
  return {
    held: templates.length,
    expected: TEMPLATES.length,
    signatures: signatures.length,
    missing: TEMPLATES.filter((t) => !templates.some((held) => held.code === t.code)).map(
      (t) => t.code,
    ),
  };
}

/* --- reading them back ---------------------------------------------------- */

export async function templateBytes(code: string): Promise<Buffer | null> {
  const held = await prisma.safetyTemplate.findUnique({
    where: { code },
    include: { file: true },
  });
  if (!held) return null;
  try {
    return await readUpload(held.file.storedName);
  } catch {
    return null;
  }
}

export { signatureBytes } from "@/lib/signatures";

export function templateFor(code: string): Template | undefined {
  return BY_CODE.get(code);
}

/* --- the plumbing --------------------------------------------------------- */

async function fetchAsset(name: string): Promise<Buffer> {
  const response = await fetch(`${RELEASE}/${encodeURIComponent(name)}`, {
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${response.status} fetching ${name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`${name} came back empty`);
  return bytes;
}

/**
 * Writes bytes into the upload store the same way an uploaded file goes in,
 * so the templates are served and cleaned up like everything else.
 */
async function store(bytes: Buffer, originalName: string, mimeType: string) {
  const id = randomUUID();
  const extension = path.extname(originalName) || ".bin";
  const storedName = path.join(id.slice(0, 2), id.slice(2, 4), `${id}${extension}`);
  const destination = path.join(uploadDir(), storedName);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);

  return prisma.uploadedFile.create({
    data: { originalName, storedName, mimeType, sizeBytes: bytes.length },
  });
}

function mimeFor(format: string): string {
  return format === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
}
