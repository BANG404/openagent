// @ts-check

import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { blackboxInstanceName, resolveBlackboxHome } from "./tauri-test-environment.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenarioRoot = join(workspaceRoot, "tests", "blackbox");
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const isolatedHome = resolveBlackboxHome(process.env);
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-automation-blackbox-"));
mkdirSync(artifactRoot, { recursive: true });

if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to run black-box automation against ~/.openagent");
}

process.env.OPENAGENT_HOME = isolatedHome;
process.env.OPENAGENT_DEV_INSTANCE ||= blackboxInstanceName(process.env);

/** @param {string[]} args @param {string | undefined} windowLabel */
function pilot(args, windowLabel) {
  const env = { ...process.env };
  if (windowLabel) env.TAURI_PILOT_WINDOW = windowLabel;
  const result = spawnSync(pilotBinary, args, {
    cwd: artifactRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tauri-pilot ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result.stdout;
}

/** @param {string} output */
function parsePilotWindows(output) {
  const parsed = JSON.parse(output);
  const windows = Array.isArray(parsed) ? parsed : parsed.windows;
  if (!Array.isArray(windows)) throw new Error("tauri-pilot windows --json returned no windows");
  return windows;
}

function nativeWindowId() {
  const windows = parsePilotWindows(pilot(["windows", "--json"], windowLabel));
  const target = windows.find((window) => window.label === windowLabel);
  const windowId = target?.window_id ?? target?.windowId ?? target?.id;
  if (windowId === undefined || windowId === null) {
    throw new Error(`tauri-pilot did not return a native id for window ${windowLabel}`);
  }
  return String(windowId);
}

/**
 * Every management surface now renders inside the requesting window, so the
 * whole suite drives the single main window instead of separate utility
 * windows.
 */
const windowLabel = "main";

/** @param {string} scenario */
function runScenario(scenario) {
  pilot(["run", join(scenarioRoot, scenario), "--window", windowLabel], windowLabel);
}

/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script, "--window", windowLabel], windowLabel);
}

function waitForElement(selector) {
  pilot(
    ["wait", "--selector", selector, "--timeout", "10000", "--window", windowLabel],
    windowLabel,
  );
}

function waitForWindowReload() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (
      evaluate('typeof window.__openagentBlackboxReloadPending === "undefined"').trim() === "true"
    ) {
      return;
    }
    spawnSync("sleep", ["0.1"]);
  }
  throw new Error(`main window did not reload within the timeout for ${windowLabel}`);
}

/**
 * @param {string} key
 * @param {string} code
 * @param {{ ctrlKey?: boolean, shiftKey?: boolean }} modifiers
 */
function dispatchShortcut(key, code, modifiers = {}) {
  const flags = Object.entries(modifiers)
    .map(([flag, enabled]) => `${flag}: ${enabled ? "true" : "false"}`)
    .join(", ");
  evaluate(
    `(() => { window.dispatchEvent(new KeyboardEvent("keydown", {key: ${JSON.stringify(
      key,
    )}, code: ${JSON.stringify(code)}, ${flags}, bubbles: true})); return true; })()`,
  );
}

function openGeneralSurface() {
  dispatchShortcut(",", "Comma", { ctrlKey: true });
  waitForElement('[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button');
}

function openAutomationSurface() {
  dispatchShortcut("7", "Digit7", { ctrlKey: true, shiftKey: true });
  waitForElement("[role=tab][data-value=lifecycle]");
}

function chooseGeneralOption(selector, value) {
  pilot(["click", selector, "--window", windowLabel], windowLabel);
  pilot(["click", `[role=option][data-value=${value}]`, "--window", windowLabel], windowLabel);
}

function setVisualState(theme, language) {
  openGeneralSurface();
  chooseGeneralOption(
    '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button',
    theme,
  );
  chooseGeneralOption(
    '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(2) button',
    language,
  );
  openAutomationSurface();
  const expected = language === "en" ? "Lifecycle automation" : "生命周期自动化";
  evaluate(
    `new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => {
        const themeReady = ${JSON.stringify(theme)} === "system" || document.documentElement.className === ${JSON.stringify(theme)};
        if (themeReady && document.body.innerText.includes(${JSON.stringify(expected)})) {
          resolve(true);
        } else if (Date.now() >= deadline) {
          reject(new Error("locale did not reach " + ${JSON.stringify(expected)}));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    })`,
  );
}

