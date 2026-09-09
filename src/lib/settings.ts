import { cache } from "react";
import { prisma } from "@/lib/db";

export const getSettings = cache(async () => {
  const existing = await prisma.settings.findUnique({
    where: { id: "singleton" },
    include: { logo: true, logoMark: true },
  });
  if (existing) return existing;

  return prisma.settings.create({
    data: { id: "singleton" },
    include: { logo: true, logoMark: true },
  });
});

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;

export function companyAddress(settings: AppSettings): string {
  // A lone state (the default "NSW") is not an address — leave it off entirely.
  const locality =
    settings.suburb || settings.postcode
      ? [settings.suburb, settings.state, settings.postcode].filter(Boolean).join(" ")
      : "";
  return [settings.addressLine1, settings.addressLine2, locality]
    .filter((line) => line && line.trim())
    .join(", ");
}

/**
 * Report references look like OPT-2026-0007. Allocated inside a transaction so
 * two people saving at once cannot land on the same number.
 */
export async function nextReportReference(): Promise<string> {
  const year = new Date().getFullYear();
  const settings = await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", nextReportNumber: 2 },
    update: { nextReportNumber: { increment: 1 } },
  });
  const number = settings.nextReportNumber - 1 || 1;
  return `OPT-${year}-${String(number).padStart(4, "0")}`;
}
