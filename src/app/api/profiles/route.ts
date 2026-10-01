import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readProfile } from "@/lib/profiles";
import { ensureProfiles } from "@/lib/profiles.server";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureProfiles();
    const profiles = await prisma.profile.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { signatureFile: { select: { id: true, originalName: true } } },
    });
    return NextResponse.json(profiles);
  } catch (error) {
    return serverError(error, "Those profiles could not be read.");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const data = readProfile(body);
    if (!data.firstName || !data.lastName) {
      return badRequest("A profile needs a first name and a last name.");
    }

    const last = await prisma.profile.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    // Only one person is the director. Taking it means the other one loses it,
    // rather than the save being refused for something nobody meant to do.
    if (data.director) await prisma.profile.updateMany({ data: { director: false } });

    const profile = await prisma.profile.create({
      data: { ...data, position: (last?.position ?? -1) + 1 },
    });
    return NextResponse.json(profile);
  } catch (error) {
    return serverError(error, "That profile could not be saved.");
  }
}
