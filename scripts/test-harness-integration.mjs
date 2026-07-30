import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const serverManifest = resolve(
  repositoryRoot,
  "sdk",
  "rust",
  "openagent-server",
  "Cargo.toml",
);
const serverBinary = resolve(
  repositoryRoot,
  "sdk",
  "target",
  "debug",
  process.platform === "win32" ? "openagent-server.exe" : "openagent-server",
);
const integrationTest = resolve(
  repositoryRoot,
  "sdk",
  "harness-typescript",
  "tests",
  "spawn.test.ts",
);

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

run("cargo", ["build", "--manifest-path", serverManifest, "--bin", "openagent-server"]);
run(process.execPath, ["test", integrationTest], {
  ...process.env,
  OPENAGENT_SERVER_BINARY: serverBinary,
});
