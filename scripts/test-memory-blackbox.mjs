// @ts-check
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = resolveBlackboxHome(process.env);
if (resolve(home) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to verify memory against installed release data");
}
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-memory-"));
mkdirSync(artifacts, { recursive: true });

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(
    process.env.TAURI_PILOT_BIN || "tauri-pilot",
    [...args, "--window", "main"],
    {
      cwd: artifacts,
      env: { ...process.env, OPENAGENT_HOME: home, TAURI_PILOT_WINDOW: "main" },
      encoding: "utf8",
    },
  );
  if (args[0] !== "snapshot") process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tauri-pilot ${args[0]} failed`);
  return result.stdout;
}

/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script]);
}

/** @param {string} name */
function scenario(name) {
  pilot(["snapshot", "-i"]);
  pilot(["run", join(root, "tests/blackbox", name)]);
}

function openMemory() {
  evaluate(
    'window.dispatchEvent(new KeyboardEvent("keydown", {key:"4", code:"Digit4", ctrlKey:true, shiftKey:true, bubbles:true})); true',
  );
  pilot(["wait", "--selector", ".memory-editor:not(:disabled)", "--timeout", "10000"]);
  pilot(["snapshot", "-i"]);
}

/** @param {string} selector @param {string} value */
function choose(selector, value) {
  pilot(["snapshot", "-i"]);
  pilot(["click", selector]);
  pilot(["snapshot", "-i"]);
  pilot(["click", `[role=option][data-value=${value}]`]);
}

pilot(["ping"]);
openMemory();
scenario("memory-management.toml");

// A task-owned fixture directory at the file path produces a real SDK write
// failure. Preserve the successfully saved file and restore it before retrying.
const memoryFile = join(home, "memory.md");
const backup = join(home, "memory.blackbox-backup.md");
renameSync(memoryFile, backup);
mkdirSync(memoryFile);
try {
  scenario("memory-save-failure.toml");
} finally {
  rmdirSync(memoryFile);
  renameSync(backup, memoryFile);
}
scenario("memory-save-retry.toml");

try {
  for (const theme of ["light", "dark"]) {
    for (const language of ["zh", "en"]) {
      evaluate(
        'window.dispatchEvent(new KeyboardEvent("keydown", {key:",", code:"Comma", ctrlKey:true, bubbles:true})); true',
      );
      pilot([
        "wait",
        "--selector",
        '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button',
        "--timeout",
        "10000",
      ]);
      choose('[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button', theme);
      choose(
        '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(2) button',
        language,
      );
      openMemory();
      scenario("retired-management-controls.toml");
      evaluate(`(() => {
        if (!document.documentElement.classList.contains(${JSON.stringify(theme)})) throw new Error("wrong theme");
        if (!document.body.innerText.includes(${JSON.stringify(language === "en" ? "User Memory" : "用户记忆")})) throw new Error("wrong locale");
        const columns = document.querySelector(".memory-columns");
        const footer = document.querySelector(".memory-editor-footer");
        if (!columns || !footer) throw new Error("memory panes missing");
        if (columns.getBoundingClientRect().height < 80) throw new Error("memory panes not visible");
        if (footer.getBoundingClientRect().height < 20) throw new Error("save footer not visible");
        if (columns.scrollWidth > columns.clientWidth + 1) throw new Error("horizontal overflow");
        if (footer.getBoundingClientRect().bottom > innerHeight) throw new Error("save footer clipped");
        return true;
      })()`);
      captureBlackboxScreenshot(pilot, join(artifacts, `memory-${theme}-${language}.png`));
    }
  }
} finally {
  evaluate(
    'window.dispatchEvent(new KeyboardEvent("keydown", {key:",", code:"Comma", ctrlKey:true, bubbles:true})); true',
  );
  choose('[role=tabpanel][data-value="general"] .settings-card-row:nth-child(2) button', "zh");
  choose('[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button', "system");
}
pilot(["logs", "--level", "error"]);
process.stdout.write(`Memory black-box verification passed. Artifacts: ${artifacts}\n`);
