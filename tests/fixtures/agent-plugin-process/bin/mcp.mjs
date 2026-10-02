// The fixture plugin's own stdio MCP server.
//
// A plugin-owned server has no settings surface: the app mounts it for the agent
// and never renders its tools, so the only host-observable proof that this
// process ran is a file it writes itself. That file lands in the plugin's own
// `PLUGIN_DATA` directory, which is also the one location the plugin process
// policy grants the child, so the report doubles as the end-to-end check of the
// grant rather than only of the spawn.
//
// It is written after `tools/list` completes, never earlier, so its presence
// means a confined child finished a real MCP handshake instead of merely
// starting. stdout carries the protocol and stays silent otherwise.
//
// The report records what the policy produced, never what the host environment
// happens to hold: the data root must accept a write, and no name the policy
// removes may survive into a plugin process. Credential *values* are never read,
// copied, or written here — only the names still present, which is what the
// policy's rule is stated over.
//
// The write into the package root is recorded but deliberately not asserted by
// the desktop run: this fixture is installed inside the active workspace, and
// the inherited workspace write grant legitimately covers it, so the recorded
// value depends on where the package happens to live. The grant boundary between
// the package root and the data root is asserted where both can be chosen, in
// the Runtime's own confinement test.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const pluginRoot = process.env.PLUGIN_ROOT ?? "";
const pluginData = process.env.PLUGIN_DATA ?? "";

// Mirrors the policy's own rule, so a change on either side shows up as a
// disagreement instead of as a silently weaker fixture.
const CREDENTIAL_SUFFIXES = [
  "_API_KEY",
  "_ACCESS_KEY",
  "_API_TOKEN",
  "_ACCESS_TOKEN",
  "_SECRET_KEY",
];
const CREDENTIAL_NAMES = [
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SESSION_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
];
const CREDENTIAL_PREFIXES = ["ANTHROPIC_", "OPENAI_", "OPENAGENT_"];
// The Runtime intentionally injects these Host Bridge capabilities into every
// enabled plugin process. They are authenticated, capability-specific values,
// so their presence is expected and does not represent host credential leakage.
const RETAINED_NAMES = [
  "OPENAGENT_HOME",
  "OPENAGENT_PLUGIN_HOST_URL",
  "OPENAGENT_PLUGIN_HOST_TOKEN",
  "OPENAGENT_PLUGIN_ID",
];

function survivingCredentialNames() {
  return Object.keys(process.env)
    .map((key) => key.toUpperCase())
    .filter((key) => {
      if (RETAINED_NAMES.includes(key)) return false;
      return (
        CREDENTIAL_NAMES.includes(key) ||
        CREDENTIAL_SUFFIXES.some((suffix) => key.endsWith(suffix)) ||
        CREDENTIAL_PREFIXES.some((prefix) => key.startsWith(prefix))
      );
    })
    .sort();
}

function attempt(path, contents) {
  try {
    writeFileSync(path, contents);
    return "accepted";
  } catch (error) {
    return `refused: ${error.code ?? error.message}`;
  }
}

const methods = [];

function report() {
  const scratch = ["TMPDIR", "TEMP", "TMP"]
    .map((key) => process.env[key] ?? "")
    .filter((value) => value.length > 0);
  return {
    pid: process.pid,
    node: process.version,
    cwd: process.cwd(),
    methods,
    pluginRoot,
    pluginData,
    scratch,
    scratchInsideData:
      pluginData.length > 0 &&
      scratch.length > 0 &&
      scratch.every((value) => value.startsWith(pluginData)),
    survivingCredentialNames: survivingCredentialNames(),
    writes: {
      // Recorded for diagnosis only; the run asserts on `dataRoot` alone.
      dataRoot: attempt(join(pluginData, "mcp-marker.txt"), "plugin data"),
      package: attempt(join(pluginRoot, "written-by-plugin.txt"), "package"),
    },
  };
}

function publish() {
  try {
    mkdirSync(pluginData, { recursive: true });
    writeFileSync(join(pluginData, "mcp-report.json"), JSON.stringify(report(), null, 2));
  } catch {
    // A missing report is the failure signal the run asserts on, so a write that
    // cannot happen stays silent here instead of pretending to have succeeded.
  }
}

const tools = [
  {
    name: "process_report",
    description: "Reports what this plugin process could write and reach.",
    inputSchema: { type: "object", properties: {} },
  },
];

createInterface({ input: process.stdin }).on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (message.id === undefined || message.id === null) return;
  const reply = (payload) =>
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, ...payload })}\n`);
  methods.push(message.method);
  switch (message.method) {
    case "initialize":
      reply({
        result: {
          protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "openagent-process-plugin", version: "1.0.0" },
        },
      });
      break;
    case "tools/list":
      reply({ result: { tools } });
      publish();
      break;
    case "tools/call":
      reply({ result: { content: [{ type: "text", text: JSON.stringify(report()) }] } });
      break;
    default:
      reply({ error: { code: -32601, message: `unmapped method: ${message.method}` } });
  }
});
