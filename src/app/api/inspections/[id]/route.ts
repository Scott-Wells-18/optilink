import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverError } from "@/lib/api";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.inspection.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "The inspection could not be removed.");
  }
}
