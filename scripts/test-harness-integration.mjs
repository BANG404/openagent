import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const serverManifest = resolve(repositoryRoot, "sdk", "rust", "openagent-server", "Cargo.toml");
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

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.stdin.end("shutdown\n");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) =>
      setTimeout(() => {
        child.kill();
        resolveTimeout();
      }, 5_000),
    ),
  ]);
}

async function exerciseDesktopHarnessServer() {
  const root = await mkdtemp(resolve(tmpdir(), "openagent-desktop-harness-test-"));
  const workspace = resolve(root, "workspace");
  const openagentHome = resolve(root, "config");
  await mkdir(workspace);
  await mkdir(openagentHome);
  const token = randomBytes(32).toString("hex");
  const tokenEnv = `OPENAGENT_DESKTOP_HARNESS_TOKEN_${process.pid}_${Date.now()}`;
  const child = spawn(
    serverBinary,
    [
      "--workspace",
      workspace,
      "--listen",
      "127.0.0.1:0",
      "--token-env",
      tokenEnv,
      "--output",
      "json",
      "--desktop-api",
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, OPENAGENT_HOME: openagentHome, [tokenEnv]: token },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  try {
    const ready = await new Promise((resolveReady, rejectReady) => {
      const lines = createInterface({ input: child.stdout });
      const timeout = setTimeout(() => {
        child.kill();
        rejectReady(new Error("Desktop Runtime server did not become ready"));
      }, 30_000);
      const fail = (error) => {
        clearTimeout(timeout);
        lines.close();
        rejectReady(error);
      };
      child.once("error", fail);
      child.once("exit", (code) =>
        fail(new Error(`Desktop Runtime server exited before ready (${code})`)),
      );
      lines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.type !== "ready") return;
          clearTimeout(timeout);
          child.removeListener("error", fail);
          lines.close();
          resolveReady(message);
        } catch {
          // Ignore non-readiness diagnostics without exposing them in public CI.
        }
      });
    });
    const headers = { authorization: `Bearer ${token}` };
    const [capabilitiesResponse, healthResponse] = await Promise.all([
      fetch(`${ready.endpoint}/v1/capabilities`, { headers }),
      fetch(`${ready.endpoint}/api/desktop/health`, { headers }),
    ]);
    assert.equal(capabilitiesResponse.status, 200);
    assert.equal(healthResponse.status, 200);
    const capabilities = await capabilitiesResponse.json();
    const health = await healthResponse.json();
    assert.ok(capabilities.capabilities.includes("runs"));
    assert.equal(health.status, "ok");
    assert.equal(health.pid, ready.pid);
  } finally {
    await stopServer(child);
    await rm(root, { recursive: true, force: true });
  }
}

run("cargo", ["build", "--manifest-path", serverManifest, "--bin", "openagent-server"]);
run(process.execPath, ["test", integrationTest], {
  ...process.env,
  OPENAGENT_SERVER_BINARY: serverBinary,
});
await exerciseDesktopHarnessServer();
