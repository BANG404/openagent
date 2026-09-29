// @ts-check

// Drive the committed plugin-process scenario against a running debug instance.
//
// The scenario covers what the window can show: the permission profile a plugin
// process inherits, the card for the installed package, and the composer command
// the package contributes. This runner covers what the window cannot show. A
// plugin-owned MCP server has no settings surface — the app mounts it for the
// agent and never renders its tools — so the fixture's server writes a report
// into its own `PLUGIN_DATA`, which is also the one location its process policy
// grants it. The report is written only after `tools/list` completes, so its
// presence means a real handshake finished rather than that a process started.
//
// Nothing here needs a provider or a model turn: the portable command is invoked
// with the fixture's own failure argument, which keeps the invocation inside the
// host, and the MCP server is mounted by the settings save that enables the
// package. Whether the child was actually contained is asserted in the Runtime's
// own confinement test, where the workspace and the package root can be chosen
// independently.
//
// The instance has to run a workspace that does not contain the app's own build
// tree. The managed Windows backend launches its wrapper by path and refuses to
// do so when a write rule of the profile covers the executable, so an instance
// whose workspace is the user's home cannot confine a plugin process at all. The
// workspace is read once at startup and the settings surface rewrites the whole
// file on save, so this runner checks the setting instead of editing it: an edit
// written to a running instance is reverted by the next save.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  cpSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scenario = join(workspaceRoot, "tests", "blackbox", "plugin-process.toml");
const fixtureRoot = join(workspaceRoot, "tests", "fixtures", "agent-plugin-process");
const pilotBinary = process.env.TAURI_PILOT_BIN || "tauri-pilot";
const windowLabel = "main";
const pluginId = "openagent-process-plugin";
// The plugin-process scenario changes the instance's permission profile and puts
// it back, so it runs against the instance reserved for plugin verification
// rather than the one the other black-box runners share.
const isolatedHome = resolveBlackboxHome(process.env, { instanceName: "plugin-blackbox" });
const artifactRoot =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-plugin-process-blackbox-"));
const installedPackage = join(isolatedHome, "plugins", pluginId);
const pluginDataRoot = join(isolatedHome, "plugin-data", pluginId);
const configPath = join(isolatedHome, "config.toml");
// The workspace this instance has to run, and the file the Runtime writes its
// own log to (one file per UTC day, next to the host's).
const fixtureWorkspace = join(isolatedHome, "workspace");
const runtimeLogDir = join(isolatedHome, "logs");

if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to run plugin process black-box verification against ~/.openagent");
}

mkdirSync(artifactRoot, { recursive: true });
mkdirSync(join(isolatedHome, "plugins"), { recursive: true });

mkdirSync(fixtureWorkspace, { recursive: true });
const configuredWorkspace = readTopLevelValue("workspace");
if (
  configuredWorkspace === null ||
  normalizePath(configuredWorkspace) !== normalizePath(fixtureWorkspace)
) {
  throw new Error(
    `the ${isolatedHome} instance is configured with workspace ` +
      `${JSON.stringify(configuredWorkspace)}; a plugin process is only confined when the ` +
      `workspace does not contain the app's build tree, so this instance has to run ` +
      `${fixtureWorkspace}. Set \`workspace\` in ${configPath} while the instance is stopped ` +
      `and start it again: the settings surface rewrites the whole file on save, so an edit ` +
      `written while it runs is reverted.`,
  );
}

process.env.OPENAGENT_HOME = isolatedHome;
process.env.OPENAGENT_DEV_INSTANCE ||= "plugin-blackbox";

/**
 * @param {string[]} args
 * @param {boolean} [quiet]
 */
