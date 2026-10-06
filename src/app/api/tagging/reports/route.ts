import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Our own registers, newest first.
 *
 * Separate from the client ones because they belong to nobody: a client
 * report hangs off a site and comes down the clients tree with everything
 * else, and ours hangs off the company.
 */
export async function GET() {
  const reports = await prisma.tagReport.findMany({
    where: { kind: "INTERNAL" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      date: true,
      customer: true,
      siteLabel: true,
      itemCount: true,
      passCount: true,
      failCount: true,
      reviewCount: true,
      preparedBy: true,
      notes: true,
      source: { select: { originalName: true } },
    },
  });
  return NextResponse.json(reports);
}
