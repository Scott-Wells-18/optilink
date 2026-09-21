import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";
import { BY_CODE } from "@/lib/safety/catalogue";

/** Start a set of safe work paperwork for a job at a site. */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { siteId?: string; codes?: string[] };
    if (!body.siteId) return badRequest("Which site is the job at?");

    const codes = (body.codes ?? []).filter((code) => BY_CODE.has(code));
    const doc = await prisma.safetyDoc.create({ data: { siteId: body.siteId, codes } });
    return NextResponse.json(doc);
  } catch (error) {
    return serverError(error, "That paperwork could not be started.");
  }
}
