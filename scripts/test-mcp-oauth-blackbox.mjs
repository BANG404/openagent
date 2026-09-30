// @ts-check

// Drive the committed MCP OAuth black-box scenario against a running debug
// instance. The settings surface decides whether to offer authorization from
// the capability a connection probe established, so the run needs an endpoint
// that answers the probe in a controlled way: `tests/fixtures/mcp-oauth-probe`
// binds an ephemeral loopback port and is spawned here. Its base URL and the
// localized copy for the active language are injected into the window before
// each pass, which keeps the committed scenario free of both the port and the
// locale.
//
// The probe endpoint answers both shapes the decision depends on, so the
// scenario asserts the rendered result rather than the conclusion:
//
//   /unsupported  401 with a Bearer challenge whose metadata is not served,
//                 which must replace the action with an explanation
//   /required     401 with a Bearer challenge whose metadata is served at the
//                 RFC 9728 location, which must keep the action
//
// Both demand credentials, so the run also pins the unchanged connection
// failure copy: the action is decided by the OAuth capability, never by whether
// the test succeeded.
//
// Like the chat-group and MCP Apps runners this one does not seed through the
// dev API and so does not require `--multi-instance`; start the debug app with
// the same isolated home instead:
//
//   OPENAGENT_HOME="$HOME/.openagent-dev/instances/blackbox" bun tauri dev
//   bun run test:blackbox:mcp-oauth

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { en } from "../src/lib/i18n.en.ts";
import { zh } from "../src/lib/i18n.zh.ts";
import { blackboxInstanceName, resolveBlackboxHome } from "./tauri-test-environment.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenario = join(workspaceRoot, "tests", "blackbox", "mcp-oauth.toml");
const fixture = join(workspaceRoot, "tests", "fixtures", "mcp-oauth-probe", "server.mjs");
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const isolatedHome = resolveBlackboxHome(process.env);
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), "openagent-mcp-oauth-blackbox-"));
const windowLabel = "main";

if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to run MCP OAuth black-box verification against ~/.openagent");
}

mkdirSync(artifactRoot, { recursive: true });
process.env.OPENAGENT_HOME = isolatedHome;
process.env.OPENAGENT_DEV_INSTANCE ||= blackboxInstanceName(process.env);

/** @type {NodeJS.ProcessEnv} */
const pilotEnv = { ...process.env, TAURI_PILOT_WINDOW: windowLabel };

/**
 * @param {string[]} args
 * @param {boolean} [capture]
 */
function pilot(args, capture = false) {
  const result = spawnSync(pilotBinary, args, {
    cwd: artifactRoot,
    env: pilotEnv,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tauri-pilot ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return capture ? (result.stdout ?? "") : "";
}

/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script, "--window", windowLabel], true).trim();
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
    const observed = evaluate(script);
    if (observed === "true") return;
    if (Date.now() >= deadline) throw new Error(`${description} (observed: ${observed})`);
    sleepSync(100);
  }
}

/** @param {string} selector */
function waitForElement(selector) {
  pilot(["wait", "--selector", selector, "--timeout", "20000", "--window", windowLabel]);
}

/**
 * Start the probe endpoint and resolve once it publishes its loopback base URL.
 * The fixture runs on the same runtime that runs this script, which is Bun, and
 * uses nothing beyond `node:http`.
 */
function startProbeEndpoint() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [fixture], { stdio: ["ignore", "pipe", "pipe"] });
    let buffered = "";
    let started = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      const newline = buffered.indexOf("\n");
      if (newline < 0 || started) return;
      started = true;
      resolvePromise({
        base: buffered.slice(0, newline).trim(),
        stop: () => child.kill(),
      });
    });
    child.on("error", (error) => {
      if (!started) reject(error);
    });
    child.on("exit", (code) => {
      if (!started) reject(new Error(`the MCP OAuth probe fixture exited with code ${code}`));
    });
  });
}

/**
 * Publish the probe endpoint and the copy the active language renders for it.
 * The catalogs are imported so the scenario asserts which explanation is shown
 * rather than a copy of the text, and the failure prefix comes from the same
 * translation the probe outcome keeps.
 *
 * @param {string} base
 * @param {"en" | "zh"} language
 */
function injectProbe(base, language) {
  const catalog = language === "en" ? en : zh;
  const payload = {
    base,
    hint: catalog.mcpOAuthUnsupported,
    failure: `${catalog.mcpTestFailed}: `,
  };
  evaluate(`window.__mcpOAuthProbe = ${JSON.stringify(payload)}; true`);
}

function runScenario() {
  pilot(["run", scenario, "--window", windowLabel]);
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
 * Close the settings surface by targeting the dialog that owns the Appearance
 * panel, then confirm it is gone. A blanket `[role=dialog]` lookup could select
 * an unrelated surface and leave settings open, which would turn the following
 * `Ctrl+,` into a close instead of an open.
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

const endpoint = await startProbeEndpoint();
process.stdout.write(`Serving the MCP OAuth probe endpoint at ${endpoint.base}.\n`);

try {
  waitForElement("#application-integrations-menu");
  // The scenario purges any probe connector it finds before creating its own,
  // so a run that aborted earlier cannot decide this one and both passes below
  // start from the same state.
  setVisualState("light", "en");
  injectProbe(endpoint.base, "en");
  runScenario();

  setVisualState("dark", "zh");
  injectProbe(endpoint.base, "zh");
  runScenario();
} finally {
  endpoint.stop();
}

const logs = spawnSync(pilotBinary, ["logs", "--level", "error", "--window", windowLabel], {
  cwd: artifactRoot,
  env: pilotEnv,
  encoding: "utf8",
  stdio: "inherit",
});
if (logs.error) throw logs.error;
if (logs.status !== 0) throw new Error("tauri-pilot failed to read MCP settings window logs");

process.stdout.write("MCP OAuth black-box tests passed.\n");
