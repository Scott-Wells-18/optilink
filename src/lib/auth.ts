/**
 * Single shared password, signed cookie session.
 *
 * Uses Web Crypto only, so the same helpers run in the Edge middleware and in
 * Node route handlers.
 */

export const SESSION_COOKIE = "optilink_session";

/**
 * Until APP_PASSWORD / SESSION_SECRET are set on the host, OptiLink falls back
 * to these so the app still boots and can be looked at. The sign-in screen says
 * loudly when the fallback is in use.
 */
const DEFAULT_PASSWORD = "123";
const DEFAULT_SECRET = "optilink-unconfigured-session-secret-please-set-SESSION_SECRET";

export function usingDefaultPassword(): boolean {
  return !process.env.APP_PASSWORD;
}

export function usingDefaultSecret(): boolean {
  return !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16;
}

const encoder = new TextEncoder();

function sessionHours(): number {
  const raw = Number(process.env.SESSION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 72;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  return value && value.length >= 16 ? value : DEFAULT_SECRET;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<{ token: string; maxAge: number }> {
  const maxAge = Math.floor(sessionHours() * 3600);
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ iat: Date.now(), exp: Date.now() + maxAge * 1000 }),
    ),
  );
  const signature = await hmac(payload);
  return { token: `${payload}.${signature}`, maxAge };
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  let expected: string;
  try {
    expected = await hmac(payload);
  } catch {
    return false;
  }
  if (!safeEqual(signature, expected)) return false;

  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

/** Compares the submitted password against APP_PASSWORD without leaking timing. */
export async function checkPassword(submitted: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD || DEFAULT_PASSWORD;
  // Hash both sides first so the comparison length never depends on the secret.
  const [a, b] = await Promise.all([digest(submitted), digest(expected)]);
  return safeEqual(a, b);
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64UrlEncode(new Uint8Array(hash));
}