function cleanupPanel(dataValue) {
  pilot(["click", `[role=tab][data-value=${dataValue}]`, "--window", windowLabel], windowLabel);
  const actionSelector = `[role=tabpanel][data-value=${dataValue}] .hook-actions button:nth-of-type(2)`;
  for (;;) {
    const count = Number(
      evaluate(`document.querySelectorAll(${JSON.stringify(actionSelector)}).length`).trim(),
    );
    if (!Number.isFinite(count) || count === 0) break;
    pilot(["click", actionSelector, "--window", windowLabel], windowLabel);
    evaluate(
      `new Promise((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const check = () => {
          if (document.querySelectorAll(${JSON.stringify(actionSelector)}).length < ${count}) {
            resolve(true);
          } else if (Date.now() >= deadline) {
            reject(new Error("cleanup action did not remove its item"));
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })`,
    );
  }
}

function captureVisualState(theme, language) {
  setVisualState(theme, language);
  evaluate(
    `(() => {
      const expectedTheme = ${JSON.stringify(theme)};
      const className = document.documentElement.className;
      if (expectedTheme !== "system" && className !== expectedTheme) {
        throw new Error("expected theme " + expectedTheme + ", got " + className);
      }
      const text = document.body.innerText;
      const expected = ${JSON.stringify(language === "en" ? "Lifecycle automation" : "生命周期自动化")};
      if (!text.includes(expected)) throw new Error("expected locale text is missing: " + expected);
      return true;
    })()`,
  );
  runScenario("automation-visual.toml");
  const artifact = join(artifactRoot, `automation-${theme}-${language}.png`);
  const screenshotMode =
    process.env.BLACKBOX_SCREENSHOT_MODE || (process.platform === "linux" ? "native" : "webview");
  if (screenshotMode === "native") {
    pilot(
      [
        "screenshot_native",
        "--window-id",
        nativeWindowId(),
        "--output",
        artifact,
        "--window",
        windowLabel,
      ],
      windowLabel,
    );
  } else if (screenshotMode === "webview") {
    pilot(["screenshot", artifact, "--window", windowLabel], windowLabel);
  } else {
    throw new Error(`Unsupported BLACKBOX_SCREENSHOT_MODE: ${screenshotMode}`);
  }
  process.stderr.write(`black-box screenshot: ${artifact}\n`);
}

/**
 * The automation surface keeps its requested section as an initial selection,
 * so read the visible panels back from the in-window fullscreen surface only.
 *
 * @param {string} section
 * @param {string} reason
 */
function expectActiveSection(section, reason) {
  const active = evaluate(
    '(() => { const panels = [...document.querySelectorAll(".fullscreen-surface [role=tabpanel]")].filter((panel) => !panel.hasAttribute("hidden")); return panels.map((panel) => panel.getAttribute("data-value")).filter(Boolean).join(","); })()',
  )
    .trim()
    .split(",")
    .filter(Boolean);
  if (!active.includes(section)) {
    throw new Error(`${reason} (active sections: ${active.join(", ") || "none"})`);
  }
}

pilot(["ping"], undefined);
openAutomationSurface();
setVisualState("system", "zh");
cleanupPanel("lifecycle");
cleanupPanel("schedules");
runScenario("automation-topbar.toml");
expectActiveSection("schedules", "schedule menu entry did not select schedules");
dispatchShortcut("7", "Digit7", { ctrlKey: true, shiftKey: true });
expectActiveSection("lifecycle", "Ctrl+Shift+7 did not select lifecycle");
dispatchShortcut("8", "Digit8", { ctrlKey: true, shiftKey: true });
expectActiveSection("schedules", "Ctrl+Shift+8 did not select schedules");
runScenario("automation-lifecycle.toml");
runScenario("automation-persistence.toml");
// Reload the whole window so the saved hook must come back from durable
// configuration instead of from the mounted surface's in-memory draft.
evaluate(
  "window.__openagentBlackboxReloadPending = true; setTimeout(() => location.reload(), 100); true",
);
waitForWindowReload();
waitForElement("#application-automation-menu");
openAutomationSurface();
waitForElement("[role=tabpanel][data-value=lifecycle] .hook-item");
evaluate(
  '(() => { const text = document.querySelector("[role=tabpanel][data-value=lifecycle]")?.textContent ?? ""; if (!text.includes("Blackbox Persistence Hook") || !text.includes("echo blackbox persistence")) throw new Error("saved lifecycle hook did not survive the window reload"); return true; })()',
);
cleanupPanel("lifecycle");
runScenario("automation-schedules.toml");

try {
  captureVisualState("light", "en");
  captureVisualState("dark", "en");
  captureVisualState("system", "zh");
} finally {
  openGeneralSurface();
  chooseGeneralOption(
    '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(2) button',
    "zh",
  );
  chooseGeneralOption(
    '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button',
    "system",
  );
}

process.stdout.write("Automation black-box tests passed.\n");
