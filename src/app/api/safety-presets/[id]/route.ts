import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Throwing a custom preset away.
 *
 * Nothing issued against it changes. A document was built from the selection
 * that was saved on the job, not from the preset — the preset only ever put
 * that selection there in the first place.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.safetyPreset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error, "That preset could not be deleted.");
  }
}