function pilot(args, quiet = false) {
  const result = spawnSync(pilotBinary, args, {
    cwd: artifactRoot,
    env: { ...process.env, TAURI_PILOT_WINDOW: windowLabel },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!quiet) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tauri-pilot ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result.stdout || "";
}

/** @param {number} ms */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Windows canonicalization returns verbatim (`\\?\`) paths, and the Runtime
 * carries them into the environment it hands a plugin process, so a child
 * reports a different spelling of the same directory than this runner derives.
 *
 * @param {string} value
 */
function normalizePath(value) {
  const withoutUnc = value.replace(/^\\\\\?\\UNC\\/i, "\\\\");
  const withoutVerbatim = withoutUnc.replace(/^\\\\\?\\/i, "");
  const resolved = resolve(withoutVerbatim);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * @param {string} source
 * @param {string} section
 */
function sectionText(source, section) {
  const pattern = new RegExp(`^\\[${section}\\]$`, "m");
  const match = pattern.exec(source);
  if (match === null) return "";
  const rest = source.slice(match.index + match[0].length);
  const next = /^\[/m.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

/**
 * @param {string} section
 * @param {string} key
 */
function readConfigValue(section, key) {
  if (!existsSync(configPath)) return null;
  const text = sectionText(readFileSync(configPath, "utf8"), section);
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m").exec(text);
  return match === null ? null : match[1].trim().replace(/^"|"$/g, "");
}

/**
 * The settings surface autosaves its draft after a control changes, so the file
 * is only evidence once the write has landed.
 *
 * @param {string} section
 * @param {string} key
 * @param {string} expected
 * @param {string} description
 */
function waitForConfigValue(section, key, expected, description) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const observed = readConfigValue(section, key);
    if (observed === expected) return;
    if (Date.now() >= deadline) {
      throw new Error(`${description} (${section}.${key} = ${JSON.stringify(observed)})`);
    }
    sleepSync(200);
  }
}

/**
 * Keys above the first table belong to the document root, where the section
 * reader cannot reach them.
 *
 * @param {string} key
 */
function readTopLevelValue(key) {
  if (!existsSync(configPath)) return null;
  const text = readFileSync(configPath, "utf8");
  const end = text.search(/^\[/m);
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m").exec(
    end === -1 ? text : text.slice(0, end),
  );
  return match === null ? null : match[1].trim().replace(/^['"]|['"]$/g, "");
}

/** The Runtime writes one log file per UTC day. */
function runtimeLogPath() {
  return join(runtimeLogDir, `openagent.${new Date().toISOString().slice(0, 10)}.jsonl`);
}

/**
 * The bytes a log file gained since it was sampled, beginning at a line
 * boundary so a partial trailing write cannot split a record.
 *
 * @param {string} path
 * @param {number} offset
 */
function readLogSince(path, offset) {
  if (!existsSync(path)) return "";
  const buffer = readFileSync(path);
  if (buffer.length <= offset) return "";
  const start = offset === 0 ? 0 : buffer.lastIndexOf(0x0a, offset - 1) + 1;
  return buffer.subarray(start).toString("utf8");
}

/**
 * Windows refuses to delete a directory that is a live process's working
 * directory, and the Runtime launches a package's server from inside the package
 * it came from. The caller has already unmounted the package, so this only has to
 * absorb the moment between the stop and the release.
 *
 * @param {string} path
 * @param {number} timeoutMs
 */
function removeWithRetry(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (Date.now() >= deadline) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`could not replace ${path}: ${detail}`, { cause: error });
      }
      sleepSync(250);
    }
  }
}

/**
 * @param {string} path
 * @param {number} timeoutMs
 */
function waitForFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    sleepSync(200);
  }
  return false;
}

/** Opens the installed-package list the way a user reaches it. */
function openPluginList() {
  pilot(["click", "#application-integrations-menu", "--window", windowLabel]);
  pilot(["click", '[role="menuitem"]:last-child', "--window", windowLabel]);
  pilot(["wait", "--selector", '[role="dialog"]', "--timeout", "5000", "--window", windowLabel]);
}

/**
 * The plugin list is populated when the surface opens, and a package copied into
 * the isolated home after the app started is not in it yet. Refresh through the
 * same control a user would use before the scenario asserts on the card.
 */
function refreshPluginList() {
  pilot([
    "eval",
    `(async () => {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        const refresh = [...document.querySelectorAll("button")].find((button) =>
          /^(Refresh|刷新)$/.test(button.textContent?.trim() ?? ""),
        );
        if (refresh instanceof HTMLElement) {
          refresh.click();
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("plugin refresh control is missing");
    })()`,
    "--window",
    windowLabel,
  ]);
}

function closePluginList() {
  pilot([
    "eval",
    `(() => {
      const close = document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button[aria-label="关闭"]');
      if (close instanceof HTMLElement) close.click();
      return true;
    })()`,
    "--window",
    windowLabel,
  ]);
}

// The window keeps one log buffer for the process's whole life, so a run has to
// say which entries are its own. The app logs its own bootstrap failures — a dev
// build has no embedded Runtime for the Cua driver daemon to be supervised by —
// before any runner reaches it, and those are not this run's.
const runStartedAt = Date.now();

// The host answers on its pipe before the window has rendered, so the first
// interaction waits for the shell every menu below hangs off.
pilot([
  "wait",
  "--selector",
  "#application-integrations-menu",
  "--timeout",
  "60000",
  "--window",
  windowLabel,
]);

// A mounted package holds its own directory: the Runtime launches the package's
// server with the package root as its working directory, and Windows will not
// delete a directory a live process is sitting in. So the fixture package is
// turned off through the switch the scenario uses, and only then is the copy that
// replaces it written. A run that failed before its own restore leaves the
// package on, which is exactly the case this covers.
openPluginList();
refreshPluginList();
pilot([
  "eval",
  `(async () => {
    const control = () =>
      document.querySelector('[role=dialog] [role=switch][aria-label="${pluginId}"]');
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !(control() instanceof HTMLElement)) await settle();
    const current = control();
    // An instance that has never listed this package has nothing to unmount.
    if (!(current instanceof HTMLElement)) return false;
    if (current.getAttribute("aria-checked") !== "true") return false;
    current.click();
    const off = Date.now() + 3000;
    while (Date.now() < off) {
      if (control()?.getAttribute("aria-checked") === "false") return true;
      await settle();
    }
    throw new Error("the fixture package never reported as disabled");
  })()`,
  "--window",
  windowLabel,
]);
closePluginList();

// A stale copy would hide a broken package, and a report left by an earlier run
// would pass for this one's evidence.
removeWithRetry(installedPackage, 15000);
rmSync(pluginDataRoot, { recursive: true, force: true });
cpSync(fixtureRoot, installedPackage, { recursive: true });
openPluginList();
refreshPluginList();
closePluginList();

// The desktop run path reports a pre-turn failure to the Runtime log rather than
// to the transcript — the composer simply returns to idle — so the log the
// scenario appends to is the only host-observable evidence that the package's own
// program ran and that its failure was carried back with the child's message
// intact. Only the lines this run adds count, so a previous run's evidence cannot
// stand in for this one's.
const logPath = runtimeLogPath();
const logOffset = existsSync(logPath) ? statSync(logPath).size : 0;
const readLogDelta = () => {
  const current = runtimeLogPath();
  return readLogSince(current, current === logPath ? logOffset : 0);
};

pilot(["run", scenario, "--window", windowLabel]);

const commandFailure =
  "openagent-process-plugin stamp recorded this invocation and stopped before the model turn";
const commandDeadline = Date.now() + 20000;
while (!readLogDelta().includes(commandFailure)) {
  if (Date.now() >= commandDeadline) {
    throw new Error(
      `the Runtime never carried the fixture command's own failure to its log (${runtimeLogPath()})`,
    );
  }
  sleepSync(200);
}
process.stdout.write("The Runtime reported the fixture command's own failure.\n");

