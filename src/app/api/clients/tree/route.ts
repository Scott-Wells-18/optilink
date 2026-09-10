import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * The whole clients → sites → equipment tree, oldest first at every level,
 * plus each site's inspections. Issues come through without their photos —
 * enough to count them in the tree, and the board loads the rest when opened.
 */
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
          equipment: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              kind: true,
              name: true,
              description: true,
              circuitLoading: true,
              board: true,
            },
          },
          inspections: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              date: true,
              issues: { select: { id: true, equipmentId: true, slot: true, type: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(clients, {
    headers: { "cache-control": "no-store" },
  });
}
