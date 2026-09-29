// @ts-check

// Drive the committed MCP Apps black-box scenarios against a running debug
// instance. The runtime side is seeded through the loopback dev API, which
// connects `tests/fixtures/mcp-app-demo/server.mjs` over real stdio, reads its
// `ui://` resource, and emits the same `chat-tool-call`/`chat-tool-result`
// events a provider round would. Nothing here needs a provider, a model turn,
// or a committed database fixture.
//
// The widget lives in a `sandbox="allow-scripts"` iframe, so the parent window
// cannot read it. Every assertion below is therefore a host-observable signal:
// the `.mcp-app-frame` inline height the widget reports through
// `notifyIntrinsicHeight`, the host locale the frame carries, and the frame's
// teardown classes.

import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { blackboxInstanceName, resolveBlackboxHome } from "./tauri-test-environment.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenarioRoot = join(workspaceRoot, "tests", "blackbox");
const fixtureRoot = join(workspaceRoot, "tests", "fixtures", "mcp-app-demo");
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const isolatedHome = resolveBlackboxHome(process.env);
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-mcp-apps-blackbox-"));
const windowLabel = "main";

// The widget reports `260 + (dark ? 40 : 0) + (app tool ok ? 100 : 0) +
// (file round trip ok ? 200 : 0)`. These are the two heights the run expects.
const LIGHT_FULL_SUCCESS_HEIGHT = "560px";
const DARK_FULL_SUCCESS_HEIGHT = "600px";

if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to run MCP Apps black-box verification against ~/.openagent");
}

mkdirSync(artifactRoot, { recursive: true });
process.env.OPENAGENT_HOME = isolatedHome;
process.env.OPENAGENT_DEV_INSTANCE ||= blackboxInstanceName(process.env);

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(pilotBinary, args, {
    cwd: artifactRoot,
    env: { ...process.env, TAURI_PILOT_WINDOW: windowLabel },
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

/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script, "--window", windowLabel]);
}

/**
 * A synchronous sleep for the poll loops below. `tauri-pilot eval` caps a
 * single script at roughly ten seconds, so a wait that can outlast that budget
 * has to be driven from this process with repeated cheap probes instead of by
 * an in-page timer.
 *
 * @param {number} ms
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run an eval without echoing anything, for use inside a poll loop.
 *
 * @param {string} script
 */
