// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";
import { createFrontendManifest } from "./frontend-artifacts.mjs";
import { createDistribution } from "./distribution-artifacts.mjs";
import { bindRuntimeHelpers } from "./bind-runtime-helpers.mjs";
import { rename } from "node:fs/promises";
import { readDesktopRuntimeProtocol } from "./runtime-protocol.mjs";
import { findAvailableLoopbackPort } from "./tauri-dev-port.mjs";

if (process.platform !== "win32")
  throw new Error(
    "The complete native fixture currently targets Windows; portable download tests cover other targets",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const runtimeProtocol = readDesktopRuntimeProtocol(root);
const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-shell-resources-"));
const home = path.join(directory, "data");
const port = Number(process.env.OPENAGENT_BLACKBOX_PORT ?? "18889");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid fixture port");
const fixture = signingFixture();
const keyFile = path.join(directory, "fixture.pub");
await writeFile(keyFile, fixture.publicKey);
/** @type {NodeJS.ProcessEnv} */
const environment = {
  ...process.env,
  OPENAGENT_HOME: home,
  OPENAGENT_DEV_MULTI_INSTANCE: "1",
  OPENAGENT_DEV_INSTANCE: "shell-resources",
  OPENAGENT_BOOTSTRAP_TEST: "1",
  OPENAGENT_BOOTSTRAP_TEST_URL: "http://127.0.0.1:9/openagent-distribution.json",
  OPENAGENT_BOOTSTRAP_TEST_KEY: keyFile,
  OPENAGENT_BOOTSTRAP_TEST_DELAY_MS: "60000",
  CARGO_INCREMENTAL: "1",
  RUST_BACKTRACE: "1",
  TAURI_PILOT_SOCKET: String.raw`\\.\pipe\tauri-pilot-com.iumm.openagent.dev.shell-resources`,
};
/** @type {string[]} */
const logs = [];
/** @param {string} command @param {string[]} args */
function start(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => {
    logs.push(String(chunk));
    process.stdout.write(String(chunk));
  });
  child.stderr?.on("data", (chunk) => {
    logs.push(String(chunk));
    process.stdout.write(String(chunk));
  });
  return child;
}
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: directory,
    env: environment,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Pilot failed", { cause: result.error });
  return result.stdout;
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
    captureBlackboxScreenshot((args) => pilot(args), path.join(directory, `${pass}.png`));
    await writeFile(
      path.join(directory, `${pass}-window.json`),
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
/** @param {string} url @param {boolean} [allowRecovery] */
function assertWelcomeHidden(url, allowRecovery = false) {
  if (
    url.includes("/bootstrap") &&
    pilot([
      "eval",
      `(async () => { const visible = await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label: 'main'}); const failed = ${allowRecovery} && (await window.__TAURI_INTERNALS__.invoke('shell_resource_status')).phase === 'failed'; return visible && location.pathname === '/bootstrap' && Boolean(document.querySelector('[data-module="shell-resources"]')) && !failed; })()`,
    ]).includes("true")
  )
    throw new Error("Configured startup revealed resource preparation");
}
/** @param {string} label */
function clickLabel(label) {
  pilot(["snapshot", "-i"]);
  pilot([
    "eval",
    `(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if (!button || button.disabled) throw new Error('Button unavailable'); button.click(); return true; })()`,
  ]);
}
const vite = start(process.execPath, [
  "x",
  "vite",
  "--config",
  "bootstrap.vite.config.js",
  "--port",
  String(port),
  "--strictPort",
]);
/** @type {ReturnType<typeof start> | undefined} */
let desktop;
/** @type {ReturnType<typeof start> | undefined} */
let productVite;
/** @type {string[]} */
let desktopArguments;
try {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (
      await fetch(`http://localhost:${port}/bootstrap`, { signal: AbortSignal.timeout(2000) })
        .then((response) => response.ok)
        .catch(() => false)
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const config = JSON.stringify({
    build: { beforeDevCommand: "", devUrl: `http://localhost:${port}` },
    app: {
      windows: [
        {
          label: "main",
          title: "OpenAgent",
          width: 1040,
          height: 600,
          decorations: false,
          visible: false,
        },
      ],
    },
  });
  desktopArguments = [
    path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
    "dev",
    "--no-watch",
    "--config",
    config,
    "--",
    "--target-dir",
    process.env.CARGO_TARGET_DIR || path.join(root, "src-tauri/target"),
  ];
  desktop = start(process.execPath, desktopArguments);
  const readyDeadline = Date.now() + 600000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    try {
      if (pilot(["url"]).includes(`/bootstrap`)) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for this fixture's native window. */
    }
    if (desktop.exitCode !== null) throw new Error(`Desktop exited: ${logs.join("").slice(-6000)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Fixture window did not become ready: ${logs.join("").slice(-6000)}`);
  // Keep the first resource probe stalled beyond the old ten-second fallback.
  // This is the release bootstrap path, starting with a genuinely hidden window.
  const loadingDeadline = Date.now() + 30000;
  while (
    !pilot(["eval", "Boolean(document.querySelector('[data-module=startup-loading]'))"]).includes(
      "true",
    )
  ) {
    if (Date.now() > loadingDeadline) throw new Error("Startup loading shell did not mount");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const loadingStarted = Date.now();
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      pilot(["snapshot", "-i"]);
      pilot([
        "eval",
        `(async () => { const {locale} = await import(${JSON.stringify(`/@fs/${root.replaceAll("\\", "/")}src/lib/i18n.ts`)}); locale.set(${JSON.stringify(language)}); document.documentElement.classList.toggle('dark', ${theme === "dark"}); await window.__TAURI_INTERNALS__.invoke('set_shell_setup_appearance', {language: ${JSON.stringify(language)}, theme: ${JSON.stringify(theme)}}); return true; })()`,
      ]);
      pilot(["run", path.join(root, "tests/blackbox/startup-loading.toml")]);
      await captureNative(`startup-${theme}-${language}`);
    }
  }
  while (Date.now() - loadingStarted < 11000) {
    pilot(["run", path.join(root, "tests/blackbox/startup-loading.toml")]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  delete environment.OPENAGENT_BOOTSTRAP_TEST_DELAY_MS;
  const hydrationDeadline = Date.now() + 90000;
  let hydrated = false;
  while (Date.now() < hydrationDeadline) {
    try {
      if (
        pilot([
          "eval",
          "Boolean(document.querySelector('[data-module=shell-resources] h1') && document.querySelector('[role=alert]'))",
        ]).includes("true")
      ) {
        hydrated = true;
        break;
      }
    } catch {
      /* Dependency optimization can reload the first WebView. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!hydrated)
    throw new Error(`Bootstrap did not hydrate: ${pilot(["logs", "--level", "error"])}`);
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      pilot(["snapshot", "-i"]);
      const heading = pilot(["text", "h1"]);
      const currentLanguage = heading.includes("欢迎") ? "zh" : "en";
      if (currentLanguage !== language) clickLabel(currentLanguage === "en" ? "中文" : "English");
      const themeClass = pilot(["eval", "document.documentElement.classList.contains('dark')"]);
      if (themeClass.includes("true") !== (theme === "dark"))
        clickLabel(
          language === "en"
            ? theme === "dark"
              ? "Dark"
              : "Light"
            : theme === "dark"
              ? "深色"
              : "浅色",
        );
      pilot(["run", path.join(root, "tests/blackbox/shell-resources.toml")]);
      captureBlackboxScreenshot(pilot, path.join(directory, `${theme}-${language}.png`));
    }
  }
  // Construct a real, signed, full-core offline set using the exact local SDK
  // executable and actual production frontend build. The trust override exists
  // only in debug builds and is explicitly enabled for this isolated process.
  const runtimeSource = path.join(
    root,
    "src-tauri/binaries/openagent-server-x86_64-pc-windows-msvc.exe",
  );
  const runtimeDir = path.join(directory, "runtime");
  const frontendDir = path.join(directory, "frontend");
  const helperDir = path.join(directory, "helpers");
  const distributionDir = path.join(directory, "distribution");
  for (const folder of [runtimeDir, frontendDir, helperDir]) await mkdir(folder);
  const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  const binary = await readFile(runtimeSource);
  const runtimeManifest = Buffer.from(
    JSON.stringify({
      schema_version: 1,
      sdk_sha: "1".repeat(40),
      version: "0.1.1",
      protocol: { min: runtimeProtocol, max: runtimeProtocol },
      artifacts: {
        "windows-x64": {
          file: "openagent-server-windows-x64.exe",
          size: binary.length,
          sha256: createHash("sha256").update(binary).digest("hex"),
        },
      },
    }),
  );
  await writeFile(path.join(runtimeDir, "openagent-sdk-manifest.json"), runtimeManifest);
  await writeFile(
    path.join(runtimeDir, "openagent-sdk-manifest.json.sig"),
    fixture.sign(runtimeManifest),
  );
  await cp(runtimeSource, path.join(runtimeDir, "openagent-server-windows-x64.exe"));
  for (const helper of ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"])
    await cp(
      path.join(root, "src-tauri/resources/codex-resources", helper),
      path.join(helperDir, helper),
    );
  // Linux files are signed but never selected by this Windows fixture.
  await writeFile(path.join(helperDir, "codex-bwrap-linux-x64"), "unselected Linux fixture");
  await bindRuntimeHelpers(runtimeDir, helperDir);
  await writeFile(
    path.join(runtimeDir, "openagent-sdk-manifest.json.sig"),
    fixture.sign(await readFile(path.join(runtimeDir, "openagent-sdk-manifest.json"))),
  );
  const archive = path.join(frontendDir, "openagent-frontend.tar.gz");
  const archived = spawnSync(
    "tar",
    ["--format=ustar", "-C", path.join(root, "build"), "-czf", "openagent-frontend.tar.gz", "."],
    { cwd: frontendDir, encoding: "utf8", windowsHide: true },
  );
  if (archived.status !== 0) throw new Error(archived.stderr);
  const frontendManifest = Buffer.from(
    JSON.stringify(
      await createFrontendManifest({
        archive,
        assets: path.join(root, "build"),
        version,
        shellProtocolVersion: 2,
        runtimeProtocolVersion: runtimeProtocol,
      }),
    ),
  );
  await writeFile(path.join(frontendDir, "openagent-frontend-manifest.json"), frontendManifest);
  await writeFile(
    path.join(frontendDir, "openagent-frontend-manifest.json.sig"),
    fixture.sign(frontendManifest),
  );
  await createDistribution({
    directory: distributionDir,
    runtimeDirectory: runtimeDir,
    frontendDirectory: frontendDir,
    modelDirectory: path.join(root, "src-tauri/resources/models/all-MiniLM-L6-v2-q"),
    helperDirectory: helperDir,
    version,
    sdkSha: "1".repeat(40),
  });
  const manifestBytes = await readFile(path.join(distributionDir, "openagent-distribution.json"));
  await writeFile(
    path.join(distributionDir, "openagent-distribution.json.sig"),
    fixture.sign(manifestBytes),
  );
  // Exercise the native import command after UI retry coverage; native file
  // picker ownership stays with the shared dialog plugin.
  pilot([
    "eval",
    `(() => { window.__TAURI_INTERNALS__.invoke('retry_shell_resources', {offlineDirectory: ${JSON.stringify(distributionDir)}}).catch(error => { window.__shellImportError = String(error); }); return true; })()`,
  ]);
  const importDeadline = Date.now() + 120000;
  let imported = false;
  while (Date.now() < importDeadline) {
    if (pilot(["url"]).includes("openagent-ui")) {
      imported = true;
      break;
    }
    const error = pilot(["eval", "window.__shellImportError || ''"]);
    if (error.trim() !== '""' && error.trim() !== "")
      throw new Error(`Offline import failed: ${error}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!imported) throw new Error("Verified offline resources did not open the product interface");
  const setupDeadline = Date.now() + 30000;
  let preferencesOpened = false;
  while (Date.now() < setupDeadline) {
    try {
      pilot(["run", path.join(root, "tests/blackbox/shell-welcome-continue.toml")]);
      preferencesOpened = true;
      break;
    } catch {
      /* Wait for the same window's welcome step to hydrate. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!preferencesOpened)
    throw new Error("Resource preparation did not continue in the welcome wizard");
  // Reproduce an interrupted installer in the old shell, then prepare a newer
  // signed plan through the real native command without running an installer.
  const futureVersion = "999.0.1-beta.1";
  const interruptedVersion = "999.0.0-beta.1";
  const futureFrontendManifest = Buffer.from(
    JSON.stringify({ ...JSON.parse(frontendManifest.toString()), version: futureVersion }),
  );
  await writeFile(
    path.join(frontendDir, "openagent-frontend-manifest.json"),
    futureFrontendManifest,
  );
  await writeFile(
    path.join(frontendDir, "openagent-frontend-manifest.json.sig"),
    fixture.sign(futureFrontendManifest),
  );
  const futureDirectory = path.join(home, "resources", "distributions", futureVersion);
  await createDistribution({
    directory: futureDirectory,
    runtimeDirectory: runtimeDir,
    frontendDirectory: frontendDir,
    modelDirectory: path.join(root, "src-tauri/resources/models/all-MiniLM-L6-v2-q"),
    helperDirectory: helperDir,
    version: futureVersion,
    sdkSha: "1".repeat(40),
  });
  await writeFile(
    path.join(futureDirectory, "openagent-distribution.json.sig"),
    fixture.sign(await readFile(path.join(futureDirectory, "openagent-distribution.json"))),
  );
  const updatesDirectory = path.join(home, "resources", "updates");
  await mkdir(updatesDirectory, { recursive: true });
  const continuationFile = path.join(updatesDirectory, "shell-handoff.json");
  await writeFile(
    continuationFile,
    JSON.stringify({ schema_version: 1, shell_version: interruptedVersion }),
  );
  pilot(["snapshot", "-i"]);
  pilot(["run", path.join(root, "tests/blackbox/shell-handoff-unverified.toml")]);
  if (JSON.parse(await readFile(continuationFile, "utf8")).shell_version !== interruptedVersion)
    throw new Error("Unverified candidate overwrote the interrupted shell continuation");
  const signatureFile = path.join(futureDirectory, "openagent-distribution.json.sig");
  const validSignature = await readFile(signatureFile);
  const helperFile = path.join(futureDirectory, "codex-command-runner.exe");
  const validHelper = await readFile(helperFile);
  const corruptHelper = Buffer.from(validHelper);
  corruptHelper[0] ^= 0xff;
  /** @type {Array<[string, string, string | Buffer, Buffer]>} */
  const damagedCandidates = [
    [
      "Distribution signature verification failed",
      signatureFile,
      fixture.sign(Buffer.from("changed")),
      validSignature,
    ],
    ["Prepared release artifact checksum changed", helperFile, corruptHelper, validHelper],
  ];
  for (const [expectedError, damagedFile, damagedBytes, validBytes] of damagedCandidates) {
    await writeFile(damagedFile, damagedBytes);
    try {
      pilot(["snapshot", "-i"]);
      pilot(["eval", `window.__shellHandoffExpectedError = ${JSON.stringify(expectedError)}`]);
      pilot(["snapshot", "-i"]);
      pilot(["run", path.join(root, "tests/blackbox/shell-handoff-integrity.toml")]);
      if (JSON.parse(await readFile(continuationFile, "utf8")).shell_version !== interruptedVersion)
        throw new Error("Damaged candidate overwrote the interrupted shell continuation");
    } finally {
      await writeFile(damagedFile, validBytes);
    }
  }
  pilot(["snapshot", "-i"]);
  pilot(["run", path.join(root, "tests/blackbox/shell-handoff-retry.toml")]);
  if (JSON.parse(await readFile(continuationFile, "utf8")).shell_version !== futureVersion)
    throw new Error("Newer verified plan did not replace the interrupted shell continuation");
  // Restart with no offline source and a refused network endpoint. The signed
  // cache and durable handoff must be enough to reopen and confirm the product.
  if (!desktop.pid) throw new Error("Fixture desktop has no process identity");
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  await rename(distributionDir, `${distributionDir}-unavailable`);
  const configFile = path.join(home, "config.toml");
  const savedConfig = await readFile(configFile, "utf8");
  if (!savedConfig.includes("onboarding_completed = false"))
    throw new Error("First-use fixture did not persist its onboarding state");
  await writeFile(
    configFile,
    savedConfig.replace("onboarding_completed = false", "onboarding_completed = true"),
  );
  await writeFile(
    path.join(updatesDirectory, "shell-handoff.json"),
    JSON.stringify({ schema_version: 1, shell_version: version }),
  );
  // Keep the verified executable intact: a corrupt helper alone must prevent
  // reuse, repair through the signed cache, and complete the same handoff.
  const beforeRepairSelection = JSON.parse(
    await readFile(path.join(home, "resources", "runtime", "active.json"), "utf8"),
  );
  const installedHelper = path.join(
    home,
    "resources",
    "runtime",
    beforeRepairSelection.active.version,
    beforeRepairSelection.active.target,
    "codex-resources",
    "codex-command-runner.exe",
  );
  const expectedHelper = await readFile(installedHelper);
  await writeFile(installedHelper, "damaged installed helper");
  const continuationLogStart = logs.length;
  desktop = start(process.execPath, desktopArguments);
  const restartDeadline = Date.now() + 120000;
  let continued = false;
  while (Date.now() < restartDeadline) {
    try {
      const url = pilot(["url"]);
      assertWelcomeHidden(url);
      if (url.includes("openagent-ui")) {
        const pending = await readFile(path.join(updatesDirectory, "shell-handoff.json"))
          .then(() => true)
          .catch(() => false);
        if (!pending) {
          continued = true;
          break;
        }
      }
    } catch (error) {
      if (String(error).includes("Configured startup revealed")) throw error;
      /* Wait for the replacement native window. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!continued)
    throw new Error("Cached restart did not confirm and clear its shell continuation");
  if (logs.slice(continuationLogStart).join("").includes("showing shell resource preparation"))
    throw new Error("Cached shell continuation revealed Welcome");
  if (!(await readFile(installedHelper)).equals(expectedHelper))
    throw new Error("Cached handoff did not restore the installed helper");
  captureBlackboxScreenshot(pilot, path.join(directory, "product-after-restart.png"));

  // A coupled shell upgrade can reject both old selections at the protocol
  // boundary. Its verified cache must reach the product on the first attempt,
  // without showing Welcome or changing the configured application's data.
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  const runtimeRoot = path.join(home, "resources", "runtime");
  const oldVersion = "0.0.1";
  const oldRuntimeRoot = path.join(runtimeRoot, oldVersion, beforeRepairSelection.active.target);
  await cp(path.dirname(installedHelper), path.join(oldRuntimeRoot, "codex-resources"), {
    recursive: true,
  });
  await cp(
    path.join(path.dirname(path.dirname(installedHelper)), "openagent-server-windows-x64.exe"),
    path.join(oldRuntimeRoot, "openagent-server-windows-x64.exe"),
  );
  const oldRuntimeManifest = Buffer.from(
    JSON.stringify({
      ...JSON.parse(await readFile(path.join(runtimeDir, "openagent-sdk-manifest.json"), "utf8")),
      version: oldVersion,
      protocol: { min: runtimeProtocol - 1, max: runtimeProtocol - 1 },
    }),
  );
  await writeFile(path.join(oldRuntimeRoot, "openagent-sdk-manifest.json"), oldRuntimeManifest);
  await writeFile(
    path.join(oldRuntimeRoot, "openagent-sdk-manifest.json.sig"),
    fixture.sign(oldRuntimeManifest),
  );
  await writeFile(
    path.join(runtimeRoot, "active.json"),
    JSON.stringify({
      schema_version: 1,
      active: { version: oldVersion, target: beforeRepairSelection.active.target },
      previous: null,
    }),
  );
  const frontendRoot = path.join(home, "resources", "frontend");
  const oldFrontendRoot = path.join(frontendRoot, oldVersion);
  await cp(path.join(frontendRoot, version), oldFrontendRoot, { recursive: true });
  const oldFrontendManifest = Buffer.from(
    JSON.stringify({
      ...JSON.parse(frontendManifest.toString()),
      version: oldVersion,
      compatibility: {
        shell: { min: 2, max: 2 },
        runtime: { min: runtimeProtocol - 1, max: runtimeProtocol - 1 },
      },
    }),
  );
  await writeFile(
    path.join(oldFrontendRoot, ".openagent-frontend-manifest.json"),
    oldFrontendManifest,
  );
  await writeFile(
    path.join(oldFrontendRoot, ".openagent-frontend-manifest.json.sig"),
    fixture.sign(oldFrontendManifest),
  );
  await writeFile(
    path.join(frontendRoot, "active.json"),
    JSON.stringify({ version: oldVersion, previous_version: null, pending_confirmation: false }),
  );
  await writeFile(continuationFile, JSON.stringify({ schema_version: 1, shell_version: version }));
  const configBeforeUpgrade = await readFile(configFile);
  const protocolUpgradeLogStart = logs.length;
  desktop = start(process.execPath, desktopArguments);
  const protocolUpgradeDeadline = Date.now() + 120000;
  let protocolUpgraded = false;
  while (Date.now() < protocolUpgradeDeadline) {
    try {
      const url = pilot(["url"]);
      assertWelcomeHidden(url);
      if (url.includes("openagent-ui")) {
        pilot(["run", path.join(root, "tests/blackbox/shell-installed-startup.toml")]);
        protocolUpgraded = true;
        break;
      }
    } catch (error) {
      if (String(error).includes("Configured startup revealed")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (
    !protocolUpgraded ||
    logs.slice(protocolUpgradeLogStart).join("").includes("showing shell resource preparation")
  )
    throw new Error("Protocol upgrade required Welcome or a resource retry");
  if (!(await readFile(configFile)).equals(configBeforeUpgrade))
    throw new Error("Protocol upgrade changed the configured application's settings");
  if (
    !(await readFile(path.join(oldRuntimeRoot, "openagent-server-windows-x64.exe"))).equals(binary)
  )
    throw new Error("Protocol upgrade deleted the old installed Runtime bytes");
  captureBlackboxScreenshot(pilot, path.join(directory, "protocol-upgrade-product.png"));
  // An ordinary repeat launch needs only installed selections. Hide the entire
  // distribution cache as well as the original source to prove it is not staged.
  const cachedDistribution = path.join(home, "resources", "distributions", version);
  await rename(cachedDistribution, `${cachedDistribution}-unavailable`);
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  const ordinaryLogStart = logs.length;
  environment.OPENAGENT_BOOTSTRAP_TEST_DELAY_MS = "15000";
  desktop = start(process.execPath, desktopArguments);
  const stalledDeadline = Date.now() + 30000;
  let stalled = false;
  while (Date.now() < stalledDeadline) {
    try {
      pilot(["run", path.join(root, "tests/blackbox/startup-loading.toml")]);
      stalled = true;
      break;
    } catch {
      /* Wait for this replacement process, whose Runtime is deliberately held. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!stalled)
    throw new Error("Installed startup did not show loading before resource validation");
  delete environment.OPENAGENT_BOOTSTRAP_TEST_DELAY_MS;
  const ordinaryDeadline = Date.now() + 120000;
  let ordinaryStarted = false;
  while (Date.now() < ordinaryDeadline) {
    try {
      const url = pilot(["url"]);
      assertWelcomeHidden(url);
      if (url.includes("openagent-ui")) {
        pilot(["run", path.join(root, "tests/blackbox/shell-installed-startup.toml")]);
        if (
          !pilot([
            "eval",
            "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label: 'main'})",
          ]).includes("true")
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        ordinaryStarted = true;
        break;
      }
    } catch (error) {
      if (String(error).includes("Configured startup revealed")) throw error;
      /* Wait for the replacement process and product hydration. */
    }
    if (desktop.exitCode !== null) throw new Error("Installed-resource startup exited");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ordinaryStarted)
    throw new Error("Repeat launch required the unavailable distribution cache");
  if (logs.slice(ordinaryLogStart).join("").includes("showing shell resource preparation"))
    throw new Error("Ordinary startup passed through the preparation surface");
  if (
    !pilot([
      "eval",
      "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label: 'main'})",
    ]).includes("true")
  )
    throw new Error("Configured repeat launch did not reveal the main window");
  captureBlackboxScreenshot(pilot, path.join(directory, "ordinary-installed-startup.png"));

  // A new installer may package the same compiled shell and frontend. Its signed
  // installation metadata must advance updater identity without requiring a cache.
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  const identityDirectory = path.join(directory, "reused-shell-identity");
  await mkdir(identityDirectory);
  const reusedIdentity = Buffer.from(
    JSON.stringify({
      ...JSON.parse(manifestBytes.toString()),
      version: "999.0.2-beta.1",
      shell_version: version,
      frontend_version: version,
    }),
  );
  await writeFile(path.join(identityDirectory, "openagent-distribution.json"), reusedIdentity);
  await writeFile(
    path.join(identityDirectory, "openagent-distribution.json.sig"),
    fixture.sign(reusedIdentity),
  );
  environment.OPENAGENT_BOOTSTRAP_TEST_IDENTITY = identityDirectory;
  desktop = start(process.execPath, desktopArguments);
  let reusedStarted = false;
  const reusedDeadline = Date.now() + 120000;
  while (Date.now() < reusedDeadline) {
    try {
      const url = pilot(["url"]);
      assertWelcomeHidden(url);
      if (url.includes("openagent-ui")) {
        pilot(["run", path.join(root, "tests/blackbox/shell-installed-startup.toml")]);
        pilot(["snapshot", "-i"]);
        pilot(["eval", "window.__originalShellVersion = " + JSON.stringify(version)]);
        pilot(["run", path.join(root, "tests/blackbox/shell-component-reuse.toml")]);
        reusedStarted = true;
        break;
      }
    } catch (error) {
      if (String(error).includes("Configured startup revealed")) throw error;
    }
    if (desktop.exitCode !== null) throw new Error("Reused-shell startup exited");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!reusedStarted) throw new Error("Reused shell did not adopt signed product identity");
  captureBlackboxScreenshot(pilot, path.join(directory, "reused-shell-product.png"));
  delete environment.OPENAGENT_BOOTSTRAP_TEST_IDENTITY;

  // Missing installed bytes must recover through the signed cache on next launch.
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  await rename(`${cachedDistribution}-unavailable`, cachedDistribution);
  const runtimeSelection = JSON.parse(
    await readFile(path.join(home, "resources", "runtime", "active.json"), "utf8"),
  );
  const installedBinary = path.join(
    home,
    "resources",
    "runtime",
    runtimeSelection.active.version,
    runtimeSelection.active.target,
    "openagent-server-windows-x64.exe",
  );
  await rename(installedBinary, `${installedBinary}-unavailable`);
  const repairLogStart = logs.length;
  desktop = start(process.execPath, desktopArguments);
  const repairDeadline = Date.now() + 120000;
  let repaired = false;
  while (Date.now() < repairDeadline) {
    try {
      const url = pilot(["url"]);
      assertWelcomeHidden(url);
      if (url.includes("openagent-ui")) {
        pilot(["run", path.join(root, "tests/blackbox/shell-installed-startup.toml")]);
        repaired = true;
        break;
      }
    } catch (error) {
      if (String(error).includes("Configured startup revealed")) throw error;
      /* Wait for recovery through the signed cache and product hydration. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (
    !repaired ||
    logs.slice(repairLogStart).join("").includes("showing shell resource preparation")
  )
    throw new Error("Verified cached Runtime repair did not keep Welcome hidden");

  // A configured home still needs visible recovery when its signed cache is
  // invalid and neither installed resources nor the source can repair it.
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  await rename(installedBinary, `${installedBinary}-damaged-cache`);
  await writeFile(path.join(cachedDistribution, "openagent-distribution.json.sig"), "invalid");
  desktop = start(process.execPath, desktopArguments);
  const failureDeadline = Date.now() + 120000;
  let recoveryVisible = false;
  while (Date.now() < failureDeadline) {
    try {
      const url = pilot(["url"]);
      if (url.includes("/bootstrap")) {
        assertWelcomeHidden(url, true);
        pilot(["snapshot", "-i"]);
        pilot(["run", path.join(root, "tests/blackbox/shell-resources.toml")]);
        recoveryVisible = pilot([
          "eval",
          "window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label: 'main'})",
        ]).includes("true");
        if (recoveryVisible) break;
      }
    } catch (error) {
      if (String(error).includes("Configured startup revealed")) throw error;
      /* Wait for the actionable recovery surface to hydrate. */
    }
    if (desktop.exitCode !== null) throw new Error("Configured resource recovery exited");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!recoveryVisible) throw new Error("Invalid configured cache did not reveal recovery");
  if (!(await readFile(configFile, "utf8")).includes("onboarding_completed = true"))
    throw new Error("Resource recovery changed onboarding completion");
  // The isolated native window also qualifies the history error/retry surface.
  // Its source-only fixture uses the real MessageList and checkpoint hydration;
  // transport deadline behavior is exercised by the host's loopback tests.
  const productPort = await findAvailableLoopbackPort();
  productVite = start(process.execPath, [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(productPort),
    "--strictPort",
  ]);
  const productDeadline = Date.now() + 60000;
  while (
    !(await fetch(`http://127.0.0.1:${productPort}`)
      .then((response) => response.ok)
      .catch(() => false))
  ) {
    if (Date.now() > productDeadline || productVite.exitCode !== null)
      throw new Error("History fixture frontend unavailable");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  delete environment.OPENAGENT_BOOTSTRAP_TEST;
  delete environment.OPENAGENT_BOOTSTRAP_TEST_URL;
  delete environment.OPENAGENT_BOOTSTRAP_TEST_KEY;
  environment.OPENAGENT_HOME = path.join(directory, "history-data");
  // Give this WebView its actual source origin, preserving Tauri's normal IPC
  // authority instead of authorizing another loopback origin for the fixture.
  desktop = start(process.execPath, [
    path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
    "dev",
    "--no-watch",
    "--config",
    JSON.stringify({ build: { beforeDevCommand: "", devUrl: `http://127.0.0.1:${productPort}` } }),
    "--",
    "--target-dir",
    process.env.CARGO_TARGET_DIR || path.join(root, "src-tauri/target"),
  ]);
  const historyDeadline = Date.now() + 120000;
  let historyReady = false;
  while (Date.now() < historyDeadline) {
    try {
      historyReady = pilot(["url"]).includes(`127.0.0.1:${productPort}`);
      if (historyReady) break;
    } catch {
      /* Wait for the fixture with the product source as its configured origin. */
    }
    if (desktop.exitCode !== null) throw new Error("History native fixture exited");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!historyReady) throw new Error("History native fixture did not become ready");
  for (const theme of ["light", "dark"]) {
    for (const language of ["en", "zh"]) {
      const preview = new URL(`http://127.0.0.1:${productPort}`);
      preview.search = new URLSearchParams({
        "streaming-transcript-preview": "",
        "streaming-transcript-preview-performance": "",
        "streaming-transcript-preview-theme": theme,
        "streaming-transcript-preview-locale": language,
        "performance-history-retry": "",
        "performance-turns": "4",
        "performance-compact-every": "2",
        "performance-cycles": "1",
      }).toString();
      pilot(["navigate", preview.href]);
      const mountedDeadline = Date.now() + 60000;
      let mounted = false;
      while (Date.now() < mountedDeadline) {
        try {
          mounted = pilot([
            "eval",
            `(() => {
            if (!document.querySelector('.checkpoint-load-error')) return false;
            window.__historyFixtureReadySince ??= performance.now();
            return performance.now() - window.__historyFixtureReadySince > 2500;
          })()`,
          ]).includes("true");
          if (mounted) break;
        } catch {
          // Vite's first dependency optimization can reload this development
          // page; qualify the mounted surface after that reload settles.
        }
        if (desktop.exitCode !== null) throw new Error("History native fixture exited");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!mounted)
        throw new Error("History timeout surface did not mount after source optimization");
      pilot(["snapshot", "-i"]);
      await captureNative(`history-timeout-${theme}-${language}`);
      pilot(["run", path.join(root, "tests/blackbox/startup-history-retry.toml")]);
      await captureNative(`history-restored-${theme}-${language}`);
    }
  }
  await writeFile(
    path.join(directory, "history-native-errors.json"),
    pilot(["logs", "--level", "error"]),
  );
  console.log(
    `Shell resource black-box passed: visible stalled startup before resources, native minimize/restore, four startup themes/locales, history timeout/retry, verified offline install, interrupted installer supersession, continuation with helper repair, protocol upgrade without retry, delayed repeat startup, independent shell/product identities, cached repair and invalid-cache recovery. Artifacts: ${directory}`,
  );
} finally {
  await writeFile(path.join(directory, "desktop.log"), logs.join(""));
  // Terminate only these child trees; no developer or installed app is touched.
  for (const child of [desktop, vite, productVite]) {
    if (!child?.pid) continue;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  }
}
