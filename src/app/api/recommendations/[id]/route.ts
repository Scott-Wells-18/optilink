import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverError } from "@/lib/api";

/**
 * Forgetting one.
 *
 * Findings that already carry it are unaffected — they hold the words, not a
 * reference to this row — so dropping one from the library never changes a
 * report that has been issued.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await prisma.customRecommendation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That could not be removed.");
  }
}
