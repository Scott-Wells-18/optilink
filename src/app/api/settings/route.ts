import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pickFields, readJson, serverError } from "@/lib/api";
import { SETTINGS_FIELDS } from "@/lib/fieldSpecs";
import { sanitiseColour } from "@/components/BrandStyle";

export async function PATCH(request: Request) {
  try {
    const data = pickFields(await readJson(request), SETTINGS_FIELDS);
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    if ("primaryColour" in data) {
      data.primaryColour = sanitiseColour(data.primaryColour as string, "#0B3B60");
    }
    if ("accentColour" in data) {
      data.accentColour = sanitiseColour(data.accentColour as string, "#F5A623");
    }

    await prisma.settings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "Those settings could not be saved.");
  }
}
