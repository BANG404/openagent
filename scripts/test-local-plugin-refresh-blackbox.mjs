// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { findAvailableLoopbackPort } from "./tauri-dev-port.mjs";

if (process.platform !== "win32") throw new Error("This native fixture targets Windows");
const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-local-plugin-refresh-"));
const source = path.join(directory, "source");
await mkdir(source);
const manifest = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "local-refresh-fixture",
  version: "1.0.0",
};
await writeFile(path.join(source, "plugin.json"), JSON.stringify(manifest));
await writeFile(path.join(source, "code.mjs"), "original");
const binaryRoot = path.join(root, "src-tauri/binaries");
const selection = JSON.parse(
  await readFile(
    path.join(binaryRoot, "openagent-server-x86_64-pc-windows-msvc.exe.selection.json"),
    "utf8",
  ),
);
const executable = path.join(
  root,
  ".cache/development-runtime/x86_64-pc-windows-msvc",
  selection.sha256,
  "openagent-server.exe",
);
const { runtimeAcceptance } = await import(
  pathToFileURL(path.join(root, "plugins/openagent-plugin-kit/lib/runtime-acceptance.mjs")).href
);
const conversationId = randomUUID();
const model = globalThis.Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    Response.json({
      model: "fixture-model",
      created_at: new Date().toISOString(),
      message: { role: "assistant", content: "Local refresh fixture completed." },
      done: true,
      prompt_eval_count: 10,
      eval_count: 8,
    }),
});
const report = await runtimeAcceptance({
  executable,
  packageDirectory: source,
  workspace: directory,
  outputDirectory: directory,
  verify: async ({ operation, request }) => {
    const config = await operation("get_settings");
    config.onboarding_completed = true;
    config.providers = [
      {
        id: "refresh-fixture",
        name: "Local fixture",
        provider: "ollama",
        api_key: "",
        base_url: model.url.href.replace(/\/$/, ""),
        enabled: true,
        models: ["fixture-model"],
        model_context_compaction_thresholds: {},
        model_reasoning_efforts: {},
        model_reasoning_effort_enabled: {},
        model_vision_enabled: {},
      },
    ];
    config.defaults.chat_model = config.defaults.flash_model = {
      provider_id: "refresh-fixture",
      model: "fixture-model",
    };
    config.memory_retrieval_enabled = false;
    config.approval_mode = "off";
    for (const agent of Object.values(config.flash_agents))
      if (agent && typeof agent === "object") agent.enabled = false;
    await operation("save_settings", { config });
    await operation("create_conversation", {
      id: conversationId,
      title: "Local refresh fixture",
      workspace: directory,
    });
    await operation("create_branch", { id: randomUUID(), convId: conversationId });
    await request(`/api/conversations/${conversationId}/runs`, {
      text: "Reply with the fixture confirmation.",
      user_message_id: randomUUID(),
      assistant_message_id: randomUUID(),
      attachments: [],
      contexts: [],
      model_binding: { providerId: "refresh-fixture", model: "fixture-model" },
    });
    const deadline = Date.now() + 30000;
    for (;;) {
      const checkpoints = await operation("get_renderable_checkpoints", { convId: conversationId });
      if (checkpoints.some((checkpoint) => checkpoint.data?.phase === "final_completed")) break;
      assert(Date.now() < deadline, "fixture chat must finish before the Runtime shuts down");
      await new Promise((done) => setTimeout(done, 100));
    }
    return [{ kind: "isolated-desktop-fixture", passed: true }];
  },
});
assert.equal(report.passed, true, report.error);
const home = report.home;
const control = path.join(directory, "diagnostic.control");
await writeFile(control, "running");
const diagnostic = spawn(
  executable,
  [
    "--desktop-api",
    "--desktop-primary",
    "--control-file",
    control,
    "--workspace",
    directory,
    "--token-env",
    "OPENAGENT_REFRESH_TEST_TOKEN",
    "--output",
    "json",
  ],
  {
    env: { ...process.env, OPENAGENT_HOME: home, OPENAGENT_REFRESH_TEST_TOKEN: randomUUID() },
    windowsHide: true,
    stdio: "ignore",
  },
);
try {
  const deadline = Date.now() + 30000;
  while (!existsSync(path.join(home, "dev-api.json"))) {
    assert(
      diagnostic.exitCode === null && Date.now() < deadline,
      "isolated diagnostic Runtime must become ready",
    );
    await new Promise((done) => setTimeout(done, 100));
  }
  for (const command of ["renderability", "diagnose"]) {
    const result = spawnSync(
      "python",
      [
        path.join(root, "sdk/.agents/skills/openagent-dev-chat/scripts/openagent_dev.py"),
        command,
        conversationId,
      ],
      { env: { ...process.env, OPENAGENT_CONFIG_DIR: home }, windowsHide: true, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    await writeFile(path.join(directory, `${command}.json`), result.stdout);
    if (command === "renderability") {
      const rendering = JSON.parse(result.stdout);
      assert.equal(
        rendering.errors?.length ?? 0,
        0,
        "fixture checkpoint rendering must remain valid",
      );
    }
  }
} finally {
  await writeFile(control, "shutdown");
  const deadline = Date.now() + 10000;
  while (diagnostic.exitCode === null && Date.now() < deadline)
    await new Promise((done) => setTimeout(done, 100));
  if (diagnostic.exitCode === null) diagnostic.kill();
  model.stop(true);
}
const data = path.join(home, "plugin-data/local-refresh-fixture");
await mkdir(data, { recursive: true });
await writeFile(path.join(data, "retained.txt"), "retained");
const port = await findAvailableLoopbackPort();
const environment = {
  ...process.env,
  OPENAGENT_HOME: home,
  OPENAGENT_DEV_MULTI_INSTANCE: "1",
  OPENAGENT_DEV_INSTANCE: "local-plugin-refresh",
  OPENAGENT_DEV_PORT: String(port),
  TAURI_PILOT_SOCKET: String.raw`\\.\pipe\tauri-pilot-com.iumm.openagent.dev.local-plugin-refresh`,
};
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
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(
    process.env.TAURI_PILOT_BIN || "tauri-pilot",
    [...args, "--window", "main"],
    { cwd: directory, env: environment, windowsHide: true, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
/** @param {string} expression @param {number} [timeout] */
async function until(expression, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (desktop?.exitCode != null) throw new Error("Fixture desktop exited");
    try {
      if (pilot(["eval", expression]) === "true") return;
    } catch {
      /* compiling or hydrating */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Local refresh fixture timed out: ${expression}`);
}
/** @param {string} command @param {unknown} args @returns {any} */
function operation(command, args) {
  return JSON.parse(
    pilot([
      "eval",
      `(async () => {const {desktopOpenAgent:c}=await import('/src/lib/openagent/tauriClient.ts'); return JSON.stringify(await c.invokeProduct(${JSON.stringify(command)}, ${JSON.stringify(args)}));})()`,
    ]),
  );
}
const card = '.plugin-accordion-item[data-plugin-id="local-refresh-fixture"]';
async function openPlugins() {
  const deadline = Date.now() + 45000;
  for (;;) {
    if (
      pilot([
        "eval",
        "[...document.querySelectorAll('.plugin-management-tabs [role=tab]')].some(tab => /Installed|已安装/.test(tab.textContent))",
      ]) === "true"
    )
      break;
    assert(Date.now() < deadline, "Plugins settings must open after cold dependency reloads");
    pilot(["snapshot", "-i"]);
    pilot([
      "eval",
      "(() => { const item=[...document.querySelectorAll('[role=menuitem]')].find(item => /Plugins|插件/.test(item.textContent)); if(item) item.click(); else if(!document.querySelector('[role=dialog]')) document.querySelector('#application-integrations-menu')?.click(); return true; })()",
    ]);
    await new Promise((done) => setTimeout(done, 250));
  }
  pilot(["snapshot", "-i"]);
  pilot([
    "eval",
    "[...document.querySelectorAll('.plugin-management-tabs [role=tab]')].find(tab => /Installed|已安装/.test(tab.textContent))?.click(); true",
  ]);
  await until(`!!document.querySelector(${JSON.stringify(card)})`);
  pilot(["snapshot", "-i"]);
  pilot(["click", `${card} .plugin-accordion-trigger`]);
  await until(`!!document.querySelector('${card} .plugin-accordion-content[data-state=open]')`);
}
const vite = start(["x", "vite", "--port", String(port), "--strictPort"]);
/** @type {ReturnType<typeof start> | undefined} */
let desktop;
try {
  const ready = Date.now() + 30000;
  while (Date.now() < ready) {
    if (
      await fetch(`http://localhost:${port}`)
        .then((response) => response.ok)
        .catch(() => false)
    )
      break;
    await new Promise((done) => setTimeout(done, 200));
  }
  desktop = start([
    path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
    "dev",
    "--no-watch",
    "--config",
    JSON.stringify({ build: { beforeDevCommand: "", devUrl: `http://localhost:${port}` } }),
    "--",
    "--target-dir",
    process.env.BLACKBOX_HOST_TARGET_DIR || path.join(root, "src-tauri/target"),
  ]);
  await until("!!document.querySelector('#application-integrations-menu')", 600000);
  pilot([
    "eval",
    "window.__TAURI_INTERNALS__.invoke('plugin:window|set_title', {label:'main', value:'OpenAgent'}).then(() => true)",
  ]);
  if (!process.env.BLACKBOX_NATIVE_WINDOW_ID) {
    const handle = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-Process openagent -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:OPENAGENT_BLACKBOX_BINARY_PATH } | Select-Object -ExpandProperty Id",
      ],
      {
        env: {
          ...environment,
          OPENAGENT_BLACKBOX_BINARY_PATH: path.win32.normalize(
            path.join(
              process.env.BLACKBOX_HOST_TARGET_DIR || path.join(root, "src-tauri/target"),
              "debug/openagent.exe",
            ),
          ),
        },
        windowsHide: true,
        encoding: "utf8",
      },
    );
    const handles = handle.stdout
      .trim()
      .split(/\s+/)
      .filter((value) => /^\d+$/.test(value) && value !== "0");
    assert.equal(
      handles.length,
      1,
      `native capture must identify only this task's OpenAgent window: ${handle.stderr || handle.stdout}`,
    );
    const native = spawnSync(
      "python",
      [
        "-c",
        "import ctypes,sys\nfrom ctypes import wintypes\nu=ctypes.windll.user32\nhandles=[]\n@ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)\ndef inspect(hwnd,param):\n p=wintypes.DWORD();u.GetWindowThreadProcessId(hwnd,ctypes.byref(p))\n title=ctypes.create_unicode_buffer(512);u.GetWindowTextW(hwnd,title,512)\n if p.value==int(sys.argv[1]) and title.value=='OpenAgent':handles.append(hwnd)\n return True\nu.EnumWindows(inspect,0)\nassert len(handles)==1, 'Expected this fixture main window'\nprint(handles[0])",
        handles[0],
      ],
      { windowsHide: true, encoding: "utf8" },
    );
    assert.equal(native.status, 0, native.stderr);
    process.env.BLACKBOX_NATIVE_WINDOW_ID = native.stdout.trim();
  }
  for (const [theme, language] of /** @type {const} */ [
    ["light", "en"],
    ["dark", "zh"],
    ["light", "zh"],
    ["dark", "en"],
  ]) {
    const config = operation("get_settings", {});
    config.theme = theme;
    config.language = language;
    operation("save_settings", { config });
    pilot([
      "eval",
      "window.__localRefreshReload = true; setTimeout(() => location.reload(), 100); true",
    ]);
    await until(
      `!window.__localRefreshReload && document.documentElement.classList.contains('dark') === ${theme === "dark"} && !!document.querySelector('#application-integrations-menu')`,
    );
    await openPlugins();
    pilot(["run", path.join(root, "tests/blackbox/local-plugin-refresh.toml")]);
    manifest.version = `${theme === "light" ? 2 : 3}.${language === "en" ? 1 : 2}.0`;
    await writeFile(path.join(source, "plugin.json"), JSON.stringify(manifest));
    await until(
      `document.querySelector('${card} .plugin-version')?.textContent.includes(${JSON.stringify(manifest.version)})`,
    );
    await writeFile(path.join(source, "code.mjs"), `${theme}-${language}`);
    pilot(["run", path.join(root, "tests/blackbox/local-plugin-refresh.toml")]);
    assert.equal(
      await readFile(path.join(home, "plugins/local-refresh-fixture/code.mjs"), "utf8"),
      `${theme}-${language}`,
    );
    await writeFile(path.join(source, "plugin.json"), "{");
    pilot(["run", path.join(root, "tests/blackbox/local-plugin-refresh.toml")]);
    await until(
      "document.querySelector('.settings-tab-panel[data-value=plugins] .provider-status.error')?.textContent.includes('local-refresh-fixture:')",
    );
    assert.equal(
      JSON.parse(
        await readFile(path.join(home, "plugins/local-refresh-fixture/plugin.json"), "utf8"),
      ).version,
      manifest.version,
    );
    pilot([
      "eval",
      "window.__TAURI_INTERNALS__.invoke('plugin:window|set_title', {label:'main', value:'OpenAgent'}).then(() => true)",
    ]);
    captureBlackboxScreenshot(pilot, path.join(directory, `${theme}-${language}-failure.png`));
    await writeFile(path.join(source, "plugin.json"), JSON.stringify(manifest));
    pilot(["run", path.join(root, "tests/blackbox/local-plugin-refresh.toml")]);
    await until(
      "!document.querySelector('.settings-tab-panel[data-value=plugins] .provider-status.error')",
    );
    assert.equal(await readFile(path.join(data, "retained.txt"), "utf8"), "retained");
    pilot([
      "eval",
      "window.__TAURI_INTERNALS__.invoke('plugin:window|set_title', {label:'main', value:'OpenAgent'}).then(() => true)",
    ]);
    captureBlackboxScreenshot(pilot, path.join(directory, `${theme}-${language}-recovered.png`));
    pilot([
      "eval",
      "document.querySelector('[role=dialog] button[aria-label=Close], [role=dialog] button[aria-label=关闭]')?.click(); true",
    ]);
    await until("!document.querySelector('[role=dialog]')");
  }
  console.log(`Local plugin refresh native black-box passed. Artifacts: ${directory}`);
} finally {
  await writeFile(path.join(directory, "desktop.log"), logs.join(""));
  for (const child of [desktop, vite])
    if (child?.pid && child.exitCode === null)
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
}
