import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverError } from "@/lib/api";
import { releaseFiles } from "@/lib/storage";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const photos = await prisma.jobPhoto.findMany({
      where: { itemId: id },
      select: { fileId: true },
    });
    await prisma.jobItem.delete({ where: { id } });
    await releaseFiles(photos.map((photo) => photo.fileId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That work could not be removed.");
  }
}
