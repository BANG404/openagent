// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { findAvailableLoopbackPort } from "./tauri-dev-port.mjs";

if (process.platform !== "win32") throw new Error("This native fixture targets Windows");
const root = path.resolve(import.meta.dirname, "..");
const artifacts = await mkdtemp(path.join(os.tmpdir(), "openagent-desktop-exit-"));
const port = await findAvailableLoopbackPort();
const environment = {
  ...process.env,
  OPENAGENT_DEV_MULTI_INSTANCE: "1",
  OPENAGENT_DEV_INSTANCE: "desktop-exit",
  OPENAGENT_DEV_PARENT_LIFETIME: "1",
  TAURI_PILOT_SOCKET: String.raw`\\.\pipe\tauri-pilot-com.iumm.openagent.dev.desktop-exit`,
  CARGO_INCREMENTAL: "0",
};
/** @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
function start(args, env = environment) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: environment,
    windowsHide: true,
    encoding: "utf8",
    timeout: 40000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string} pass */
async function captureNative(pass) {
  pilot([
    "eval",
    "window.__TAURI_INTERNALS__.invoke('plugin:window|set_title', {label:'main', value:'OpenAgent'})",
  ]);
  const processes = spawnSync(
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
            process.env.CARGO_TARGET_DIR || path.join(root, "src-tauri/target"),
            "debug/openagent.exe",
          ),
        ),
      },
      windowsHide: true,
      encoding: "utf8",
    },
  );
  assert.equal(processes.status, 0, processes.stderr || String(processes.error));
  const pids = processes.stdout
    .trim()
    .split(/\s+/)
    .filter((value) => /^\d+$/.test(value));
  assert.equal(pids.length, 1, "identify only this fixture's native process");
  const pid = Number(pids[0]);
  const native = spawnSync(
    process.env.PYTHON_BIN || "python",
    [
      "-c",
      "import ctypes,sys\nfrom ctypes import wintypes\nu=ctypes.windll.user32\nhandles=[]\n@ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)\ndef inspect(hwnd,param):\n p=wintypes.DWORD();u.GetWindowThreadProcessId(hwnd,ctypes.byref(p))\n title=ctypes.create_unicode_buffer(512);u.GetWindowTextW(hwnd,title,512)\n if p.value==int(sys.argv[1]) and title.value=='OpenAgent':handles.append(hwnd)\n return True\nu.EnumWindows(inspect,0)\nassert len(handles)==1, 'Expected this fixture main window'\nprint(handles[0])",
      String(pid),
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  assert.equal(native.status, 0, native.stderr || String(native.error));
  const previous = process.env.BLACKBOX_NATIVE_WINDOW_ID;
  process.env.BLACKBOX_NATIVE_WINDOW_ID = native.stdout.trim();
  try {
    captureBlackboxScreenshot((args) => pilot(args), path.join(artifacts, `${pass}.png`));
    await writeFile(
      path.join(artifacts, `${pass}-window.json`),
      JSON.stringify({
        pid,
        hwnd: native.stdout.trim(),
        window: "main",
        socket: environment.TAURI_PILOT_SOCKET,
      }),
    );
  } finally {
    if (previous === undefined) delete process.env.BLACKBOX_NATIVE_WINDOW_ID;
    else process.env.BLACKBOX_NATIVE_WINDOW_ID = previous;
  }
}
const vite = start([
  path.join(root, "node_modules/vite/bin/vite.js"),
  "--host",
  "127.0.0.1",
  "--port",
  String(port),
  "--strictPort",
]);
const passes = [
  ...["light", "dark"].flatMap((theme) =>
    ["en", "zh"].map((language) => ({ theme, language, mode: "install" })),
  ),
  { theme: "dark", language: "zh", mode: "quit" },
];
try {
  const viteDeadline = Date.now() + 60000;
  let viteReady = false;
  while (Date.now() < viteDeadline) {
    assert.equal(vite.exitCode, null, "fixture Vite exited during startup");
    viteReady = await fetch(`http://127.0.0.1:${port}`)
      .then((result) => result.ok)
      .catch(() => false);
    if (viteReady) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(viteReady, "fixture Vite did not become ready");
  for (const { theme, language, mode } of passes) {
    const pass = `${mode}-${theme}-${language}`;
    const home = path.join(artifacts, pass);
    const desktop = start(
      [
        path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
        "dev",
        "--no-watch",
        "--config",
        JSON.stringify({
          build: { beforeDevCommand: "", devUrl: `http://127.0.0.1:${port}` },
        }),
      ],
      { ...environment, OPENAGENT_HOME: home },
    );
    try {
      const deadline = Date.now() + 600000;
      let ready = false;
      while (Date.now() < deadline) {
        assert.equal(desktop.exitCode, null, "native fixture exited during startup");
        try {
          ready =
            pilot([
              "eval",
              `(async () => {
                if (!document.querySelector('.sidebar-content') || document.querySelector('.sidebar-content > .skeleton')) return false;
                if (!(await window.__TAURI_INTERNALS__.invoke('get_component_versions')).runtime) return false;
                window.__exitFixtureReadySince ??= performance.now();
                return performance.now() - window.__exitFixtureReadySince > 2500;
              })()`,
            ]) === "true";
        } catch {
          // Cargo, the native bridge, and product hydration may still be starting.
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.ok(ready, "native product layout did not become ready");
      pilot(["snapshot", "-i"]);
      pilot([
        "eval",
        `(async () => {
            const {desktopOpenAgent: client, emit} = await import('/src/lib/openagent/tauriClient.ts');
            const config = await client.invokeProduct('get_settings', {});
            config.theme = '${theme}'; config.language = '${language}';
            await client.invokeProduct('save_settings', {config});
            await emit('settings-changed');
            const {tr} = await import('/src/lib/i18n.ts');
            const deadline = Date.now() + 10000;
            while (document.documentElement.classList.contains('dark') !== ${theme === "dark"}
                || getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() !== ${JSON.stringify(theme === "dark" ? "#282c34" : "#ffffff")}
                || tr('exitQuitting') !== ${JSON.stringify(language === "en" ? "Quitting OpenAgent" : "正在退出 OpenAgent")}) {
              if (Date.now() >= deadline) throw new Error('saved appearance did not reach the native product window');
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            window.__exitExpectedDark = ${theme === "dark"};
            window.__exitExpectedSurface = ${JSON.stringify(theme === "dark" ? "rgb(40, 44, 52)" : "rgb(255, 255, 255)")};
            window.__exitExpectedTitle = ${JSON.stringify(mode === "quit" ? "正在退出 OpenAgent" : language === "en" ? "Preparing the update" : "正在准备更新")};
            window.__exitExpectedStage = ${JSON.stringify(language === "en" ? "Finishing cleanup…" : "正在完成最后清理…")};
            await window.__TAURI_INTERNALS__.invoke('plugin:window|hide', {label:'main'});
            await window.__TAURI_INTERNALS__.invoke('plugin:window|hide', {label:'onboarding'});
            return true;
          })()`,
      ]);
      pilot([
        "run",
        path.join(root, `tests/blackbox/desktop-exit${mode === "quit" ? "-quit" : ""}.toml`),
        "--junit",
        path.join(artifacts, `${pass}.xml`),
      ]);
      if (mode === "install") {
        // The native close event must neither destroy nor hide the exit surface.
        pilot(["eval", "window.__TAURI_INTERNALS__.invoke('plugin:window|close', {label:'main'})"]);
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          pilot([
            "eval",
            "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label:'main'})",
          ]),
          "true",
        );
        await captureNative(pass);
        await writeFile(
          path.join(artifacts, `${pass}-errors.json`),
          pilot(["logs", "--level", "error"]),
        );
        pilot([
          "eval",
          "setTimeout(() => window.__TAURI_INTERNALS__.invoke('quit_app'), 100); true",
        ]);
      }
      const exitDeadline = Date.now() + 15000;
      while (desktop.exitCode === null && Date.now() < exitDeadline)
        await new Promise((resolve) => setTimeout(resolve, 100));
      assert.notEqual(
        desktop.exitCode,
        null,
        "prepared host did not exit within its watchdog bound",
      );
    } finally {
      if (desktop.exitCode === null) {
        try {
          pilot([
            "eval",
            "setTimeout(() => window.__TAURI_INTERNALS__.invoke('quit_app'), 100); true",
          ]);
        } catch {
          // The host may already be finishing its bounded exit.
        }
        desktop.stdin?.end();
        const deadline = Date.now() + 12000;
        while (desktop.exitCode === null && Date.now() < deadline)
          await new Promise((resolve) => setTimeout(resolve, 100));
        if (desktop.exitCode === null) desktop.kill();
      }
    }
  }
  console.log(
    `Desktop exit: four native theme/locale passes and ordinary quit; artifacts: ${artifacts}`,
  );
} finally {
  vite.kill();
}
