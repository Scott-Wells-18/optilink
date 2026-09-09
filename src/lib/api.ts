import { NextResponse } from "next/server";

/**
 * Small helpers shared by the JSON endpoints the editor talks to. Every PATCH
 * whitelists the fields it will accept, so a stray key in the request body can
 * never reach the database.
 */

export type FieldKind = "string" | "text" | "number" | "boolean" | "date" | "enum";

export type FieldSpec = {
  kind: FieldKind;
  /** Allowed values, for "enum". */
  values?: readonly string[];
  /** Trim to this length before saving. */
  maxLength?: number;
  /** Treat empty strings as null instead of "". */
  nullable?: boolean;
};

export function pickFields(
  body: unknown,
  spec: Record<string, FieldSpec>,
): Record<string, unknown> {
  const source = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(spec)) {
    if (!(key in source)) continue;
    const raw = source[key];

    switch (field.kind) {
      case "string":
      case "text": {
        if (raw === null || raw === undefined) {
          out[key] = field.nullable === false ? "" : null;
          break;
        }
        const value = String(raw).slice(0, field.maxLength ?? (field.kind === "text" ? 20000 : 500));
        out[key] = value.length === 0 && field.nullable !== false ? null : value;
        break;
      }
      case "number": {
        if (raw === null || raw === undefined || raw === "") {
          out[key] = null;
          break;
        }
        const value = Number(raw);
        out[key] = Number.isFinite(value) ? value : null;
        break;
      }
      case "boolean": {
        if (raw === null || raw === undefined) {
          out[key] = null;
          break;
        }
        out[key] = Boolean(raw);
        break;
      }
      case "date": {
        if (!raw) {
          out[key] = null;
          break;
        }
        const value = new Date(String(raw));
        out[key] = Number.isNaN(value.getTime()) ? null : value;
        break;
      }
      case "enum": {
        if (raw === null || raw === undefined) {
          out[key] = null;
          break;
        }
        const value = String(raw);
        if (field.values?.includes(value)) out[key] = value;
        break;
      }
    }
  }

  return out;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(error: unknown, message: string) {
  console.error(message, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
