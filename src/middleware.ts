import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { siteUrl } from "@/lib/siteUrl";

/** Reachable without signing in. "/" is the sign-in screen itself. */
const PUBLIC_PATHS = ["/", "/api/auth/login", "/api/auth/logout", "/api/health"];

/**
 * The door for things that are not people.
 *
 * An assistant has no session cookie and no way to get one. It carries a
 * bearer token instead, which the endpoint itself checks against the tokens
 * that have been issued — so the cookie gate steps aside here rather than
 * turning away a caller it has no way to recognise. Nothing behind this path
 * is reachable without a valid token.
 */
const TOKEN_PATHS = ["/api/mcp"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (TOKEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const loginUrl = siteUrl(request, "/");
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
