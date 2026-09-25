import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Keys for the things that are not people.
 *
 * The app is behind one shared password, which is fine for somebody at a
 * keyboard and no use for a machine: there is no way to tell one caller from
 * another, and no way to stop one without stopping everybody. A token is
 * issued to one thing, named so it is obvious what it is for, and revoked on
 * its own.
 *
 * Only the hash is stored, so a copy of the table is not a copy of the keys.
 * The token is shown once, when it is made, and cannot be got back after that.
 */

const PREFIX = "optl_";

/** Long enough that guessing is not worth anybody's time. */
const BYTES = 32;

export type IssuedToken = {
  id: string;
  name: string;
  /** The only time this is ever available. */
  token: string;
};

export async function issueToken(name: string): Promise<IssuedToken> {
  const token = `${PREFIX}${randomBytes(BYTES).toString("base64url")}`;
  const row = await prisma.apiToken.create({
    data: {
      name: name.trim().slice(0, 80) || "Unnamed",
      hash: hashOf(token),
      prefix: token.slice(0, PREFIX.length + 6),
    },
    select: { id: true, name: true },
  });
  return { ...row, token };
}

export type Caller = { id: string; name: string };

/**
 * Who is calling, or null.
 *
 * The hash is looked up rather than compared one by one, so the work does not
 * grow with the number of tokens issued; the constant-time compare afterwards
 * is belt and braces on the one row that came back.
 *
 * The last-used stamp is written without being waited on: it is for the person
 * reading the list later, and a slow write should not hold up a call.
 */
export async function callerFor(header: string | null): Promise<Caller | null> {
  const token = bearer(header);
  if (!token) return null;

  const row = await prisma.apiToken.findUnique({
    where: { hash: hashOf(token) },
    select: { id: true, name: true, hash: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  if (!sameString(row.hash, hashOf(token))) return null;

  void prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { id: row.id, name: row.name };
}

export async function revokeToken(id: string): Promise<void> {
  await prisma.apiToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function listTokens() {
  return prisma.apiToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(/\s+/, 2);
  if (!value || scheme.toLowerCase() !== "bearer") return null;
  return value.startsWith(PREFIX) ? value : null;
}

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant time, so a wrong token gives nothing away by how long it took. */
function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
