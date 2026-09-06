import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
for (const crate of ["openagent-app", "openagent-protocol", "openagent-runtime"]) {
  if (!cargoManifest.includes(`${crate} = { path = "../sdk/rust/${crate}", optional = true }`)) {
    throw new Error(`${crate} must be optional and reserved for embedded Runtime diagnostics`);
  }
}
if (
  !cargoManifest.includes(
    'embedded-runtime = ["dep:openagent-app", "dep:openagent-protocol", "dep:openagent-runtime"]',
  )
) {
  throw new Error("The embedded Runtime feature must explicitly own every private SDK dependency");
}

const cargoTree = spawnSync(
  process.env.CARGO ?? "cargo",
  ["tree", "--manifest-path", "src-tauri/Cargo.toml", "-p", "openagent", "-e", "normal"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
if (cargoTree.status !== 0) {
  throw new Error("Could not verify the default Tauri dependency graph");
}
for (const crate of ["openagent-app", "openagent-protocol", "openagent-runtime"]) {
  if (new RegExp(`(?:^|\\n)[^\\n]*\\b${crate.replace("-", "\\-")} v`).test(cargoTree.stdout)) {
    throw new Error(`Default Tauri dependency graph contains private crate ${crate}`);
  }
}

const sdkProtocolSource = readFileSync(
  resolve(repositoryRoot, "sdk", "rust", "openagent-protocol", "src", "lib.rs"),
  "utf8",
);
const hostProtocolSource = readFileSync(
  resolve(repositoryRoot, "src-tauri", "src", "runtime_process.rs"),
  "utf8",
);
const sdkProtocol = sdkProtocolSource.match(/pub const SDK_PROTOCOL_VERSION: u32 = (\d+);/)?.[1];
const hostProtocol = hostProtocolSource.match(
  /pub const DESKTOP_RUNTIME_PROTOCOL_VERSION: u32 = (\d+);/,
)?.[1];
if (!sdkProtocol || sdkProtocol !== hostProtocol) {
  throw new Error("The public desktop Runtime protocol version must match the pinned SDK");
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
