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
const productRoot = resolve(repositoryRoot, "crates");
const productSources = readdirSync(productRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "target")
  .flatMap((entry) => filesBelow(resolve(productRoot, entry.name)))
  .map((file) => relative(repositoryRoot, file).replaceAll("\\", "/"))
  .filter((file) => file.endsWith(".rs") && !file.startsWith("crates/target/"));
const allowedProductSources = new Set(
  readFileSync(resolve(repositoryRoot, ".githooks/public-product-sources.txt"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
);
if (
  productSources.some((file) => !allowedProductSources.has(file)) ||
  [...allowedProductSources].some((file) => !productSources.includes(file))
) {
  throw new Error("Public product Rust sources differ from their reviewed allowlist");
}
if (!cargoManifest.includes('path = "src/lib.rs"')) {
  throw new Error("The host Cargo library target must compile from the Tauri adapter");
}
for (const crate of ["openagent-runtime"]) {
  if (cargoManifest.includes(`${crate} = {`)) {
    throw new Error(`${crate} must resolve only in the SDK-owned diagnostic workspace`);
  }
}

const cargoTree = spawnSync(
  process.env.CARGO ?? "cargo",
  ["tree", "--manifest-path", "src-tauri/Cargo.toml", "-p", "openagent", "-e", "normal"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
if (cargoTree.status !== 0) {
  throw new Error("Could not verify the default Tauri dependency graph");
}
for (const crate of ["openagent-runtime", "rig-core"]) {
  const escapedCrate = crate.replace("-", String.raw`\-`);
  const pattern = String.raw`(?:^|\n)[^\n]*\b${escapedCrate} v`;
  if (new RegExp(pattern).test(cargoTree.stdout)) {
    throw new Error(`Default Tauri dependency graph contains private crate ${crate}`);
  }
}

const sdkProtocolSource = readFileSync(
  resolve(repositoryRoot, "crates", "openagent-protocol", "src", "lib.rs"),
  "utf8",
);
const hostProtocolSource = readFileSync(
  resolve(repositoryRoot, "crates", "openagent-app", "src", "runtime_process.rs"),
  "utf8",
);
const sdkProtocol = /pub const SDK_PROTOCOL_VERSION: u32 = (\d+);/.exec(sdkProtocolSource)?.[1];
if (
  !sdkProtocol ||
  !hostProtocolSource.includes(
    "pub use openagent_protocol::SDK_PROTOCOL_VERSION as DESKTOP_RUNTIME_PROTOCOL_VERSION;",
  )
) {
  throw new Error("The desktop must consume the public Runtime protocol version");
}
console.log("Public product and desktop dependency graph excludes the private execution engine");
