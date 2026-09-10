import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { siteUrl } from "@/lib/siteUrl";

export async function POST(request: Request) {
  const response = NextResponse.redirect(siteUrl(request, "/"), { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
