import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readDay, readJson, serverError } from "@/lib/api";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      name?: string;
      serialNo?: string;
      modelNo?: string;
      certFileId?: string | null;
      photoFileId?: string | null;
      calibratedOn?: string | null;
      expiresOn?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim().slice(0, 180);
    }
    for (const key of ["serialNo", "modelNo"] as const) {
      if (key in body) data[key] = body[key]?.trim().slice(0, 80) || null;
    }
    for (const key of ["certFileId", "photoFileId"] as const) {
      if (key in body) data[key] = body[key] || null;
    }
    for (const key of ["calibratedOn", "expiresOn"] as const) {
      if (key in body) data[key] = readDay(body[key]);
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    await prisma.testEquipment.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "Those changes could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.testEquipment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