if (!waitForFile(join(pluginDataRoot, "mcp-report.json"), 20000)) {
  const delta = readLogDelta();
  if (delta.includes("Refusing to launch a writable-policy Windows sandbox wrapper")) {
    throw new Error(
      "the managed sandbox refused to launch its wrapper: the running instance's workspace " +
        `contains the app's build tree. Give it ${fixtureWorkspace} and restart it.`,
    );
  }
  const errors = delta
    .split("\n")
    .filter((line) => line.includes('"level":"error"'))
    .slice(0, 3);
  throw new Error(
    "the fixture's MCP server never reported a completed handshake" +
      (errors.length === 0
        ? ` (no report in ${pluginDataRoot})`
        : `; the Runtime logged: ${errors.join(" | ")}`),
  );
}
const report = JSON.parse(readFileSync(join(pluginDataRoot, "mcp-report.json"), "utf8"));
const methods = Array.isArray(report.methods) ? report.methods : [];
for (const method of ["initialize", "tools/list"]) {
  if (!methods.includes(method)) {
    throw new Error(
      `the fixture's MCP server never completed '${method}' (saw ${methods.join(", ")})`,
    );
  }
}
if (normalizePath(String(report.pluginRoot)) !== normalizePath(installedPackage)) {
  throw new Error(`the MCP server was launched against '${report.pluginRoot}'`);
}
if (normalizePath(String(report.pluginData)) !== normalizePath(pluginDataRoot)) {
  throw new Error(`the MCP server was given '${report.pluginData}' as its data root`);
}
if (report.writes?.dataRoot !== "accepted") {
  throw new Error(`the MCP server could not write its data root: ${JSON.stringify(report.writes)}`);
}
if (report.scratchInsideData !== true) {
  throw new Error(
    `the MCP server's scratch directory left its data root: ${JSON.stringify(report.scratch)}`,
  );
}
if (!Array.isArray(report.survivingCredentialNames) || report.survivingCredentialNames.length > 0) {
  throw new Error(
    `host credentials survived into the plugin process: ${JSON.stringify(report.survivingCredentialNames)}`,
  );
}
process.stdout.write(
  `The fixture's MCP server completed ${methods.join(", ")} under ${report.pluginData}.\n`,
);

// The scenario restores the instance it changed: the package is disabled first,
// so the restored restricted tier is never the launch that has to fail closed.
waitForConfigValue(
  "agent_plugins_enabled",
  pluginId,
  "false",
  "the scenario never disabled the fixture package",
);
waitForConfigValue(
  "permission_profile",
  "enforcement",
  "managed",
  "the scenario did not leave the instance on a managed profile",
);
waitForConfigValue(
  "permission_profile",
  "network",
  "restricted",
  "the scenario did not restore the instance's restricted network tier",
);

const logOutput = pilot(["logs", "--level", "error", "--json", "--window", windowLabel]).trim();
if (logOutput.length > 0) {
  let parsed;
  try {
    parsed = JSON.parse(logOutput);
  } catch (error) {
    throw new Error(`the window error log could not be read: ${logOutput}`, { cause: error });
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.entries)
      ? parsed.entries
      : Array.isArray(parsed?.logs)
        ? parsed.logs
        : [parsed];
  const current = entries.filter((entry) => Number(entry?.timestamp ?? 0) >= runStartedAt);
  if (current.length > 0) {
    throw new Error(`the window logged error entries: ${JSON.stringify(current)}`);
  }
}

process.stdout.write("Plugin process black-box tests passed.\n");
