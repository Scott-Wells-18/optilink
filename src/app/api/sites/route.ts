import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      clientId?: string;
      name?: string;
      location?: string;
    };
    if (!body.clientId) return badRequest("Which client is this site for?");
    if (!body.name?.trim()) return badRequest("A site name is required.");

    const site = await prisma.site.create({
      data: {
        clientId: body.clientId,
        name: body.name.trim().slice(0, 180),
        location: body.location?.trim().slice(0, 300) || null,
      },
    });
    return NextResponse.json(site);
  } catch (error) {
    return serverError(error, "The site could not be added.");
  }
}
