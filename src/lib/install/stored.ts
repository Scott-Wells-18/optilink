import type { InstallRow } from "@/lib/install/parse";
import type { Exclusion } from "@/lib/install/points";
import {
  analyse,
  recordId,
  type Analysis,
  type Arrangements,
  type Assignment,
  type Input,
  type MarkEntry,
  type Phases,
  type Section,
  type TestFile,
  type Verification,
} from "@/lib/install/session";

/**
 * An installation report as stored, read back as the analysis input.
 *
 * A report made before uploads were separated holds one mixed export in
 * `sourceId` and `rows`, with its exclusions keyed by S number. It is read as
 * a single "mixed" file, its records routed by their own function, and its
 * exclusions carried across as marks — so an older report still opens and
 * builds, and adding a file to it turns it into a sectioned one.
 */

type Stored = {
  phases: Phases;
  files?: unknown;
  rows?: unknown;
  exclusions?: unknown;
  marks?: unknown;
  arrangements?: unknown;
  groupNames?: unknown;
  assignments?: unknown;
  verification?: unknown;
  sourceId?: string | null;
  source?: { originalName: string } | null;
};

const object = <T>(value: unknown): T =>
  (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as T;

export function filesOf(report: Stored): TestFile[] {
  if (Array.isArray(report.files)) return report.files as TestFile[];
  const rows = Array.isArray(report.rows) ? (report.rows as InstallRow[]) : [];
  if (rows.length === 0) return [];
  return [
    {
      fileId: report.sourceId ?? "legacy",
      originalName: report.source?.originalName ?? "Tester export",
      section: "MIXED",
      rows,
      excludeFirst: false,
      dummyConfirmed: true,
    },
  ];
}

export function marksOf(report: Stored): Record<string, MarkEntry> {
  const marks = { ...object<Record<string, MarkEntry>>(report.marks) };
  if (!Array.isArray(report.files) && Array.isArray(report.exclusions)) {
    const fileId = report.sourceId ?? "legacy";
    for (const exclusion of report.exclusions as Exclusion[]) {
      const id = recordId(fileId, exclusion.name);
      if (!marks[id]) marks[id] = { mark: "ACCIDENTAL", reason: exclusion.reason };
    }
  }
  return marks;
}

export function inputOf(report: Stored): Input {
  return {
    phases: report.phases,
    files: filesOf(report),
    marks: marksOf(report),
    arrangements: object<Partial<Arrangements>>(report.arrangements),
    groupNames: object<Partial<Record<Section, string[]>>>(report.groupNames),
    assignments: object<Record<string, Assignment>>(report.assignments),
    verification: object<Verification>(report.verification),
  };
}

export function analysisOf(report: Stored): Analysis {
  return analyse(inputOf(report));
}

/** Every uploaded file the report holds, so removing the report releases them. */
export function fileIdsOf(report: Stored): string[] {
  const ids = filesOf(report)
    .map((file) => file.fileId)
    .filter((id) => id !== "legacy");
  if (report.sourceId && !ids.includes(report.sourceId)) ids.push(report.sourceId);
  return ids;
}
