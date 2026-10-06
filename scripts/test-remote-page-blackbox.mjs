// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { serve } from "bun";
import { OPENAGENT_PROTOCOL_VERSION } from "../sdk/typescript/src/contracts.ts";

const artifacts = mkdtempSync(join(tmpdir(), "openagent-remote-page-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/remote-page.toml", import.meta.url));
const execute = promisify(execFile);

/** @param {string[]} args */
async function pilot(args) {
  const { stdout } = await execute(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout.trim();
}

/** @param {string} id */
function conversationState(id) {
  return {
    conv_id: id,
    title: `Remote ${id}`,
    phase: "final_completed",
    checkpoint_id: null,
    messages: [
      {
        id: `${id}-question`,
        role: "user",
        content: [{ type: "text", text: `**User question ${id}**` }],
        items: null,
        status: "completed",
        timestamp: Date.now() - 1000,
        tags: [],
      },
      {
        id: `${id}-answer`,
        role: "assistant",
        content: [{ type: "text", text: `Durable answer ${id}` }],
        items: null,
        status: "completed",
        timestamp: Date.now(),
        first_token_at: null,
        completed_at: null,
        tags: [],
        system_prompt: null,
        tools: null,
      },
    ],
    interrupts: [],
  };
}

/** @param {string} id */
function meta(id) {
  return { id, title: `Remote ${id}`, created_at: 1, updated_at: 1, pinned: false };
}

await pilot(["ping"]);
await pilot(["snapshot", "-i"]);
const originalUrl = await pilot(["url"]);
const frontend = new URL(process.env.BLACKBOX_BASE_URL || originalUrl);
assert(
  ["localhost", "127.0.0.1"].includes(frontend.hostname),
  "a local debug frontend is required",
);
let theme = "light";
const compiledPage = await (
  await fetch(new URL("/src/routes/remote/+page.svelte", frontend))
).text();
const svelteModule = /import \{ onMount \} from "([^"]+)"/.exec(compiledPage)?.[1];
assert(svelteModule, "the compiled remote page must identify its Svelte runtime");
let locale = "en";
let session = false;
let offline = false;
let reads = 0;
let uploads = 0;
let lists = new Map([
  ["one", [meta("one-a"), meta("one-b")]],
  ["two", [meta("two-a")]],
]);
/** @type {Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>} */
const streams = new Map();
const encoder = new TextEncoder();
/** @param {Request} request */
async function fixtureResponse(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/") && !path.startsWith("/__fixture/")) {
    return fetch(new URL(path + url.search, frontend.origin), {
      method: request.method,
      headers: { accept: request.headers.get("accept") || "*/*" },
    });
  }
  if (path.startsWith("/__fixture/")) {
    if (path === "/__fixture/offline") {
      offline = true;
      for (const controllers of streams.values())
        for (const controller of controllers) controller.close();
      streams.clear();
    } else if (path === "/__fixture/online") offline = false;
    return Response.json({ reads, uploads });
  }
  if (path === "/api/session")
    return session
      ? Response.json({ csrf: "fixture-csrf", protocol_version: OPENAGENT_PROTOCOL_VERSION })
      : Response.json({ error: "pair first" }, { status: 401 });
  if (path === "/api/pair") {
    const body = await request.json();
    if (body.code !== "ABCDEFGH")
      return Response.json({ error: "invalid fixture code" }, { status: 400 });
    session = true;
    return Response.json({ csrf: "fixture-csrf", protocol_version: OPENAGENT_PROTOCOL_VERSION });
  }
  if (!session) return Response.json({ error: "pair first" }, { status: 401 });
  if (request.method !== "GET" && request.headers.get("x-openagent-csrf") !== "fixture-csrf")
    return Response.json({ error: "CSRF missing" }, { status: 403 });
  if (path === "/api/workspaces")
    return Response.json([
      { id: "one", name: "Workspace one" },
      { id: "two", name: "Workspace two" },
    ]);
  if (path === "/api/models")
    return Response.json([
      { provider_id: "fixture", provider_name: "Fixture", model: "offline", is_default: true },
    ]);
  if (path === "/api/commands") return Response.json([]);
  if (path === "/api/preferences")
    return Response.json({ theme, language: locale, message_layout: "single" });
  if (/^\/api\/workspaces\/[^/]+\/roles$/.test(path)) return Response.json([]);
  if (/^\/api\/workspaces\/[^/]+\/files$/.test(path)) return Response.json(["README.md"]);
  const list = /^\/api\/workspaces\/([^/]+)\/conversations$/.exec(path);
  if (list) return Response.json(lists.get(list[1]) || []);
  const conversation = /^\/api\/conversations\/([^/]+)(?:\/(history|events))?$/.exec(path);
  if (conversation) {
    const [, id, surface] = conversation;
    if (surface === "history")
      return Response.json({
        checkpoints: [],
        branches: [],
        active_branch_tip: null,
        file_changes: [],
      });
    if (surface === "events") {
      if (offline) return Response.json({ error: "fixture offline" }, { status: 503 });
      let current;
      const stream = new ReadableStream({
        start(controller) {
          current = controller;
          const group = streams.get(id) || new Set();
          group.add(controller);
          streams.set(id, group);
          controller.enqueue(
            encoder.encode(`event: state\ndata: ${JSON.stringify(conversationState(id))}\n\n`),
          );
        },
        cancel() {
          if (current) streams.get(id)?.delete(current);
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      });
    }
    if (request.method === "DELETE") {
      for (const [workspace, rows] of lists)
        lists.set(
          workspace,
          rows.filter((row) => row.id !== id),
        );
      return new Response(null, { status: 204 });
    }
    reads += 1;
    if (offline) return Response.json({ error: "fixture offline" }, { status: 503 });
    return Response.json(conversationState(id));
  }
  if (path === "/api/attachments" && request.method === "POST") {
    const body = await request.json();
    uploads += 1;
    return Response.json({
      path: "fixture-blob",
      name: body.name,
      kind: "document",
      mime_type: "text/plain",
    });
  }
  return Response.json({ error: `unhandled fixture endpoint ${path}` }, { status: 404 });
}
const server = serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const response =
      request.method === "OPTIONS"
        ? new Response(null, { status: 204 })
        : await fixtureResponse(request);
    response.headers.set("access-control-allow-origin", frontend.origin);
    response.headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
    response.headers.set("access-control-allow-headers", "content-type, x-openagent-csrf");
    return response;
  },
});
try {
  for (const appearance of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      theme = appearance;
      locale = language;
      session = false;
      offline = false;
      reads = 0;
      uploads = 0;
      lists = new Map([
        ["one", [meta("one-a"), meta("one-b")]],
        ["two", [meta("two-a")]],
      ]);
      await pilot(["navigate", `${frontend.origin}/?command-palette-preview`]);
      await pilot(["wait", ".command-palette-preview-stage"]);
      await pilot(["snapshot", "-i"]);
      // Keep Tauri's local origin so the debug bridge remains authorized.
      // Mount the actual compiled remote route and redirect only its HTTP
      // transport to the loopback fixture; no remote controller is replaced.
      await pilot([
        "eval",
        `(async () => {
        const fixture = ${JSON.stringify(server.url.href)};
        const originalFetch = window.fetch.bind(window);
        const endpoint = value => {
          const url = new URL(value, location.href);
          return url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__fixture/'))
            ? new URL(url.pathname + url.search, fixture).href : value;
        };
        window.fetch = (input, init) => originalFetch(endpoint(input instanceof Request ? input.url : String(input)), init);
        const OriginalEventSource = window.EventSource;
        window.EventSource = class extends OriginalEventSource { constructor(url, init) { super(endpoint(String(url)), init); } };
        document.querySelector('.command-palette-preview-stage').remove();
        const target = document.createElement('div'); document.body.appendChild(target);
        const [{ mount }, { default: RemotePage }] = await Promise.all([import(${JSON.stringify(svelteModule)}), import('/src/routes/remote/+page.svelte')]);
        mount(RemotePage, { target });
        return 'compiled remote page mounted with the HTTP fixture';
      })()`,
      ]);
      await pilot(["wait", "#pairing-code"]);
      await pilot(["snapshot", "-i"]);
      await pilot(["run", scenario]);
      await pilot(["screenshot", join(artifacts, `${theme}-${locale}.png`)]);
    }
  }
} finally {
  try {
    await pilot(["navigate", originalUrl]);
  } catch (cause) {
    process.stderr.write(`Could not restore the debug window: ${String(cause)}\n`);
  } finally {
    server.stop(true);
  }
}
process.stdout.write(
  `Remote page native HTTP-fixture verification passed. Artifacts: ${artifacts}\n`,
);