function probe(script) {
  const result = spawnSync(pilotBinary, ["eval", script, "--window", windowLabel], {
    cwd: artifactRoot,
    env: { ...process.env, TAURI_PILOT_WINDOW: windowLabel },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tauri-pilot eval failed with exit code ${result.status}: ${result.stderr}`);
  }
  return (result.stdout || "").trim();
}

/**
 * Poll a synchronous probe until it returns `"true"`. The probe returns a JSON
 * snapshot of the observed state otherwise, which becomes the failure detail.
 *
 * @param {string} script
 * @param {string} description
 * @param {number} timeoutMs
 */
function waitUntil(script, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const observed = probe(script);
    if (observed === "true") return;
    if (Date.now() >= deadline) {
      throw new Error(`${description} (observed: ${observed})`);
    }
    sleepSync(100);
  }
}

/** @param {string} selector */
function waitForElement(selector) {
  pilot(["wait", "--selector", selector, "--timeout", "20000", "--window", windowLabel]);
}

/** @param {string} scenario */
function runScenario(scenario) {
  pilot(["run", join(scenarioRoot, scenario), "--window", windowLabel]);
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

const THEME_ROW = '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(1) button';
const LANGUAGE_ROW = '[role=tabpanel][data-value="general"] .settings-card-row:nth-child(2) button';

/**
 * @param {string} selector
 * @param {string} value
 */
function chooseGeneralOption(selector, value) {
  pilot(["click", selector, "--window", windowLabel]);
  pilot(["click", `[role=option][data-value=${value}]`, "--window", windowLabel]);
}

/**
 * Close the settings surface by targeting the dialog that actually owns the
 * Appearance panel, then confirm it is gone. A blanket `[role=dialog]` lookup
 * could select an unrelated surface and leave settings open, which would turn
 * the following `Ctrl+,` into a close instead of an open.
 */
function closeSettingsSurface() {
  evaluate(
    `(() => {
      const panel = document.querySelector('[role=tabpanel][data-value="general"]');
      const dialog = panel instanceof HTMLElement ? panel.closest('[role=dialog]') : null;
      const close = dialog
        ? dialog.querySelector('button[aria-label="Close"], button[aria-label="关闭"]')
        : null;
      if (!(close instanceof HTMLElement)) {
        throw new Error("the settings surface close control is missing");
      }
      close.click();
      return true;
    })()`,
  );
  waitUntil(
    `document.querySelector('[role=tabpanel][data-value="general"]')
      ? JSON.stringify("the general panel is still mounted")
      : "true"`,
    "the settings surface did not close",
    15000,
  );
}

/**
 * Poll until the requested appearance is actually applied. The language only
 * reaches i18n when the settings surface closes and autosaves its draft, so the
 * caller cannot assume the choice took effect synchronously.
 *
 * @param {string} theme
 * @param {"en" | "zh"} language
 */
function waitForVisualState(theme, language) {
  const expectedText = language === "en" ? "New chat" : "新聊天";
  waitUntil(
    `(() => {
      const classNames = document.documentElement.classList;
      const themeReady =
        ${JSON.stringify(theme)} === "system" || classNames.contains(${JSON.stringify(theme)});
      const languageReady = document.body.innerText.includes(${JSON.stringify(expectedText)});
      return themeReady && languageReady
        ? "true"
        : JSON.stringify({ className: classNames.value, languageReady: languageReady });
    })()`,
    `visual state did not reach theme=${theme} language=${language}`,
    20000,
  );
}

/**
 * @param {string} theme
 * @param {"en" | "zh"} language
 */
function setVisualState(theme, language) {
  dispatchShortcut(",", "Comma", { ctrlKey: true });
  waitForElement(THEME_ROW);
  chooseGeneralOption(THEME_ROW, theme);
  chooseGeneralOption(LANGUAGE_ROW, language);
  closeSettingsSurface();
  waitForVisualState(theme, language);
}

/**
 * The seeded conversation is projected into the sidebar from the live
 * `chat-response-started` event, so the run waits for the exact title instead of
 * for whichever conversation happens to be listed first.
 *
 * @param {string} title
 * @param {string} description
 */
function waitForSidebarConversation(title, description) {
  waitUntil(
    `(() => {
      const items = [...document.querySelectorAll(".conv-item")];
      const matched = items.some((candidate) =>
        (candidate.textContent ?? "").includes(${JSON.stringify(title)})
      );
      return matched ? "true" : JSON.stringify({ conversationItems: items.length });
    })()`,
    description,
    30000,
  );
}

/**
 * @param {string} expected
 * @param {string} description
 */
function waitForFrameHeight(expected, description) {
  waitUntil(
    `(() => {
      const frame = document.querySelector(".mcp-app-frame");
      if (!(frame instanceof HTMLElement)) return JSON.stringify("<no frame>");
      return frame.style.height === ${JSON.stringify(expected)}
        ? "true"
        : JSON.stringify({ height: frame.style.height });
    })()`,
    description,
    30000,
  );
}

/**
 * @param {string} expected
 * @param {string} description
 */
function waitForFrameLabel(expected, description) {
  waitUntil(
    `(() => {
      const frame = document.querySelector(".mcp-app-frame");
      if (!(frame instanceof HTMLElement)) return JSON.stringify("<no frame>");
      const label = frame.getAttribute("aria-label");
      return label === ${JSON.stringify(expected)}
        ? "true"
        : JSON.stringify({ ariaLabel: label });
    })()`,
    description,
    30000,
  );
}

/**
 * The debug instance resolves `config_dir()` from `OPENAGENT_HOME`, so the
 * fixture has to be staged under the isolated root the running app was started
 * with.
 */
function stageFixture() {
  const target = join(isolatedHome, "mcp-app-fixture");
  mkdirSync(target, { recursive: true });
  cpSync(fixtureRoot, target, { recursive: true });
  return join(target, "server.mjs");
}

/** @param {boolean} close */
async function seedMcpAppConversation(close) {
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
  const headers = {
    Authorization: `Bearer ${manifest.token}`,
    "Content-Type": "application/json",
  };
  const health = await fetch(`${manifest.base_url}/v1/health`, { headers });
  if (!health.ok) {
    throw new Error(`the isolated dev API failed its health check: HTTP ${health.status}`);
  }
  const response = await fetch(`${manifest.base_url}/v1/diagnostics/mcp-app-conversation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ close }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`seeding the MCP Apps conversation failed: ${JSON.stringify(body)}`);
  }
  return body;
}

