import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson, serverError } from "@/lib/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await readJson(request)) as { thermalImageId?: string };
    const count = await prisma.thermalFinding.count({ where: { reportId: id } });
    const finding = await prisma.thermalFinding.create({
      data: {
        reportId: id,
        sortOrder: count,
        thermalImageId: body.thermalImageId || null,
      },
      include: { thermalImage: true, visualImage: true },
    });
    return NextResponse.json(finding);
  } catch (error) {
    return serverError(error, "The finding could not be added.");
  }
}
