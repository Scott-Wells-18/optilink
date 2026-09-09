import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Railway's health check hits this. It is deliberately outside the password gate. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "connected" });
  } catch {
    return NextResponse.json({ ok: false, database: "unreachable" }, { status: 503 });
  }
}
