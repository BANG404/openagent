// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

if (process.platform !== "win32") throw new Error("This desktop fixture targets Windows");
const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-welcome-dev-"));
const environment = {
  ...process.env,
  OPENAGENT_HOME: path.join(directory, "data"),
  OPENAGENT_DEV_MULTI_INSTANCE: "1",
  OPENAGENT_DEV_INSTANCE: "welcome-resources",
  TAURI_PILOT_SOCKET: String.raw`\\.\pipe\tauri-pilot-com.iumm.openagent.dev.welcome-resources`,
};
delete environment.OPENAGENT_BOOTSTRAP_TEST;
/** @type {string[]} */
const logs = [];
/** @param {string[]} args */
function start(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: environment,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (chunk) => {
      logs.push(String(chunk));
      process.stdout.write(String(chunk));
    });
  return child;
}
/** @param {string[]} args @param {string} [window] */
function pilot(args, window = "onboarding") {
  const result = spawnSync("tauri-pilot", [...args, "--window", window], {
    cwd: directory,
    env: environment,
    windowsHide: true,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} expression @param {string} [window] @param {number} [timeout] */
async function until(expression, window = "onboarding", timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (pilot(["eval", expression], window) === "true") return;
    } catch {
      // The selected fixture window can still be compiling or hydrating.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Welcome fixture timed out: ${expression}`);
}
/** @param {string} command @param {unknown} args @param {string} [window] @returns {any} */
function invoke(command, args, window = "onboarding") {
  return JSON.parse(
    pilot(
      [
        "eval",
        `(async () => { const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); return JSON.stringify(await c.invokeProduct(${JSON.stringify(command)},${JSON.stringify(args)})); })()`,
      ],
      window,
    ),
  );
}
const port = 18890;
const vite = start(["x", "vite", "--port", String(port), "--strictPort"]);
/** @type {ReturnType<typeof start> | undefined} */
let desktop;
try {
  const viteDeadline = Date.now() + 30000;
  while (Date.now() < viteDeadline) {
    if (
      await fetch(`http://localhost:${port}`)
        .then((value) => value.ok)
        .catch(() => false)
    )
      break;
    await new Promise((done) => setTimeout(done, 200));
  }
  const desktopArguments = [
    path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
    "dev",
    "--no-watch",
    "--config",
    JSON.stringify({ build: { beforeDevCommand: "", devUrl: `http://localhost:${port}` } }),
    "--",
    "--target-dir",
    path.join(root, "src-tauri/target"),
  ];
  desktop = start(desktopArguments);
  await until("!!document.querySelector('.embedding-card')", "onboarding", 600000);
  await until(
    "document.querySelector('.embedding-meter')?.getAttribute('aria-valuenow') === '100'",
  );
  const config = invoke("get_settings", {});
  assert.equal(config.onboarding_completed, false, "use an actual first-use fixture");
  config.providers = [
    {
      id: "welcome-fixture",
      name: "Local fixture",
      provider: "ollama",
      api_key: "",
      base_url: "http://127.0.0.1:9",
      enabled: true,
      models: ["fixture-model"],
      model_context_compaction_thresholds: {},
      model_reasoning_efforts: {},
      model_reasoning_effort_enabled: {},
      model_vision_enabled: {},
    },
  ];
  config.defaults.chat_model = config.defaults.flash_model = {
    provider_id: "welcome-fixture",
    model: "fixture-model",
  };
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      config.theme = theme;
      config.language = language;
      config.onboarding_completed = false;
      invoke("save_settings", { config });
      pilot(["snapshot", "-i"]);
      pilot([
        "eval",
        "window.__welcomeReload = true; const url = new URL(location.href); url.searchParams.delete('onboarding-preview'); setTimeout(() => location.replace(url.href), 100); true",
      ]);
      await until(
        `!window.__welcomeReload && document.documentElement.classList.contains('dark') === ${theme === "dark"} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(language === "en" ? "Welcome" : "欢迎")}) && document.querySelector('.embedding-meter')?.getAttribute('aria-valuenow') === '100'`,
      );
      pilot([
        "eval",
        "(async () => { await window.__TAURI_INTERNALS__.invoke('plugin:window|show', {label:'onboarding'}); await window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', {label:'onboarding'}); return true; })()",
      ]);
      pilot(["snapshot", "-i"]);
      const welcomeDeadline = Date.now() + 30000;
      for (;;) {
        try {
          pilot(["run", path.join(root, "tests/blackbox/onboarding-welcome.toml")]);
          break;
        } catch (error) {
          if (Date.now() >= welcomeDeadline) throw error;
          // Cold dependency optimization can navigate after the hydration wait.
          // This scenario only reads the DOM; keep its complete assertions on retry.
          await new Promise((done) => setTimeout(done, 250));
        }
      }
      captureBlackboxScreenshot(
        (args) => pilot(args),
        path.join(directory, `${theme}-${language}.png`),
      );
      pilot(["run", path.join(root, "tests/blackbox/onboarding-workspace-preferences.toml")]);
      pilot(["run", path.join(root, "tests/blackbox/onboarding-welcome-finish.toml")]);
      await until(
        "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label:'onboarding'}).then(visible => !visible)",
      );
      assert.equal(invoke("get_settings", {}, "main").onboarding_completed, true);

      const saved = invoke("get_settings", {}, "main");
      await until(
        "[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Temporary UI')",
        "debug",
      );
      pilot(
        [
          "eval",
          "(async () => { await window.__TAURI_INTERNALS__.invoke('plugin:window|show', {label:'debug'}); await window.__TAURI_INTERNALS__.invoke('plugin:window|set_focus', {label:'debug'}); return true; })()",
        ],
        "debug",
      );
      pilot(["snapshot", "-i"], "debug");
      pilot(["run", path.join(root, "tests/blackbox/onboarding-inspector-preview.toml")], "debug");
      await until(
        `location.search.includes('onboarding-preview=1') && document.querySelectorAll('.onboarding-nav-item').length === 5 && document.documentElement.classList.contains('dark') === ${theme === "dark"} && document.querySelector('h1')?.textContent.includes(${JSON.stringify(language === "en" ? "Welcome" : "欢迎")}) && document.querySelector('.embedding-meter')?.getAttribute('aria-valuenow') === '100'`,
      );
      pilot(["snapshot", "-i"]);
      pilot(["run", path.join(root, "tests/blackbox/onboarding-welcome.toml")]);
      captureBlackboxScreenshot(
        (args) => pilot(args),
        path.join(directory, `inspector-${theme}-${language}.png`),
      );
      pilot(["run", path.join(root, "tests/blackbox/onboarding-workspace-preferences.toml")]);
      pilot(["run", path.join(root, "tests/blackbox/onboarding-welcome-finish.toml")]);
      await until(
        "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label:'onboarding'}).then(visible => !visible)",
      );
      assert.deepEqual(
        invoke("get_settings", {}, "main"),
        saved,
        "Inspector preview must not save configuration",
      );
    }
  }
  assert(desktop.pid);
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  desktop = start(desktopArguments);
  await until(
    "!!document.querySelector('[role=textbox][contenteditable=true]') && window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label:'main'})",
    "main",
    120000,
  );
  assert.equal(
    pilot(
      [
        "eval",
        "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label:'onboarding'})",
      ],
      "main",
    ),
    "false",
  );
  console.log(
    `Development welcome black-box passed: real first use, embedding in Welcome, loaded logo, all themes/locales, wizard completion and configured restart. Artifacts: ${directory}`,
  );
} finally {
  await writeFile(path.join(directory, "desktop.log"), logs.join(""));
  for (const child of [desktop, vite])
    if (child?.pid)
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
}
