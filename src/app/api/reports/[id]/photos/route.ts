import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as {
      fileId?: string;
      kind?: string;
      pairKey?: string;
      title?: string;
    };
    if (!body.fileId) return badRequest("No image was supplied.");

    const kind =
      body.kind === "BEFORE" || body.kind === "AFTER" ? body.kind : "GENERAL";
    const count = await prisma.photo.count({ where: { reportId: id } });

    const photo = await prisma.photo.create({
      data: {
        reportId: id,
        sortOrder: count,
        fileId: body.fileId,
        kind,
        pairKey: body.pairKey?.slice(0, 60) || null,
        title: body.title?.slice(0, 160) || null,
      },
      include: { file: true },
    });
    return NextResponse.json(photo);
  } catch (error) {
    return serverError(error, "The photo could not be added.");
  }
}
