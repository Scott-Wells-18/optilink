import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest, pickFields, readJson, serverError } from "@/lib/api";
import { CLIENT_FIELDS } from "@/lib/fieldSpecs";

export async function GET() {
  const clients = await prisma.client.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, suburb: true, state: true },
  });
  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  try {
    const data = pickFields(await readJson(request), CLIENT_FIELDS);
    if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
      return badRequest("A client name is required.");
    }
    const client = await prisma.client.create({ data: data as { name: string } });
    return NextResponse.json(client);
  } catch (error) {
    return serverError(error, "The client could not be created.");
  }
}
