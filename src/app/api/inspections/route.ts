import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

/** Start a survey of a site. Everything found on the day hangs off this. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string; name?: string };
    if (!body.siteId) return badRequest("Which site is being inspected?");

    const inspection = await prisma.inspection.create({
      data: {
        siteId: body.siteId,
        name: body.name?.trim().slice(0, 180) || null,
      },
    });
    return NextResponse.json(inspection);
  } catch (error) {
    return serverError(error, "The inspection could not be started.");
  }
}
