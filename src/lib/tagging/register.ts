import { readNamedSheet, readSheet, sheetsOf } from "@/lib/sheet";

/**
 * Reading a test-and-tag register out of the tagging software's export.
 *
 * The export is one sheet — "Test & Tag Register" — with a row per item of
 * equipment and twenty named columns. The columns are found by their headings
 * rather than by position, because an export written by a different version of
 * the software puts them in a different order and a register read off by
 * position is a register that has quietly swapped two serial numbers.
 *
 * Nothing here corrects the data. A barcode is whatever the cell said, leading
 * zeros and all; a date is the text it was written as. The register is a
 * record of what was tested and when, and a report that improves on it is no
 * longer a record of anything.
 */

/** The sheet the tagging software writes. */
export const REGISTER_SHEET = "Test & Tag Register";

/**
 * The columns, in the order they are printed.
 *
 * SubLocation is read and then dropped: it is in every export and empty or
 * "NA" in all of them, and a column of "NA" on a client's report is a column
 * of nothing. Everything else is kept.
 */
export type Field =
  | "customer"
  | "site"
  | "location"
  | "category"
  | "barcode"
  | "make"
  | "model"
  | "description"
  | "oldBarcode"
  | "assetNo"
  | "serialNo"
  | "status"
  | "lastTestDate"
  | "lastTestTime"
  | "frequency"
  | "testDue"
  | "sequence"
  | "comments"
  | "user";

export const FIELDS: readonly Field[] = [
  "customer",
  "site",
  "location",
  "category",
  "barcode",
  "make",
  "model",
  "description",
  "oldBarcode",
  "assetNo",
  "serialNo",
  "status",
  "lastTestDate",
  "lastTestTime",
  "frequency",
  "testDue",
  "sequence",
  "comments",
  "user",
];

export const FIELD_LABELS: Record<Field, string> = {
  customer: "Customer",
  site: "Site",
  location: "Location",
  category: "Category",
  barcode: "Barcode",
  make: "Make",
  model: "Model",
  description: "Description",
  oldBarcode: "Old barcode",
  assetNo: "Asset no.",
  serialNo: "Serial no.",
  status: "Status",
  lastTestDate: "Last tested",
  lastTestTime: "Time",
  frequency: "Frequency",
  testDue: "Test due",
  sequence: "Test sequence",
  comments: "Comments",
  user: "Tested by",
};

/**
 * What each column is called in the export.
 *
 * Several spellings per column because the heading is what some other
 * program's export settings produced. Matched loosely: case, spacing and
 * punctuation are ignored, so "Asset No", "Asset No." and "ASSET_NO" are one
 * heading.
 */
const HEADINGS: Record<Field | "subLocation", string[]> = {
  customer: ["customer", "client"],
  site: ["site"],
  location: ["location"],
  subLocation: ["sublocation"],
  category: ["equipmentcategory", "category"],
  barcode: ["barcode"],
  make: ["make", "manufacturer"],
  model: ["model"],
  description: ["description", "equipmentdescription"],
  oldBarcode: ["oldbarcode", "previousbarcode"],
  assetNo: ["assetno", "assetnumber"],
  serialNo: ["serialno", "serialnumber"],
  status: ["currentstatus", "status", "result"],
  lastTestDate: ["lasttestdate", "testdate"],
  lastTestTime: ["lasttesttime", "testtime"],
  frequency: ["frequency", "testfrequency", "interval"],
  testDue: ["testdue", "duedate", "nexttestdue"],
  sequence: ["testsequence", "sequence"],
  comments: ["comments", "comment", "notes"],
  user: ["user", "testedby", "operator", "technician"],
};

