// @ts-check

import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { blackboxInstanceName, resolveBlackboxHome } from "./tauri-test-environment.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenario = join(workspaceRoot, "tests", "blackbox", "chat-group-sidebar.toml");
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const isolatedHome = resolveBlackboxHome(process.env);
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-chat-group-blackbox-"));

if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to run chat-group black-box verification against ~/.openagent");
}

mkdirSync(artifactRoot, { recursive: true });
process.env.OPENAGENT_HOME = isolatedHome;
process.env.OPENAGENT_DEV_INSTANCE ||= blackboxInstanceName(process.env);

const pilotEnv = { ...process.env, TAURI_PILOT_WINDOW: "main" };

/**
 * @param {string[]} args
 * @param {boolean} [capture]
 */
function pilot(args, capture = false) {
  return spawnSync(pilotBinary, args, {
    cwd: artifactRoot,
    env: pilotEnv,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

/**
 * @param {string[]} args
 */
function requirePilot(args) {
  const result = pilot(args);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tauri-pilot ${args.join(" ")} failed`);
}

/**
 * @param {number} ms
 */
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Reload the main window and wait until the reloaded document answers, so the
 * scenario never inspects the stale conversation list.
 */
function reloadMainWindow() {
  requirePilot([
    "eval",
    "window.__openagentChatGroupReload = true; setTimeout(() => location.reload(), 100); true",
    "--window",
    "main",
  ]);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const probe = pilot(
      ["eval", 'typeof window.__openagentChatGroupReload === "undefined"', "--window", "main"],
      true,
    );
    if (!probe.error && probe.status === 0 && (probe.stdout ?? "").trim().endsWith("true")) {
      return;
    }
    sleepMs(200);
  }
  throw new Error("the main window did not finish reloading for the seeded conversation");
}

/**
 * Seed the chat-group conversation through the isolated debug instance's
 * loopback API, so the committed scenario only exercises the product UI and
 * never depends on a provider run or a committed database fixture.
 */
async function seedChatGroupConversation() {
  const configDir = process.env.OPENAGENT_CONFIG_DIR || isolatedHome;
  const manifestPath = join(configDir, "dev-api.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `The isolated debug instance is not publishing a dev API manifest at ${manifestPath}: ${error}`,
      { cause: error },
    );
  }
  const headers = { Authorization: `Bearer ${manifest.token}` };
  const health = await fetch(`${manifest.base_url}/v1/health`, { headers });
  if (!health.ok) {
    throw new Error(`the isolated dev API failed its health check: HTTP ${health.status}`);
  }
  const response = await fetch(`${manifest.base_url}/v1/diagnostics/chat-group-conversation`, {
    method: "POST",
    headers,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`seeding the chat-group conversation failed: ${JSON.stringify(body)}`);
  }
  return body;
}

const seeded = await seedChatGroupConversation();
process.stdout.write(`Seeded chat-group conversation ${seeded.conv_id} (${seeded.group_id}).\n`);

// The seeded conversation is durable, so the mounted conversation list has to
// reload before the scenario can select it.
reloadMainWindow();
requirePilot(["wait", "--selector", ".conv-item", "--timeout", "20000", "--window", "main"]);

const result = spawnSync(pilotBinary, ["run", scenario, "--window", "main"], {
  cwd: artifactRoot,
  env: pilotEnv,
  encoding: "utf8",
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`tauri-pilot chat-group scenario failed with exit code ${result.status}`);
}

const logs = spawnSync(pilotBinary, ["logs", "--level", "error", "--window", "main"], {
  cwd: artifactRoot,
  env: pilotEnv,
  encoding: "utf8",
  stdio: "inherit",
});
if (logs.error) throw logs.error;
if (logs.status !== 0) throw new Error("tauri-pilot failed to read chat-group window logs");
