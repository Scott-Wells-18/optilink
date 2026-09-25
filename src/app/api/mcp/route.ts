import { NextResponse } from "next/server";
import { callerFor } from "@/lib/tokens";
import { ERRORS, PROTOCOL, failure, handle, type Request as Rpc } from "@/lib/mcp/rpc";
import { findTools } from "@/lib/mcp/tools/find";
import { baTools } from "@/lib/mcp/tools/ba";
import { renderTools } from "@/lib/mcp/tools/render";

export const runtime = "nodejs";
/** Building a report with thirty photographs in it takes a moment. */
export const maxDuration = 120;

/**
 * OptiLink, as something an assistant can work through.
 *
 * The app is behind one shared password, which is for a person at a keyboard.
 * This is the other door: one JSON-RPC endpoint, a bearer token that is issued
 * to one thing and revoked on its own, and a set of tools that do what the
 * app's own screens do.
 *
 * It reads and it writes, but it never issues. A report made through here is a
 * draft with everything in it; somebody with a licence opens it, reads it and
 * puts their name on it. That is not a technical limit — it is the whole
 * reason a compliance document is worth anything.
 */

const TOOLS = [...findTools, ...baTools, ...renderTools];

const SERVER = { name: "optilink", version: "1.0.0" };

export async function POST(request: Request) {
  const caller = await callerFor(request.headers.get("authorization"));
  if (!caller) return unauthorised();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(failure(null, ERRORS.parse, "That was not JSON."), { status: 400 });
  }

  // A client may send several at once. Each is answered on its own, and the
  // ones that wanted no answer are left out of what goes back.
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as Rpc[];
  const answers = [];

  for (const message of messages) {
    if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
      answers.push(failure(null, ERRORS.request, "That is not a JSON-RPC 2.0 message."));
      continue;
    }
    try {
      const answer = await handle(message, TOOLS, caller.name, SERVER);
      if (answer) answers.push(answer);
    } catch (thrown) {
      answers.push(
        failure(
          message.id,
          ERRORS.internal,
          thrown instanceof Error ? thrown.message : "Something went wrong.",
        ),
      );
    }
  }

  // Everything was a notification: there is nothing to say back.
  if (answers.length === 0) return new NextResponse(null, { status: 202 });

  return NextResponse.json(batch ? answers : answers[0], {
    headers: { "cache-control": "no-store", "mcp-protocol-version": PROTOCOL },
  });
}

/**
 * What this is, for anything that looks.
 *
 * Answering a plain GET with the server's own details makes it obvious the
 * URL is right and the token is wrong, which are the two things that go wrong
 * when somebody is connecting it for the first time.
 */
export async function GET(request: Request) {
  const caller = await callerFor(request.headers.get("authorization"));
  if (!caller) return unauthorised();

  return NextResponse.json(
    {
      ...SERVER,
      protocolVersion: PROTOCOL,
      connectedAs: caller.name,
      tools: TOOLS.map((tool) => tool.name),
      transport: "Send JSON-RPC 2.0 to this same URL by POST.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function unauthorised() {
  return NextResponse.json(
    failure(null, ERRORS.request, "A valid bearer token is needed to use this."),
    {
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="optilink"' },
    },
  );
}
