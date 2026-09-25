/**
 * Just enough of the Model Context Protocol to be a server.
 *
 * MCP is JSON-RPC 2.0 over an HTTP POST: the client sends a request, the
 * server answers with one result. Three methods carry everything an assistant
 * needs — say hello, ask what tools there are, and call one — so those three
 * are implemented here rather than pulling in a transport built for Node's
 * own request and response objects, which is not what a route handler here is
 * handed.
 *
 * Everything else a client may send is either a notification, which wants no
 * answer at all, or a method this server does not have, which gets the error
 * the specification asks for rather than silence.
 */

export const PROTOCOL = "2025-06-18";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Request = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

/** What a tool is, as a client sees it. */
export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Run it. Whatever comes back is given to the model as text. */
  run: (input: Record<string, unknown>, caller: string) => Promise<unknown>;
  /** True where it only reads. Clients tell the person before a write. */
  readOnly?: boolean;
};

export const ERRORS = {
  parse: -32700,
  request: -32600,
  method: -32601,
  params: -32602,
  internal: -32603,
} as const;

export function result(id: Request["id"], value: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result: value };
}

export function failure(id: Request["id"], code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

/**
 * Answer one request, or nothing where none is wanted.
 *
 * A JSON-RPC notification has no id and expects no reply — the client is
 * telling the server something, not asking. Returning null says so, and the
 * route answers 202 with an empty body.
 */
export async function handle(
  message: Request,
  tools: Tool[],
  caller: string,
  server: { name: string; version: string },
): Promise<ReturnType<typeof result> | ReturnType<typeof failure> | null> {
  const { id, method } = message;
  const isNotification = id === undefined || id === null;

  if (method === "initialize") {
    return result(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: server,
    });
  }

  // Told, not asked: the client has finished starting up, or is going away.
  if (method.startsWith("notifications/")) return null;
  if (method === "ping") return result(id, {});

  if (method === "tools/list") {
    return result(id, {
      tools: tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly ?? false,
          destructiveHint: false,
        },
      })),
    });
  }

  if (method === "tools/call") {
    const params = (message.params ?? {}) as { name?: string; arguments?: unknown };
    const tool = tools.find((entry) => entry.name === params.name);
    if (!tool) {
      return failure(id, ERRORS.params, `There is no tool called "${params.name}".`);
    }

    const input =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};

    try {
      const answer = await tool.run(input, caller);
      return result(id, {
        content: [{ type: "text", text: asText(answer) }],
        structuredContent: answer as Json,
        isError: false,
      });
    } catch (thrown) {
      // A tool that refuses is not a broken server: the model is told what
      // went wrong in the answer, so it can put it right and try again,
      // rather than being handed a protocol error it can do nothing with.
      return result(id, {
        content: [{ type: "text", text: reasonFor(thrown) }],
        isError: true,
      });
    }
  }

  if (isNotification) return null;
  return failure(id, ERRORS.method, `This server has no method called "${method}".`);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function reasonFor(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message;
  return "That could not be done.";
}
