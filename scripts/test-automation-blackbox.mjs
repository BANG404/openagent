// @ts-check

import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenarioRoot = join(workspaceRoot, "tests", "blackbox");
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const isolatedHome = process.env.OPENAGENT_HOME;
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-automation-blackbox-"));
mkdirSync(artifactRoot, { recursive: true });

if (!isolatedHome) {
  throw new Error("OPENAGENT_HOME is required and must point to an isolated test directory");
}
if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to run black-box automation against ~/.openagent");
}

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

/** @param {string} scenario @param {string} windowLabel */
function runScenario(scenario, windowLabel) {
  pilot(["run", join(scenarioRoot, scenario), "--window", windowLabel], windowLabel);
}

/** @param {string} script @param {string} windowLabel */
function evaluate(script, windowLabel) {
  pilot(["eval", script, "--window", windowLabel], windowLabel);
}

function waitForElement(selector, windowLabel) {
  pilot(
    ["wait", "--selector", selector, "--timeout", "10000", "--window", windowLabel],
    windowLabel,
  );
}

function chooseGeneralOption(selector, value) {
  pilot(["click", selector, "--window", "settings-general"], "settings-general");
  pilot(
    ["click", `[role=option][data-value=${value}]`, "--window", "settings-general"],
    "settings-general",
  );
}

function setVisualState(theme, language) {
  waitForElement(
    '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button',
    "settings-general",
  );
  waitForElement("[role=tab][data-value=lifecycle]", "settings-automation");
  chooseGeneralOption(
    '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button',
    theme,
  );
  chooseGeneralOption(
    '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(2) button',
    language,
  );
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
    "settings-automation",
  );
}

function cleanupPanel(dataValue) {
  pilot(
    ["click", `[role=tab][data-value=${dataValue}]`, "--window", "settings-automation"],
    "settings-automation",
  );
  evaluate(
    `new Promise(async (resolve) => {
      const panel = document.querySelector(${JSON.stringify(`[role=tabpanel][data-value=${dataValue}]`)});
      for (;;) {
        const cancel = panel?.querySelector(".hook-actions button:last-child");
        if (!(cancel instanceof HTMLElement)) break;
        cancel.click();
        await new Promise((wait) => setTimeout(wait, 150));
      }
      resolve(true);
    })`,
    "settings-automation",
  );
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
    "settings-automation",
  );
  runScenario("automation-visual.toml", "settings-automation");
  const artifact = join(artifactRoot, `automation-${theme}-${language}.png`);
  pilot(["screenshot", artifact, "--window", "settings-automation"], "settings-automation");
  process.stderr.write(`black-box screenshot: ${artifact}\n`);
}

pilot(["ping"], undefined);
evaluate(
  '(() => { window.dispatchEvent(new KeyboardEvent("keydown", {key: ",", code: "Comma", ctrlKey: true, bubbles: true})); return true; })()',
  "main",
);
evaluate(
  '(() => { window.dispatchEvent(new KeyboardEvent("keydown", {key: "7", code: "Digit7", ctrlKey: true, shiftKey: true, bubbles: true})); return true; })()',
  "main",
);
setVisualState("system", "zh");
cleanupPanel("lifecycle");
cleanupPanel("schedules");
runScenario("automation-topbar.toml", "main");
evaluate(
  '(() => { const active = [...document.querySelectorAll("[role=tabpanel]")].filter((panel) => !panel.hasAttribute("hidden")).map((panel) => panel.getAttribute("data-value")); if (!active.includes("schedules")) throw new Error("schedule menu entry did not select schedules"); return active; })()',
  "settings-automation",
);
evaluate(
  '(() => { window.dispatchEvent(new KeyboardEvent("keydown", {key: "7", code: "Digit7", ctrlKey: true, shiftKey: true, bubbles: true})); return true; })()',
  "main",
);
evaluate(
  '(() => { const active = [...document.querySelectorAll("[role=tabpanel]")].filter((panel) => !panel.hasAttribute("hidden")).map((panel) => panel.getAttribute("data-value")); if (!active.includes("lifecycle")) throw new Error("Ctrl+Shift+7 did not select lifecycle"); return active; })()',
  "settings-automation",
);
runScenario("automation-lifecycle.toml", "settings-automation");
runScenario("automation-schedules.toml", "settings-automation");

try {
  captureVisualState("light", "en");
  captureVisualState("dark", "en");
  captureVisualState("system", "zh");
} finally {
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
