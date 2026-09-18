import { prisma } from "@/lib/db";
import { RCD_KIND_LIMITS, type RcdLimits } from "@/lib/standards/rcd";
import { DEFAULT_TUNING, type RcdKindKey, type Tuning } from "@/lib/rcd/assess";

/**
 * The limits a report is judged against.
 *
 * They default to AS/NZS 3017 as coded in lib/standards/rcd, but are held in
 * settings so they can be corrected against the edition of the standard on the
 * shelf without waiting on a deploy.
 */
export async function loadTuning(): Promise<Tuning> {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
    if (!settings) return DEFAULT_TUNING;

    const stored = settings.rcdLimits as Partial<Record<RcdKindKey, RcdLimits>> | null;
    const limits = { ...RCD_KIND_LIMITS };
    if (stored) {
      for (const key of Object.keys(limits) as RcdKindKey[]) {
        if (stored[key]) limits[key] = { ...limits[key], ...stored[key] };
      }
    }
    const percent = settings.rcdConcernPercent;
    return {
      limits,
      concernPercent: percent >= 10 && percent <= 100 ? percent : 80,
    };
  } catch {
    return DEFAULT_TUNING;
  }
}
