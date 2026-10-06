import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { RegisterError, readRegister, type Item } from "@/lib/tagging/register";

/**
 * Turning a spreadsheet into a report that will not change under anybody.
 *
 * The rows are read once and stored on the report. The file they came out of
 * is kept beside them, so the original is always recoverable — but it is never
 * read again to draw the report. That is the whole point of storing the rows:
 * the reference spreadsheet gets replaced every month, and a register that
 * changed when it was replaced would not be a record of what was in the truck
 * in July.
 */

export { RegisterError };

export type Snapshot = {
  items: Item[];
  customer: string | null;
  siteLabel: string | null;
  notes: string[];
  counts: { itemCount: number; passCount: number; failCount: number; reviewCount: number };
};

export async function snapshotOf(fileId: string): Promise<Snapshot> {
  const file = await prisma.uploadedFile.findUnique({ where: { id: fileId } });
  if (!file) throw new RegisterError("That spreadsheet could not be found.");

  let bytes: Buffer;
  try {
    bytes = await readUpload(file.storedName);
  } catch {
    throw new RegisterError("That spreadsheet could not be read back off disk.");
  }

  const register = readRegister(bytes);
  // Where the whole file is one customer and site, the report says so without
  // being asked. Where it is not, it says nothing and waits to be told which
  // one it is about rather than picking the first and relabelling the rest.
  const one = register.groups.length === 1 ? register.groups[0] : null;
  const notes = [...register.notes];
  if (register.groups.length > 1) {
    notes.push(
      `This file holds ${register.groups.length} customer and site pairings: ${register.groups
        .map((group) => `${group.customer} / ${group.site} (${group.count})`)
        .join("; ")}. Choose which this report is about.`,
    );
  }

  return {
    items: register.items,
    customer: one?.customer ?? null,
    siteLabel: one?.site ?? null,
    notes,
    counts: countsOf(register.items),
  };
}

export function countsOf(items: Item[]) {
  return {
    itemCount: items.length,
    passCount: items.filter((item) => item.verdict === "PASS").length,
    failCount: items.filter((item) => item.verdict === "FAIL").length,
    reviewCount: items.filter((item) => item.verdict === "REVIEW").length,
  };
}

/** The stored rows, read back as what they are. */
export function itemsOf(stored: unknown): Item[] {
  return Array.isArray(stored) ? (stored as Item[]) : [];
}
