import { prisma } from "@/lib/db";
import { MAX_PHOTOS_PER_STAGE, JOB_STAGES, type JobPhotoStage } from "@/lib/jobs";
import { tidy, titleCase } from "@/lib/writing";
import { day, required, text } from "@/lib/mcp/tools/find";
import { storeImage } from "@/lib/mcp/files";
import type { Tool } from "@/lib/mcp/rpc";

/**
 * Writing up a works record from the outside.
 *
 * This is the one report an assistant can build from end to end, because
 * everything it needs is words and photographs — no instrument export to
 * parse, no board to map tests onto. Say what was found and what was done,
 * hand over the pictures, and the PDF comes out the other side.
 *
 * Nothing here signs anything. A report made this way is a draft: it holds
 * everything it needs, and a person opens it, reads it and issues it. A
 * compliance document carries a licensed person's name, and that name goes on
 * it because they decided to put it there.
 */

const TEXT = { type: "string" } as const;

function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

const PHOTO = {
  type: "object",
  properties: {
    stage: {
      type: "string",
      enum: JOB_STAGES,
      description: "Which part of the story this picture tells.",
    },
    data: {
      ...TEXT,
      description: "The image itself, base64. A data: URL is accepted as well.",
    },
    name: { ...TEXT, description: "What the file was called, if you know." },
  },
  required: ["stage", "data"],
  additionalProperties: false,
} as const;

export const baTools: Tool[] = [
  {
    name: "create_before_after_report",
    title: "Start a before and after report",
    description:
      "Open a works record at a site. It starts empty; add a piece of work to it with add_before_after_item. Nothing is signed — a person issues it.",
    inputSchema: schema(
      {
        siteId: { ...TEXT, description: "From list_sites." },
        date: { ...TEXT, description: "The day the work was done, as 2026-09-24. Defaults to today." },
        name: { ...TEXT, description: "What to call it. Defaults to the date." },
      },
      ["siteId"],
    ),
    async run(input) {
      const siteId = required(input.siteId, "siteId");
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, name: true, client: { select: { name: true } } },
      });
      if (!site) throw new Error("There is no site with that id. Try list_sites.");

      const job = await prisma.job.create({
        data: {
          siteId,
          name: text(input.name)?.slice(0, 180) ?? null,
          ...(text(input.date) ? { date: onDay(text(input.date)!) } : {}),
        },
        select: { id: true, date: true, name: true },
      });

      return {
        reportId: job.id,
        site: site.name,
        client: site.client.name,
        date: day(job.date),
        name: job.name,
        next: "Add each piece of work with add_before_after_item, then call render_report.",
      };
    },
  },

  {
    name: "add_before_after_item",
    title: "Add a piece of work",
    description:
      "One discrete job: what it was, where, how it was found and what was done about it, with the photographs. " +
      "Write the found and done lines as a tradesperson would write them for a client — plain, specific, no filler. " +
      "A before photo and an after photo are both required; up to nine of each stage.",
    inputSchema: schema(
      {
        reportId: { ...TEXT, description: "From create_before_after_report." },
        title: { ...TEXT, description: 'What it was, e.g. "Meal room GPO replaced".' },
        location: { ...TEXT, description: 'Where, e.g. "Meal room, north wall".' },
        found: { ...TEXT, description: "How it was found. One or two sentences." },
        done: { ...TEXT, description: "What was done about it. One or two sentences." },
        photos: {
          type: "array",
          items: PHOTO,
          description: "The pictures. At least one BEFORE and one AFTER.",
        },
      },
      ["reportId", "title", "location", "found", "done", "photos"],
    ),
    async run(input) {
      const reportId = required(input.reportId, "reportId");
      const job = await prisma.job.findUnique({ where: { id: reportId }, select: { id: true } });
      if (!job) throw new Error("There is no report with that id. Make one first.");

      const fields = {
        title: required(input.title, "a title"),
        location: required(input.location, "a location"),
        found: required(input.found, "what was found"),
        done: required(input.done, "what was done"),
      };

      const given = Array.isArray(input.photos) ? input.photos : [];
      const byStage = new Map<JobPhotoStage, { data: string; name?: string }[]>();
      for (const entry of given) {
        const photo = entry as { stage?: string; data?: string; name?: string };
        const stage = JOB_STAGES.find((one) => one === photo.stage);
        if (!stage || !photo.data) continue;
        const held = byStage.get(stage) ?? [];
        if (held.length >= MAX_PHOTOS_PER_STAGE) continue;
        held.push({ data: photo.data, name: photo.name });
        byStage.set(stage, held);
      }

      if (!byStage.get("BEFORE")?.length) throw new Error("A before photo is required.");
      if (!byStage.get("AFTER")?.length) throw new Error("An after photo is required.");

      const photos: { stage: JobPhotoStage; fileId: string; position: number }[] = [];
      for (const stage of JOB_STAGES) {
        const held = byStage.get(stage) ?? [];
        for (const [position, picture] of held.entries()) {
          const file = await storeImage(picture.data, picture.name ?? `${stage}.jpg`);
          photos.push({ stage, fileId: file.id, position });
        }
      }

      const last = await prisma.jobItem.findFirst({
        where: { jobId: reportId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const item = await prisma.jobItem.create({
        data: {
          jobId: reportId,
          // Tidied the same way a typed one is, so a report reads as one
          // document however each piece of work got into it.
          title: titleCase(fields.title).slice(0, 200),
          location: titleCase(fields.location).slice(0, 200),
          found: tidy(fields.found).slice(0, 2000),
          done: tidy(fields.done).slice(0, 2000),
          position: (last?.position ?? -1) + 1,
          photos: { create: photos },
        },
        select: { id: true, title: true, location: true, found: true, done: true },
      });

      return {
        itemId: item.id,
        ...item,
        photos: photos.length,
        dropped: given.length - photos.length,
      };
    },
  },

  {
    name: "set_before_after_recommendations",
    title: "Note anything out of scope",
    description:
      "Anything seen during the works that fell outside what was agreed, listed at the back of the report under Further Recommendations.",
    inputSchema: schema(
      {
        reportId: { ...TEXT, description: "From create_before_after_report." },
        lines: { type: "array", items: TEXT, description: "One recommendation per line." },
      },
      ["reportId", "lines"],
    ),
    async run(input) {
      const reportId = required(input.reportId, "reportId");
      const lines = (Array.isArray(input.lines) ? input.lines : [])
        .map((line) => tidy(String(line)).slice(0, 400))
        .filter(Boolean)
        .slice(0, 40);

      await prisma.job.update({ where: { id: reportId }, data: { recommendations: lines } });
      return { reportId, recommendations: lines };
    },
  },
];

function onDay(value: string): Date {
  const at = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) throw new Error(`"${value}" is not a date. Use 2026-09-24.`);
  return at;
}