function key(text: string): string {
  return text.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** One item of equipment, exactly as the export had it. */
export type Item = Record<Field, string> & {
  /** Which row of the sheet it came off, for saying where a problem is. */
  row: number;
  verdict: Verdict;
};

/**
 * What the status column means.
 *
 * Three outcomes, not two. A blank status, or one nobody recognises, is not a
 * pass — it is an item whose result nobody can state, and a report that
 * silently counts it as passed is a report that says equipment was tested
 * when it may not have been. It goes in its own section and says what the
 * cell actually held.
 */
export type Verdict = "PASS" | "FAIL" | "REVIEW";

const PASSES = new Set(["pass", "passed", "ok", "good", "p", "compliant"]);
const FAILS = new Set([
  "fail",
  "failed",
  "f",
  "faulty",
  "defective",
  "unsafe",
  "outofservice",
  "tagout",
  "taggedout",
  "reject",
  "rejected",
]);

export function verdictOf(status: string): Verdict {
  const at = key(status);
  if (PASSES.has(at)) return "PASS";
  if (FAILS.has(at)) return "FAIL";
  return "REVIEW";
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  PASS: "Passed equipment",
  FAIL: "Failed equipment",
  REVIEW: "Needs review",
};

/* --- reading -------------------------------------------------------------- */

export type Register = {
  items: Item[];
  /** Every customer and site in the file, for choosing between them. */
  groups: { customer: string; site: string; count: number }[];
  /** Headings the export had that nothing here knows about. */
  unknownColumns: string[];
  /** Columns this report prints that the export did not have. */
  missingColumns: Field[];
  /** The tab it was read off, for saying so when it was not the expected one. */
  sheetName: string;
  /** Anything worth telling the person who uploaded it. */
  notes: string[];
};

export class RegisterError extends Error {}

export function readRegister(bytes: Buffer): Register {
  const notes: string[] = [];

  // The named tab first. A file saved from the same software always has it;
  // one that has been through a round of Save As may have a single sheet
  // called something else, and refusing that outright helps nobody — so it is
  // read and the report says which tab it came from.
  const sheets = sheetsOf(bytes);
  let rows = readNamedSheet(bytes, REGISTER_SHEET);
  let sheetName = REGISTER_SHEET;
  if (!rows) {
    rows = readSheet(bytes);
    sheetName = sheets[0]?.name ?? "the first sheet";
    if (rows.length > 0) {
      notes.push(
        `This workbook has no "${REGISTER_SHEET}" tab, so "${sheetName}" was read instead.`,
      );
    }
  }
  if (!rows || rows.length === 0) {
    throw new RegisterError("Nothing could be read out of that spreadsheet.");
  }

  const headerAt = rows.findIndex((row) =>
    row.some((cell) => key(cell) === "barcode") &&
    row.some((cell) => HEADINGS.customer.includes(key(cell)) || key(cell) === "site"),
  );
  if (headerAt < 0) {
    throw new RegisterError(
      "That sheet has no heading row with a Barcode column, so there is no way to tell what each column holds.",
    );
  }

  const header = rows[headerAt];
  const at: Partial<Record<Field | "subLocation", number>> = {};
  const unknownColumns: string[] = [];
  header.forEach((cell, column) => {
    const name = key(cell);
    if (!name) return;
    const field = (Object.keys(HEADINGS) as (Field | "subLocation")[]).find((candidate) =>
      HEADINGS[candidate].includes(name),
    );
    // First one wins: a duplicated heading is the export's problem, and taking
    // the later one would silently prefer whichever happens to be further
    // right.
    if (field) {
      if (at[field] === undefined) at[field] = column;
    } else {
      unknownColumns.push(cell.trim());
    }
  });

  const missingColumns = FIELDS.filter((field) => at[field] === undefined);

  const items: Item[] = [];
  for (let index = headerAt + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const read = (field: Field) => {
      const column = at[field];
      return column === undefined ? "" : (row[column] ?? "").trim();
    };
    const item = Object.fromEntries(FIELDS.map((field) => [field, read(field)])) as Record<
      Field,
      string
    >;
    // A row with no barcode and no description is a blank line in the sheet
    // rather than a piece of equipment.
    if (!item.barcode && !item.description && !item.serialNo) continue;
    items.push({ ...item, row: index + 1, verdict: verdictOf(item.status) });
  }

  if (items.length === 0) {
    throw new RegisterError("That sheet has headings but no equipment under them.");
  }
  if (unknownColumns.length > 0) {
    notes.push(
      `Columns this report does not print: ${unknownColumns.join(", ")}. The data in them is left out.`,
    );
  }
  if (missingColumns.length > 0) {
    notes.push(
      `Not in this export: ${missingColumns
        .map((field) => FIELD_LABELS[field])
        .join(", ")}. Those columns print blank.`,
    );
  }

  return {
    items,
    groups: groupsOf(items),
    unknownColumns,
    missingColumns,
    sheetName,
    notes,
  };
}

/**
 * The customers and sites in the file.
 *
 * An export is usually one customer, but a register pulled across a whole
 * account is not — and relabelling one customer's equipment with another
 * customer's name is the worst thing this report could do. So every pairing is
 * counted and the report says which one it is about.
 */
export function groupsOf(items: Item[]): { customer: string; site: string; count: number }[] {
  const seen = new Map<string, { customer: string; site: string; count: number }>();
  for (const item of items) {
    const customer = item.customer || "(no customer)";
    const site = item.site || "(no site)";
    const id = `${key(customer)}|${key(site)}`;
    const held = seen.get(id);
    if (held) held.count += 1;
    else seen.set(id, { customer, site, count: 1 });
  }
  return [...seen.values()].sort(
    (a, b) => a.customer.localeCompare(b.customer) || a.site.localeCompare(b.site),
  );
}

/** The items belonging to one customer and site, or all of them. */
export function itemsIn(
  items: Item[],
  pick: { customer: string; site: string } | null,
): Item[] {
  if (!pick) return items;
  return items.filter(
    (item) =>
      key(item.customer || "(no customer)") === key(pick.customer) &&
      key(item.site || "(no site)") === key(pick.site),
  );
}

/** Passed, failed and the rest, each in the order the sheet had them. */
export function byVerdict(items: Item[]): Record<Verdict, Item[]> {
  return {
    PASS: items.filter((item) => item.verdict === "PASS"),
    FAIL: items.filter((item) => item.verdict === "FAIL"),
    REVIEW: items.filter((item) => item.verdict === "REVIEW"),
  };
}
