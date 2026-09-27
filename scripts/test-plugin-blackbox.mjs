// @ts-check

import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { blackboxInstanceName, resolveBlackboxHome } from "./tauri-test-environment.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenario = join(workspaceRoot, "tests", "blackbox", "plugin-sidebar.toml");
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const isolatedHome = resolveBlackboxHome(process.env);
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-plugin-blackbox-"));

if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to run plugin black-box verification against ~/.openagent");
}

mkdirSync(artifactRoot, { recursive: true });
mkdirSync(join(isolatedHome, "plugins"), { recursive: true });
cpSync(
  join(workspaceRoot, "tests", "fixtures", "agent-plugin-demo"),
  join(isolatedHome, "plugins", "openagent-demo-plugin"),
  { recursive: true },
);

process.env.OPENAGENT_HOME = isolatedHome;
process.env.OPENAGENT_DEV_INSTANCE ||= blackboxInstanceName(process.env);

function pilot(args) {
  const result = spawnSync(pilotBinary, args, {
    cwd: artifactRoot,
    env: { ...process.env, TAURI_PILOT_WINDOW: "main" },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tauri-pilot ${args.join(" ")} failed`);
}

// Exercise the Integrations surface through the same menu a user would use
// before running the sidebar assertions.
pilot(["click", "#application-integrations-menu", "--window", "main"]);
pilot(["click", '[role="menuitem"]:last-child', "--window", "main"]);
pilot(["wait", "--selector", '[role="dialog"]', "--timeout", "5000", "--window", "main"]);
pilot([
  "eval",
  `(() => {
    const close = document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]');
    if (close instanceof HTMLElement) close.click();
    return true;
  })()`,
  "--window",
  "main",
]);
const result = spawnSync(pilotBinary, ["run", scenario, "--window", "main"], {
  cwd: artifactRoot,
  env: { ...process.env, TAURI_PILOT_WINDOW: "main" },
  encoding: "utf8",
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`tauri-pilot plugin scenario failed with exit code ${result.status}`);
}

const logs = spawnSync(pilotBinary, ["logs", "--level", "error", "--window", "main"], {
  cwd: artifactRoot,
  env: { ...process.env, TAURI_PILOT_WINDOW: "main" },
  encoding: "utf8",
  stdio: "inherit",
});
if (logs.error) throw logs.error;
if (logs.status !== 0) throw new Error("tauri-pilot failed to read plugin window logs");
