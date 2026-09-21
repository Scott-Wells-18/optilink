import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { LIMIT_SOURCE, type RcdKindKey } from "@/lib/rcd/assess";
import { loadTuning } from "@/lib/rcd/settings";
import { RCD_KIND_LIMITS, type RcdLimits } from "@/lib/standards/rcd";

/**
 * The limits an RCD report is judged against.
 *
 * They are coded from AS/NZS 3017 Table 6.1, but a standard gets revised and a
 * deploy is a poor way to correct a number that has to match the edition on
 * the shelf. So they are editable, they say where they came from, and what
 * they were shipped as is always one button away.
 */

const KEYS = Object.keys(RCD_KIND_LIMITS) as RcdKindKey[];

export async function GET() {
  const tuning = await loadTuning();
  return NextResponse.json(
    {
      limits: tuning.limits,
      concernPercent: tuning.concernPercent,
      defaults: RCD_KIND_LIMITS,
      source: LIMIT_SOURCE,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  try {
    const body = (await readJson(request)) as {
      limits?: Partial<Record<RcdKindKey, Partial<RcdLimits>>>;
      concernPercent?: number;
      reset?: boolean;
    };

    if (body.reset) {
      // DbNull, not undefined: Prisma reads undefined as "leave this alone",
      // which would quietly keep whatever was being reset away from.
      await prisma.settings.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", rcdLimits: Prisma.DbNull, rcdConcernPercent: 80 },
        update: { rcdLimits: Prisma.DbNull, rcdConcernPercent: 80 },
      });
      return NextResponse.json({ ok: true });
    }

    const data: Record<string, unknown> = {};

    if (body.limits) {
      const limits: Partial<Record<RcdKindKey, RcdLimits>> = {};
      for (const key of KEYS) {
        const given = body.limits[key];
        if (!given) continue;
        const shipped = RCD_KIND_LIMITS[key];
        // The labels and the descriptions stay ours; only the numbers move.
        limits[key] = {
          ...shipped,
          maxAtRatedMs: milliseconds(given.maxAtRatedMs) ?? shipped.maxAtRatedMs,
          maxAt5xMs: optional(given.maxAt5xMs, shipped.maxAt5xMs),
          minAtRatedMs: optional(given.minAtRatedMs, shipped.minAtRatedMs),
        };
      }
      data.rcdLimits = limits;
    }

    if (body.concernPercent !== undefined) {
      const percent = Math.round(Number(body.concernPercent));
      if (!Number.isFinite(percent) || percent < 10 || percent > 100) {
        return badRequest("The concern margin has to be between 10% and 100%.");
      }
      data.rcdConcernPercent = percent;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    await prisma.settings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "Those limits could not be saved.");
  }
}

/** A trip time in milliseconds: a positive number, or nothing. */
function milliseconds(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 60_000) return null;
  return Math.round(number);
}

/**
 * A limit that a device type may not have at all — the 5× test does not apply
 * to every one, and only a selective device has a minimum. Cleared on purpose
 * rather than left at what it shipped with.
 */
function optional(value: unknown, shipped: number | null): number | null {
  if (value === null || value === "" || value === undefined) return null;
  return milliseconds(value) ?? shipped;
}
