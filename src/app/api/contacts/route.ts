import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, readJson, serverError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      siteId?: string;
      name?: string;
      phone?: string;
      email?: string;
    };
    if (!body.siteId) return badRequest("Which site is this person at?");
    if (!body.name?.trim()) return badRequest("A name is required.");

    const contact = await prisma.contact.create({
      data: {
        siteId: body.siteId,
        name: body.name.trim().slice(0, 180),
        phone: body.phone?.trim().slice(0, 60) || null,
        email: body.email?.trim().slice(0, 200) || null,
      },
    });
    return NextResponse.json(contact);
  } catch (error) {
    return serverError(error, "That person could not be added.");
  }
}
