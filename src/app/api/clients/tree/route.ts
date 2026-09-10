import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** The whole clients → sites → contacts tree, oldest first at every level. */
export async function GET() {
  const clients = await prisma.client.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      sites: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          location: true,
          contacts: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, phone: true, email: true },
          },
        },
      },
    },
  });

  return NextResponse.json(clients, {
    headers: { "cache-control": "no-store" },
  });
}
