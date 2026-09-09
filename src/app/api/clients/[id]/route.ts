import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pickFields, readJson, serverError } from "@/lib/api";
import { CLIENT_FIELDS } from "@/lib/fieldSpecs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = pickFields(await readJson(request), CLIENT_FIELDS);
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });
    await prisma.client.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "Those client details could not be saved.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const reports = await prisma.report.count({ where: { clientId: id } });
    if (reports > 0) {
      // Reports reference this client, so archive instead of destroying history.
      await prisma.client.update({ where: { id }, data: { archived: true } });
      return NextResponse.json({ ok: true, archived: true, reports });
    }
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ ok: true, archived: false });
  } catch (error) {
    return serverError(error, "The client could not be removed.");
  }
}
