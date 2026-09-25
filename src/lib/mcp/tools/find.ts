import { prisma } from "@/lib/db";
import { describeBoard, normaliseBoard } from "@/lib/board";
import type { Tool } from "@/lib/mcp/rpc";

/**
 * Finding your way around.
 *
 * An assistant is told "the Kogarah job", not an id, so everything starts
 * here: what clients there are, what sites they have, what is on a site and
 * what has already been done there. Every one of these reads and nothing
 * more, so a client can run them without asking anybody first.
 *
 * Ids come back with every row, because the tools that write things need them
 * and there is no other way to get one.
 */

const TEXT = { type: "string" } as const;

function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

export const findTools: Tool[] = [
  {
    name: "list_clients",
    title: "List clients",
    readOnly: true,
    description:
      "Every client on the books, with how many sites each one has. Start here when you only have a name.",
    inputSchema: schema({
      search: { ...TEXT, description: "Only clients whose name contains this." },
    }),
    async run(input) {
      const search = text(input.search);
      const clients = await prisma.client.findMany({
        where: {
          archived: false,
          ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          contactName: true,
          suburb: true,
          _count: { select: { sites: true } },
        },
      });
      return clients.map((client) => ({
        id: client.id,
        name: client.name,
        contact: client.contactName,
        suburb: client.suburb,
        sites: client._count.sites,
      }));
    },
  },

  {
    name: "list_sites",
    title: "List sites",
    readOnly: true,
    description:
      "The sites for a client, or across every client. A site is the place someone would be sent to.",
    inputSchema: schema({
      clientId: { ...TEXT, description: "From list_clients. Leave out for every site." },
      search: { ...TEXT, description: "Only sites whose name contains this." },
    }),
    async run(input) {
      const search = text(input.search);
      const sites = await prisma.site.findMany({
        where: {
          ...(text(input.clientId) ? { clientId: text(input.clientId)! } : {}),
          ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
        },
        orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          location: true,
          client: { select: { id: true, name: true } },
          contacts: { select: { name: true, email: true, phone: true } },
          _count: { select: { equipment: true, jobs: true, inspections: true } },
        },
      });
      return sites.map((site) => ({
        id: site.id,
        name: site.name,
        where: site.location,
        client: site.client,
        contacts: site.contacts,
        boards: site._count.equipment,
        beforeAndAfterReports: site._count.jobs,
        thermalInspections: site._count.inspections,
      }));
    },
  },

  {
    name: "list_boards",
    title: "List switchboards",
    readOnly: true,
    description:
      "What is drawn up at a site: switchboards, appliances and motors, with a summary of what each board carries.",
    inputSchema: schema({ siteId: { ...TEXT, description: "From list_sites." } }, ["siteId"]),
    async run(input) {
      const siteId = required(input.siteId, "siteId");
      const gear = await prisma.equipment.findMany({
        where: { siteId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, kind: true, board: true, supply: true },
      });
      return gear.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        drawnUp:
          item.kind === "SWITCHBOARD" && item.board
            ? describeBoard(normaliseBoard(item.board))
            : null,
        supplyRecorded: Boolean(item.supply),
      }));
    },
  },

  {
    name: "list_instruments",
    title: "List our test gear",
    readOnly: true,
    description:
      "The instruments in the van, with their calibration dates. A report that quotes a measurement names one of these.",
    inputSchema: schema({}),
    async run() {
      const gear = await prisma.testEquipment.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          serialNo: true,
          modelNo: true,
          calibratedOn: true,
          expiresOn: true,
          certFileId: true,
        },
      });
      return gear.map((item) => ({
        id: item.id,
        name: item.name,
        serialNo: item.serialNo,
        modelNo: item.modelNo,
        calibratedOn: day(item.calibratedOn),
        expiresOn: day(item.expiresOn),
        hasCertificate: Boolean(item.certFileId),
        inCalibration: item.expiresOn ? item.expiresOn >= new Date() : null,
      }));
    },
  },

  {
    name: "list_reports",
    title: "List reports at a site",
    readOnly: true,
    description:
      "Everything already filed at a site, of every kind: before and after, thermal, RCD, power analysis and safe work paperwork.",
    inputSchema: schema(
      {
        siteId: { ...TEXT, description: "From list_sites." },
        kind: {
          type: "string",
          enum: ["ALL", "BEFORE_AFTER", "THERMAL", "RCD", "POWER", "SAFETY"],
          description: "Narrow it to one kind. Defaults to all of them.",
        },
      },
      ["siteId"],
    ),
    async run(input) {
      const siteId = required(input.siteId, "siteId");
      const kind = text(input.kind) ?? "ALL";
      const wants = (what: string) => kind === "ALL" || kind === what;

      const [jobs, inspections, rcd, power, safety] = await Promise.all([
        wants("BEFORE_AFTER")
          ? prisma.job.findMany({
              where: { siteId },
              orderBy: { date: "desc" },
              select: { id: true, name: true, date: true, _count: { select: { items: true } } },
            })
          : [],
        wants("THERMAL")
          ? prisma.inspection.findMany({
              where: { siteId },
              orderBy: { date: "desc" },
              select: { id: true, date: true, _count: { select: { issues: true } } },
            })
          : [],
        wants("RCD")
          ? prisma.rcdReport.findMany({
              where: { siteId },
              orderBy: { date: "desc" },
              select: { id: true, name: true, date: true, _count: { select: { tests: true } } },
            })
          : [],
        wants("POWER")
          ? prisma.powerAnalysis.findMany({
              where: { siteId },
              orderBy: { createdAt: "desc" },
              select: { id: true, createdAt: true, brief: true, equipmentId: true },
            })
          : [],
        wants("SAFETY")
          ? prisma.safetyDoc.findMany({
              where: { siteId },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                jobTitle: true,
                projectName: true,
                codes: true,
                createdAt: true,
              },
            })
          : [],
      ]);

      return {
        beforeAndAfter: jobs.map((job) => ({
          id: job.id,
          name: job.name,
          date: day(job.date),
          items: job._count.items,
        })),
        thermal: inspections.map((one) => ({
          id: one.id,
          date: day(one.date),
          findings: one._count.issues,
        })),
        rcd: rcd.map((one) => ({
          id: one.id,
          name: one.name,
          date: day(one.date),
          boards: one._count.tests,
        })),
        power: power.map((one) => ({
          id: one.id,
          recorded: day(one.createdAt),
          brief: one.brief,
          boardId: one.equipmentId,
        })),
        safety: safety.map((one) => ({
          id: one.id,
          title: one.jobTitle ?? one.projectName,
          documents: one.codes,
          created: day(one.createdAt),
        })),
      };
    },
  },
];

/* --- small shared helpers ------------------------------------------------- */

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function required(value: unknown, name: string): string {
  const found = text(value);
  if (!found) throw new Error(`This needs ${name}. Use the listing tools to find one.`);
  return found;
}

export function day(at: Date | null | undefined): string | null {
  return at ? at.toISOString().slice(0, 10) : null;
}
