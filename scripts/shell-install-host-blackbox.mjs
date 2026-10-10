// @ts-check
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyPreparedDevKit } from "./prepare-dev-kit.mjs";

/** Exercise the real native command with its exact signed, prepared Runtime.
 * @param {string} root
 * @param {string} directory
 */
export async function verifyShellInstallHost(root, directory) {
  await verifyPreparedDevKit(root);
  const home = path.join(directory, "host-data");
  await mkdir(home, { recursive: true });
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(
      "<!doctype html><title>OpenAgent shell install fixture</title><p>Shell install fixture</p>",
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture port unavailable");
  const environment = {
    ...process.env,
    OPENAGENT_HOME: home,
    OPENAGENT_DEV_MULTI_INSTANCE: "1",
    OPENAGENT_DEV_INSTANCE: "shell-install",
    TAURI_PILOT_SOCKET: String.raw`\\.\pipe\tauri-pilot-com.iumm.openagent.dev.shell-install`,
    CARGO_INCREMENTAL: "0",
  };
  const config = JSON.stringify({
    build: { beforeDevCommand: "", devUrl: `http://127.0.0.1:${address.port}` },
    app: {
      windows: [
        {
          label: "main",
          title: "OpenAgent shell install fixture",
          width: 1040,
          height: 600,
          visible: true,
        },
      ],
    },
  });
  const desktop = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/@tauri-apps/cli/tauri.js"),
      "dev",
      "--no-watch",
      "--config",
      config,
    ],
    { cwd: root, env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  let logs = "";
  desktop.stdout?.on("data", (chunk) => {
    logs += String(chunk);
    process.stdout.write(chunk);
  });
  desktop.stderr?.on("data", (chunk) => {
    logs += String(chunk);
    process.stdout.write(chunk);
  });
  /** @param {string[]} args */
  function pilot(args) {
    return spawnSync("tauri-pilot", [...args, "--window", "main"], {
      cwd: directory,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
      timeout: 40000,
    });
  }
  try {
    let ready = false;
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      if (desktop.exitCode !== null) throw new Error(`Native fixture exited: ${logs.slice(-6000)}`);
      const result = pilot(["title"]);
      if (result.status === 0 && result.stdout.includes("OpenAgent shell install fixture")) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, `Native fixture did not become ready: ${logs.slice(-6000)}`);
    assert.equal(pilot(["snapshot", "-i"]).status, 0);
    const result = pilot([
      "run",
      path.join(root, "tests/blackbox/shell-install.toml"),
      "--junit",
      path.join(directory, "host.xml"),
    ]);
    await writeFile(path.join(directory, "host-scenario.log"), result.stdout + result.stderr);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const logDirectory = path.join(home, "logs");
    const hostFiles = (await readdir(logDirectory)).filter((name) =>
      name.startsWith("openagent-host.jsonl"),
    );
    const hostLogs = (
      await Promise.all(hostFiles.map((name) => readFile(path.join(logDirectory, name), "utf8")))
    ).join("\n");
    assert.ok(
      hostLogs.includes('"stage":"install_prepared"'),
      "Host did not record confirmed teardown",
    );
    assert.ok(!hostLogs.includes('"stage":"install_preparation_failed"'));
    console.log("Native Tauri shell: preparation confirmed Runtime exit before handing off");
  } finally {
    pilot(["eval", "window.__TAURI_INTERNALS__.invoke('quit_app')"]);
    const deadline = Date.now() + 15000;
    while (desktop.exitCode === null && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (desktop.exitCode === null) desktop.kill();
    server.close();
  }
}
