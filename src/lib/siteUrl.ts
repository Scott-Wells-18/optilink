/**
 * Builds an absolute URL for this app from the address the browser actually
 * asked for.
 *
 * Behind a proxy the app sees an internal address — on Railway that is
 * localhost:8080 — so redirects built from the incoming request URL sent people
 * to a dead page. The forwarded headers carry the real host and scheme.
 */
export function siteUrl(request: Request, path: string): URL {
  const forwardedHost = first(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return new URL(path, request.url);

  const requestProtocol = safeProtocol(request.url);
  const protocol = first(request.headers.get("x-forwarded-proto")) ?? requestProtocol;
  return new URL(path, `${protocol}://${host}`);
}

/** Proxies may send a comma-separated list; the first entry is the client's. */
function first(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function safeProtocol(url: string): string {
  try {
    return new URL(url).protocol.replace(":", "") || "https";
  } catch {
    return "https";
  }
}