const staged = stageFixture();
process.stdout.write(`Staged the MCP Apps fixture at ${staged}.\n`);

// Start from a known appearance so the widget height and the host locale are
// asserted against explicit values instead of the developer's saved defaults.
waitForElement("#application-integrations-menu");
setVisualState("light", "en");

const seeded = await seedMcpAppConversation(false);
process.stdout.write(`Seeded MCP Apps conversation ${seeded.conv_id}.\n`);
waitForSidebarConversation(
  "MCP Apps diagnostic",
  "the seeded MCP Apps conversation never reached the sidebar",
);
// `mcp-apps.toml` owns the light-theme baseline: the frame mounts, reports
// `LIGHT_FULL_SUCCESS_HEIGHT`, and carries the English host locale.
runScenario("mcp-apps.toml");
// Re-read the baseline so the theme delta below is asserted against a known
// "before" height rather than only against the expected "after" height.
waitForFrameHeight(
  LIGHT_FULL_SUCCESS_HEIGHT,
  "the app frame left the baseline light-theme height before the theme switch",
);

// Theme: `applyTheme` is the settings preview, so it lands while the surface is
// still open. Assert before and after closing so a saved-draft regression that
// reverts the theme on close cannot pass.
dispatchShortcut(",", "Comma", { ctrlKey: true });
waitForElement(THEME_ROW);
chooseGeneralOption(THEME_ROW, "dark");
waitForFrameHeight(DARK_FULL_SUCCESS_HEIGHT, "the app frame never reported the dark theme");
closeSettingsSurface();
waitForVisualState("dark", "en");
waitForFrameHeight(DARK_FULL_SUCCESS_HEIGHT, "closing settings reverted the app frame theme");

// Language: the locale is asserted from the runner because the baseline
// scenario only covers one language.
dispatchShortcut(",", "Comma", { ctrlKey: true });
waitForElement(LANGUAGE_ROW);
chooseGeneralOption(LANGUAGE_ROW, "zh");
closeSettingsSurface();
waitForVisualState("dark", "zh");
waitForFrameLabel("MCP 应用", "the Chinese host locale never reached the app frame");

// The close-marked conversation goes second: selecting it also unmounts the
// first conversation's frame, which the teardown scenario asserts did not leak.
const closing = await seedMcpAppConversation(true);
process.stdout.write(`Seeded close-marked MCP Apps conversation ${closing.conv_id}.\n`);
waitForSidebarConversation(
  "MCP Apps diagnostic close",
  "the close-marked MCP Apps conversation never reached the sidebar",
);
runScenario("mcp-apps-teardown.toml");

const logs = spawnSync(pilotBinary, ["logs", "--level", "error", "--window", windowLabel], {
  cwd: artifactRoot,
  env: { ...process.env, TAURI_PILOT_WINDOW: windowLabel },
  encoding: "utf8",
  stdio: "inherit",
});
if (logs.error) throw logs.error;
if (logs.status !== 0) throw new Error("tauri-pilot failed to read MCP Apps window logs");

process.stdout.write("MCP Apps black-box tests passed.\n");
