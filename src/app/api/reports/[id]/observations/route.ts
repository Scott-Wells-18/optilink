import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverError } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const count = await prisma.observation.count({ where: { reportId: id } });
    const observation = await prisma.observation.create({
      data: { reportId: id, sortOrder: count },
      include: { photo: true },
    });
    return NextResponse.json(observation);
  } catch (error) {
    return serverError(error, "The observation could not be added.");
  }
}
