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

/**
 * "2025-12-12" out of a date input, kept as that day.
 *
 * Not as a moment: a calibration lapses on a day, and turning it into midnight
 * somewhere else moves it by one.
 */
export function readDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const at = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(at.getTime()) ? null : at;
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

/**
 * A PDF, offered for download under a name the client can read.
 *
 * The name goes out twice over. `filename*` carries it in full, commas,
 * apostrophes and all; the plain `filename` beside it is stripped back to what
 * an older reader can cope with, because a reader that does not understand
 * `filename*` will take the plain one literally — which is how a percent-
 * encoded name ends up saved as "Kogarah%20Depot.pdf".
 */
export function pdfResponse(pdf: Buffer, name: string) {
  return fileResponse(pdf, name, "application/pdf");
}

/** Any generated file, handed back as a download under its own name. */
export function fileResponse(bytes: Buffer, name: string, mimeType: string) {
  const plain = name.replace(/[^\w .\-()]+/g, " ").replace(/\s+/g, " ").trim();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": mimeType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
