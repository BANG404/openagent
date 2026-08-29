import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hostSourceRoot = resolve(repositoryRoot, "src-tauri", "src");
const publicHostSourceAllowlist = resolve(repositoryRoot, ".githooks", "public-host-sources.txt");

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const allowedHostSources = new Set(
  readFileSync(publicHostSourceAllowlist, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => path.replace(/^src-tauri\/src\//, "")),
);
const unexpectedHostSources = filesBelow(hostSourceRoot)
  .map((path) => relative(hostSourceRoot, path).replaceAll("\\", "/"))
  .filter((path) => !allowedHostSources.has(path));
if (unexpectedHostSources.length > 0) {
  throw new Error(
    `Private backend source leaked into the host tree: ${unexpectedHostSources.join(", ")}`,
  );
}

const cargoManifest = readFileSync(resolve(repositoryRoot, "src-tauri", "Cargo.toml"), "utf8");
if (!cargoManifest.includes('path = "src/lib.rs"')) {
  throw new Error("The host Cargo library target must compile from the Tauri adapter");
}
if (!cargoManifest.includes('openagent-app = { path = "../sdk/rust/openagent-app" }')) {
  throw new Error("The Tauri adapter must depend on the private SDK application crate");
}
if (!cargoManifest.includes('openagent-runtime = { path = "../sdk/rust/openagent-runtime" }')) {
  throw new Error("The Tauri adapter must depend on the private SDK runtime crate");
}

const requiredRuntimeSources = [
  "chat_lifecycle.rs",
  "checkpoint.rs",
  "commands/chat_common.rs",
  "commands/chat_interrupt.rs",
  "commands/chat_run.rs",
  "commands/goals.rs",
  "commands/memory_drafts_agents.rs",
  "commands/providers.rs",
  "context_compaction.rs",
  "conversation_memory.rs",
  "goal.rs",
  "mcp.rs",
  "sub_agent.rs",
  "tool_approval.rs",
  "tools.rs",
];
const runtimeSourceRoot = resolve(repositoryRoot, "sdk", "rust", "openagent-runtime", "src");
const availableRuntimeSources = new Set(
  filesBelow(runtimeSourceRoot).map((path) =>
    relative(runtimeSourceRoot, path).replaceAll("\\", "/"),
  ),
);
const missingRuntimeSources = requiredRuntimeSources.filter(
  (path) => !availableRuntimeSources.has(path),
);
if (missingRuntimeSources.length > 0) {
  throw new Error(
    `Private SDK runtime checkout is incomplete: ${missingRuntimeSources.join(", ")}`,
  );
}

console.log(`Private SDK boundary verified (${availableRuntimeSources.size} runtime source files)`);
