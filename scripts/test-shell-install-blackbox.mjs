// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyShellInstallHost } from "./shell-install-host-blackbox.mjs";

if (process.platform !== "win32") throw new Error("NSIS qualification requires Windows");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-install-wait-"));
const compiler =
  process.env.MAKENSIS ??
  path.join(process.env.LOCALAPPDATA ?? "", "tauri", "NSIS", "makensis.exe");
await access(compiler);
const holder = path.join(directory, "holder.exe");
/** @param {string} command @param {string[]} args */
function compile(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}
compile("rustc", [path.join(root, "scripts/fixtures/shell-install/holder.rs"), "-o", holder]);

/** @param {string} name @param {number} [language] */
async function fixture(name, language = 1033) {
  const target = path.join(directory, name, "安装目录 with spaces");
  await mkdir(target, { recursive: true });
  await copyFile(holder, path.join(target, "openagent.exe"));
  const installer = path.join(directory, `${name}.exe`);
  compile(compiler, [
    "-V2",
    `-DFIXTURE_OUTPUT=${installer}`,
    `-DFIXTURE_INSTALL_DIR=${target}`,
    `-DOPENAGENT_INSTALL_TEST_LOG=${installer}.log`,
    `-DFIXTURE_LANGUAGE=${language}`,
    `-DOPENAGENT_HOOKS=${path.join(root, "src-tauri/windows/install-hooks.nsh")}`,
    path.join(root, "scripts/fixtures/shell-install/installer.nsi"),
  ]);
  return { target, installer, marker: path.join(target, "installed.txt") };
}

/** @param {string} executable @param {string[]} args */
function start(executable, args) {
  const child = spawn(executable, args, {
    windowsHide: true,
    // NSIS's _?= consumes the raw remainder of the command line, including
    // spaces. Quoting the whole argument makes its bootstrap spawn a second
    // process and return before the actual uninstall finishes.
    windowsVerbatimArguments: args.some((arg) => arg.startsWith("_?=")),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  return { child, done };
}
/** @param {string} executable @param {number} millis @param {string | undefined} [file] */
async function hold(executable, millis, file) {
  const running = start(executable, [String(millis), ...(file ? [file] : [])]);
  await new Promise((resolve, reject) => {
    running.child.stdout?.once("data", () => resolve(undefined));
    running.child.once("error", reject);
    running.done.then(() => reject(new Error("Holder exited before readiness")), reject);
  });
  return running;
}
/** @param {string} executable @param {string[]} [args] */
async function runInstaller(executable, args = ["/S"]) {
  const started = performance.now();
  const running = start(executable, args);
  const timeout = setTimeout(() => running.child.kill(), 45_000);
  try {
    return { code: await running.done, elapsed: performance.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

for (const delay of [1000, 5000, 15000]) {
  const current = await fixture(`slow-${delay}`, delay === 5000 ? 2052 : 1033);
  const processHolder = await hold(path.join(current.target, "openagent.exe"), delay);
  const result = await runInstaller(current.installer);
  assert.equal(result.code, 0, `Slow exit ${delay}: ${JSON.stringify(result)}`);
  assert.ok(result.elapsed >= delay - 300, "Installer did not wait for the old image");
  assert.equal(await readFile(current.marker, "utf8"), "installed");
  assert.equal(await processHolder.done, 0);
  console.log(`Delayed exit ${delay} ms: installed automatically in ${result.elapsed} ms`);
}

const locked = await fixture("temporary-resource-lock");
const resource = path.join(locked.target, "resources", "nested", "bundle.dat");
await mkdir(path.dirname(resource), { recursive: true });
await writeFile(resource, "original");
const fileHolder = await hold(holder, 5000, resource);
const lockResult = await runInstaller(locked.installer);
assert.equal(lockResult.code, 0);
assert.ok(lockResult.elapsed >= 4700);
assert.equal(await readFile(resource, "utf8"), "original");
await fileHolder.done;
console.log("Temporary resource lock: retried automatically without modifying the held bytes");

const denied = await fixture("permission-error");
await writeFile(denied.marker, "old version");
const readOnly = path.join(denied.target, "read-only.dat");
await writeFile(readOnly, "original");
compile("attrib", ["+R", readOnly]);
try {
  const result = await runInstaller(denied.installer);
  assert.equal(result.code, 2);
  assert.ok(result.elapsed < 5000, "A permission failure was retried as a lock");
  assert.equal(await readFile(denied.marker, "utf8"), "old version");
  assert.equal(await readFile(readOnly, "utf8"), "original");
  console.log("Permission failure: stopped immediately; old files preserved");
} finally {
  compile("attrib", ["-R", readOnly]);
}

const passive = await fixture("manual-maintenance");
const manualHolder = await hold(path.join(passive.target, "openagent.exe"), 5000);
const passiveResult = await runInstaller(passive.installer, ["/P"]);
assert.equal(passiveResult.code, 0);
assert.ok(passiveResult.elapsed >= 4700, "Manual maintenance ran before the gate");
await manualHolder.done;
assert.equal(await readFile(passive.marker, "utf8"), "installed");
console.log("Manual maintenance: waited before continuing into installer pages");

const timeoutFixture = await fixture("timeout", 2052);
await writeFile(timeoutFixture.marker, "old version");
const stuck = await hold(path.join(timeoutFixture.target, "openagent.exe"), 60_000);
try {
  const result = await runInstaller(timeoutFixture.installer);
  assert.equal(result.code, 2);
  assert.ok(result.elapsed >= 29_750 && result.elapsed < 40_000, JSON.stringify(result));
  assert.equal(await readFile(timeoutFixture.marker, "utf8"), "old version");
  assert.equal(stuck.child.exitCode, null, "Installer killed the old process");
  console.log("30-second timeout: old files and running process preserved");
} finally {
  stuck.child.kill();
  await stuck.done;
}

const unrelated = await fixture("other-installation");
const unrelatedHolder = await hold(path.join(unrelated.target, "openagent.exe"), 60_000);
try {
  const current = await fixture("scope");
  assert.equal((await runInstaller(current.installer)).code, 0);
  assert.equal(unrelatedHolder.child.exitCode, null, "Same-name unrelated process was stopped");
  const exiting = await hold(path.join(current.target, "openagent.exe"), 5000);
  const result = await runInstaller(path.join(current.target, "uninstall.exe"), [
    "/S",
    `_?=${current.target}`,
  ]);
  assert.equal(result.code, 0);
  assert.ok(result.elapsed >= 4700);
  await assert.rejects(access(current.marker));
  await exiting.done;
  console.log("Scoped uninstall: waited for target; unrelated installation stayed running");
} finally {
  unrelatedHolder.child.kill();
  await unrelatedHolder.done;
}
await verifyShellInstallHost(root, directory);
console.log(`Windows installer qualification passed. Artifacts: ${directory}`);
