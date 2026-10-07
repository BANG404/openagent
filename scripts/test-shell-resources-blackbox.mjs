// @ts-check
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

if (process.platform !== "win32")
  throw new Error(
    "The complete native fixture currently targets Windows; portable download tests cover other targets",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-shell-resources-"));
const home = path.join(directory, "data");
const port = Number(process.env.OPENAGENT_BLACKBOX_PORT ?? "18889");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid fixture port");
const fixture = signingFixture();
const keyFile = path.join(directory, "fixture.pub");
await writeFile(keyFile, fixture.publicKey);
const environment = {
  ...process.env,
  OPENAGENT_HOME: home,
  OPENAGENT_DEV_MULTI_INSTANCE: "1",
  OPENAGENT_DEV_INSTANCE: "shell-resources",
  OPENAGENT_BOOTSTRAP_TEST: "1",
  OPENAGENT_BOOTSTRAP_TEST_URL: "http://127.0.0.1:9/openagent-distribution.json",
  OPENAGENT_BOOTSTRAP_TEST_KEY: keyFile,
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
          visible: true,
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
    path.join(root, "src-tauri/target"),
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
      const currentLanguage = heading.includes("资源") ? "zh" : "en";
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
      protocol: { min: 2, max: 2 },
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
        runtimeProtocolVersion: 2,
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
  // Restart with no offline source and a refused network endpoint. The signed
  // cache and durable handoff must be enough to reopen and confirm the product.
  if (!desktop.pid) throw new Error("Fixture desktop has no process identity");
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  await rename(distributionDir, `${distributionDir}-unavailable`);
  const updatesDirectory = path.join(home, "resources", "updates");
  await mkdir(updatesDirectory, { recursive: true });
  await writeFile(
    path.join(updatesDirectory, "shell-handoff.json"),
    JSON.stringify({ schema_version: 1, shell_version: version }),
  );
  desktop = start(process.execPath, desktopArguments);
  const restartDeadline = Date.now() + 120000;
  let continued = false;
  while (Date.now() < restartDeadline) {
    try {
      if (pilot(["url"]).includes("openagent-ui")) {
        const pending = await readFile(path.join(updatesDirectory, "shell-handoff.json"))
          .then(() => true)
          .catch(() => false);
        if (!pending) {
          continued = true;
          break;
        }
      }
    } catch {
      /* Wait for the replacement native window. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!continued)
    throw new Error("Cached restart did not confirm and clear its shell continuation");
  captureBlackboxScreenshot(pilot, path.join(directory, "product-after-restart.png"));
  console.log(
    `Shell resource black-box passed: retry, four themes/locales, verified offline install, cached restart and continuation confirmation. Artifacts: ${directory}`,
  );
} finally {
  await writeFile(path.join(directory, "desktop.log"), logs.join(""));
  // Terminate only these child trees; no developer or installed app is touched.
  for (const child of [desktop, vite]) {
    if (!child?.pid) continue;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  }
}
