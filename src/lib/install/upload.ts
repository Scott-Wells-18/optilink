import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { parseInstallExport } from "@/lib/install/parse";
import { dummyDefault, type Section, type TestFile } from "@/lib/install/session";

/**
 * One tester PDF, read into the section it was uploaded to.
 *
 * Its rows are kept with the report so it says the same thing next year. The
 * dummy-first-record setting starts at the normal workflow for the section;
 * on a continuation file it is left unconfirmed, because after a reconnect
 * the first record may be genuine.
 */
export async function readTestFile(
  fileId: string,
  section: Section,
  first: boolean,
): Promise<{ file: TestFile } | { error: string }> {
  const stored = await prisma.uploadedFile.findUnique({ where: { id: fileId } });
  if (!stored) return { error: "That file could not be found." };

  let parsed;
  try {
    parsed = await parseInstallExport(await readUpload(stored.storedName));
  } catch {
    return { error: "That file could not be read as a tester export." };
  }
  if (parsed.rows.length === 0) {
    return {
      error: "No test records could be read out of that file. Check it is the tester's own PDF export.",
    };
  }

  return {
    file: {
      fileId: stored.id,
      originalName: stored.originalName,
      section,
      rows: parsed.rows,
      header: {
        title: parsed.title,
        siteName: parsed.siteName,
        boardNumber: parsed.boardNumber,
        circuitRange: parsed.circuitRange,
        createdAt: parsed.createdAt?.toISOString() ?? null,
      },
      notes: parsed.notes,
      excludeFirst: dummyDefault(section),
      dummyConfirmed: first || !dummyDefault(section),
    },
  };
}
