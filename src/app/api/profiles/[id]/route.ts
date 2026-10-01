import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { readProfile } from "@/lib/profiles";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    const data = readProfile(body);
    if (!data.firstName || !data.lastName) {
      return badRequest("A profile needs a first name and a last name.");
    }

    // Only one person is the director.
    if (data.director) {
      await prisma.profile.updateMany({ where: { id: { not: id } }, data: { director: false } });
    }

    const profile = await prisma.profile.update({ where: { id }, data });
    return NextResponse.json(profile);
  } catch (error) {
    return serverError(error, "That profile could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.profile.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That profile could not be removed.");
  }
}
