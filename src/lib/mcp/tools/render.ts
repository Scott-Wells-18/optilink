import { buildJobReport, loadJobReport } from "@/lib/report/ba";
import { buildReport } from "@/lib/report/pdf";
import { loadReport } from "@/lib/report/data";
import { buildRcdReport, loadRcdReport } from "@/lib/report/rcd";
import { buildPowerReport, loadPowerReport } from "@/lib/report/power";
import { required } from "@/lib/mcp/tools/find";
import type { Tool } from "@/lib/mcp/rpc";

/**
 * Handing the finished document back.
 *
 * A PDF does not belong in a chat message: a works record runs to several
 * megabytes of photographs, and base64 makes it a third bigger again. So what
 * comes back is a link into the app, which is where the person is going to
 * open it anyway.
 *
 * The report is built rather than just linked to, because building it is the
 * only way to know it can be built. An assistant that says "here is your
 * report" and hands over a link to an error is worse than one that says what
 * is missing.
 */

const KINDS = ["BEFORE_AFTER", "THERMAL", "RCD", "POWER"] as const;
type Kind = (typeof KINDS)[number];

const PATHS: Record<Kind, string> = {
  BEFORE_AFTER: "jobs",
  THERMAL: "inspections",
  RCD: "rcd-reports",
  POWER: "power",
};

export const renderTools: Tool[] = [
  {
    name: "render_report",
    title: "Build a report",
    description:
      "Build a report and hand back a link to it. Use this once everything is in, to check it comes out and to give the person somewhere to open it.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: KINDS, description: "Which kind of report." },
        reportId: { type: "string", description: "The id the creating tool gave back." },
      },
      required: ["kind", "reportId"],
      additionalProperties: false,
    },
    async run(input) {
      const id = required(input.reportId, "reportId");
      const kind = KINDS.find((one) => one === input.kind);
      if (!kind) throw new Error(`kind must be one of ${KINDS.join(", ")}.`);

      const pages = await build(kind, id);
      return {
        kind,
        reportId: id,
        pages,
        url: `${base()}/api/${PATHS[kind]}/${id}/report`,
        note: "Nothing is signed. Open it in OptiLink, read it, and issue it from there.",
      };
    },
  },
];

async function build(kind: Kind, id: string): Promise<number> {
  if (kind === "BEFORE_AFTER") {
    const data = await loadJobReport(id);
    if (!data) throw new Error("There is no before and after report with that id.");
    return countPages(await buildJobReport(data));
  }
  if (kind === "THERMAL") {
    const data = await loadReport(id);
    if (!data) throw new Error("There is no thermal inspection with that id.");
    return countPages(await buildReport(data));
  }
  if (kind === "RCD") {
    const data = await loadRcdReport(id);
    if (!data) throw new Error("There is no RCD report with that id.");
    return countPages(await buildRcdReport(data));
  }
  // The power analysis gates itself: it will not issue until the board's
  // supply details are all recorded. It says which ones are short, so that is
  // what comes back rather than a bare failure.
  const loaded = await loadPowerReport(id);
  if (!loaded.ok) throw new Error(loaded.reason);
  return countPages(await buildPowerReport(loaded.report));
}

/**
 * How long it came out, without opening it properly.
 *
 * Counting the page objects is enough to say "eleven pages" in the answer,
 * and it costs nothing next to having just built the thing.
 */
function countPages(pdf: Buffer): number {
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return matches?.length ?? 0;
}

function base(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
