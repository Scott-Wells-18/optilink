import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverError } from "@/lib/api";

/** Everything found during one inspection, with its photos. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const issues = await prisma.issue.findMany({
      where: { inspectionId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        equipmentId: true,
        slot: true,
        type: true,
        cause: true,
        recommendations: true,
        note: true,
        photos: {
          orderBy: { createdAt: "asc" },
          select: { id: true, kind: true, fileId: true },
        },
      },
    });
    return NextResponse.json(issues, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return serverError(error, "Those findings could not be loaded.");
  }
}
