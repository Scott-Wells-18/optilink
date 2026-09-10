import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Every photo pinned to this board, so the viewer can show counts per position. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const photos = await prisma.boardPhoto.findMany({
    where: { equipmentId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, slot: true, fileId: true, caption: true },
  });
  return NextResponse.json(photos, { headers: { "cache-control": "no-store" } });
}
