import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { PRESET_BY_ID, type Edits, type Selection } from "@/lib/safety/presets";

export const runtime = "nodejs";

/**
 * A preset somebody wrote themselves.
 *
 * The built-in twenty-four cover the work that comes up everywhere. This is
 * for the job that comes up at one client and nowhere else: the selection
 * that was made and the wording that was typed over the top of it, saved
 * under a name and offered beside the built-in ones from then on.
 *
 * It saves the selection, not the composed paragraphs. Composition still
 * happens from the selection every time, so a custom preset picks up a
 * correction to the shared wording the same way a built-in one does — and
 * what it does keep, the edits, are kept against the wording they were edits
 * of, so an edit stops being applied if what it was an edit of has changed.
 */

function readSelection(value: unknown): Selection | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const presetId = typeof body.presetId === "string" ? body.presetId : "";
  if (!PRESET_BY_ID.has(presetId)) return null;

  const strings = (key: string): string[] =>
    Array.isArray(body[key])
      ? (body[key] as unknown[]).filter((item): item is string => typeof item === "string")
      : [];

  return {
    presetId,
    alsoIds: strings("alsoIds"),
    methods: strings("methods").filter(
      (method): method is "RCD" | "THERMAL" | "MEASURE" =>
        method === "RCD" || method === "THERMAL" || method === "MEASURE",
    ),
    modifierIds: strings("modifierIds"),
    answers: readFollowUps(body.answers),
  };
}

/** The follow-up answers saved with the activities, as plain id → value. */
function readFollowUps(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, answer] of Object.entries(value as Record<string, unknown>)) {
    if (typeof answer === "string" && answer.length <= 40) out[id.slice(0, 40)] = answer;
  }
  return out;
}

function readEdits(value: unknown): Edits {
  if (!value || typeof value !== "object") return {};
  const out: Edits = {};
  for (const [id, edit] of Object.entries(value as Record<string, unknown>)) {
    if (!edit || typeof edit !== "object") continue;
    const { source, text } = edit as Record<string, unknown>;
    if (typeof source !== "string" || typeof text !== "string") continue;
    out[id] = { source, text: text.slice(0, 20000) };
  }
  return out;
}

export async function GET() {
  try {
    const presets = await prisma.safetyPreset.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(presets);
  } catch (error) {
    return serverError(error, "Those presets could not be read.");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      name?: string;
      selection?: unknown;
      edits?: unknown;
    };
    const name = (body.name ?? "").trim().slice(0, 120);
    if (!name) return badRequest("Give the preset a name.");

    const selection = readSelection(body.selection);
    if (!selection) return badRequest("That preset has no main job on it.");

    // Saving over a preset of the same name replaces it, which is what
    // somebody means when they save twice under one name.
    const preset = await prisma.safetyPreset.upsert({
      where: { name },
      create: { name, selection, edits: readEdits(body.edits) },
      update: { selection, edits: readEdits(body.edits) },
    });
    return NextResponse.json(preset);
  } catch (error) {
    return serverError(error, "That preset could not be saved.");
  }
}
