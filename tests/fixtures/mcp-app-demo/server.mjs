// Deterministic MCP stdio server used by the MCP Apps Tauri black-box scenario.
//
// It declares one model-callable tool that carries an MCP Apps UI resource plus
// one app-only tool, and serves the widget HTML over `resources/read`. It has
// no dependencies so the committed fixture runs under `bun` without install.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const APP_HTML = readFileSync(join(here, "app.html"), "utf8");
const RESOURCE_URI = "ui://demo/app.html";
const RESOURCE_MIME = "text/html;profile=mcp-app";
const PROTOCOL_VERSION = "2025-11-25";

const TOOLS = [
  {
    name: "render_demo_app",
    description: "Render the OpenAgent MCP Apps demo widget.",
    inputSchema: {
      type: "object",
      properties: { label: { type: "string" } },
      additionalProperties: false,
    },
    _meta: { ui: { resourceUri: RESOURCE_URI } },
  },
  {
    name: "demo_app_action",
    description: "App-only action invoked from the widget bridge.",
    inputSchema: {
      type: "object",
      properties: { value: { type: "number" } },
      additionalProperties: false,
    },
    _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["app"] } },
  },
  {
    name: "model_only_tool",
    description: "A tool the host must never expose to the widget.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["model"] } },
  },
];

const RESOURCES = [
  {
    uri: RESOURCE_URI,
    name: "OpenAgent MCP Apps demo widget",
    mimeType: RESOURCE_MIME,
    _meta: { ui: { prefersBorder: true, resourceDomains: [] } },
  },
];

function text(content, structured, meta) {
  return {
    content: [{ type: "text", text: content }],
    structuredContent: structured,
    ...(meta ? { _meta: meta } : {}),
    isError: false,
  };
}

function callTool(name, args) {
  if (name === "render_demo_app") {
    return text("Rendered the OpenAgent MCP Apps demo widget.", {
      rendered: true,
      label: typeof args.label === "string" ? args.label : "demo",
    });
  }
  if (name === "demo_app_action") {
    return text(`App action ${JSON.stringify(args.value ?? null)}`, {
      action: args.value ?? null,
    });
  }
  if (name === "complete_checkout") {
    return text("Checkout completed by the fixture server.", {
      status: "completed",
      sessionId: args.id ?? null,
    });
  }
  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
}

function handle(message) {
  const { method, params } = message;
  const args = (params && params.arguments) || {};
  switch (method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        serverInfo: { name: "openagent-mcp-app-demo", version: "1.0.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return callTool(params?.name, args);
    case "resources/list":
      return { resources: RESOURCES };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "resources/read": {
      const uri = params?.uri;
      if (uri !== RESOURCE_URI) {
        throw Object.assign(new Error(`Unknown resource: ${uri}`), { code: -32602 });
      }
      return { contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME, text: APP_HTML }] };
    }
    default:
      throw Object.assign(new Error(`Unsupported method: ${method}`), { code: -32601 });
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf("\n");
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    index = buffer.indexOf("\n");
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      process.stderr.write(`[mcp-app-demo] invalid JSON: ${error}\n`);
      continue;
    }
    // Notifications (no id) never receive a response.
    if (message.id === undefined) continue;
    try {
      send({ jsonrpc: "2.0", id: message.id, result: handle(message) });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: error.code ?? -32603, message: error.message ?? String(error) },
      });
    }
  }
});
