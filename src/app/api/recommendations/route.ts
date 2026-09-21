import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { ISSUE_CAUSES } from "@/lib/issues";
import { tidy } from "@/lib/writing";

/**
 * The recommendations written on site and kept.
 *
 * They are held against a cause rather than against a board, so one written
 * at a depot in March is offered at the next depot in June — which is the
 * point of keeping them at all.
 */

export async function GET(request: Request) {
  const cause = new URL(request.url).searchParams.get("cause");
  const held = await prisma.customRecommendation.findMany({
    where: cause ? { cause } : undefined,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(held, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { cause?: string; text?: string };
    if (!body.cause || !ISSUE_CAUSES.includes(body.cause as never)) {
      return badRequest("What is that a recommendation for?");
    }

    // Tidied the same way a typed note is, so a list of them reads as one
    // voice rather than as whoever happened to be holding the phone.
    const text = tidy(body.text ?? "").slice(0, 300);
    if (text.length < 4) return badRequest("That is too short to be a recommendation.");

    const held = await prisma.customRecommendation.upsert({
      where: { cause_text: { cause: body.cause, text } },
      create: { cause: body.cause, text },
      update: {},
    });
    return NextResponse.json(held);
  } catch (error) {
    return serverError(error, "That could not be saved.");
  }
}
