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
/** @param {string} url @param {boolean} [allowRecovery] */
function assertBootstrapHidden(url, allowRecovery = false) {
  if (
    url.includes("/bootstrap") &&
    pilot([
      "eval",
      `(async () => { const visible = await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', {label: 'main'}); const failed = ${allowRecovery} && (await window.__TAURI_INTERNALS__.invoke('shell_resource_status')).phase === 'failed'; return visible && location.pathname === '/bootstrap' && !failed; })()`,
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
      assertBootstrapHidden(url);
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
  // An ordinary repeat launch needs only installed selections. Hide the entire
  // distribution cache as well as the original source to prove it is not staged.
  const cachedDistribution = path.join(home, "resources", "distributions", version);
  await rename(cachedDistribution, `${cachedDistribution}-unavailable`);
  spawnSync("taskkill", ["/PID", String(desktop.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
  const ordinaryLogStart = logs.length;
  desktop = start(process.execPath, desktopArguments);
  const ordinaryDeadline = Date.now() + 120000;
  let ordinaryStarted = false;
  while (Date.now() < ordinaryDeadline) {
    try {
      const url = pilot(["url"]);
      assertBootstrapHidden(url);
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
      assertBootstrapHidden(url);
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
        assertBootstrapHidden(url, true);
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
  console.log(
    `Shell resource black-box passed: retry, four themes/locales, verified offline install, interrupted installer supersession, hidden continuation with helper repair, direct repeat startup, hidden cached repair and invalid-cache recovery. Artifacts: ${directory}`,
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
