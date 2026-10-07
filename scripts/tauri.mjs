import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { addDevUrlConfigArgument, findAvailableLoopbackPort } from "./tauri-dev-port.mjs";
import {
  applyDevelopmentInstanceEnvironment,
  parseDevelopmentInstanceArguments,
} from "./tauri-dev-instance.mjs";
import {
  addCargoTargetDirectoryArgument,
  resolveTauriDevTargetDirectory,
} from "./tauri-dev-target.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
await access(tauriCli);

let arguments_ = process.argv.slice(2);
const environment = { ...process.env };
if (process.platform === "win32") {
  // Rust incremental session cleanup can fail on Windows/ReFS when a compiler
  // file handle is still closing, leaving an access-denied warning on startup.
  environment.CARGO_INCREMENTAL ??= "0";
}
let developmentInstanceName;
const developmentParentLifetime = arguments_[0] === "dev";
if (developmentParentLifetime) {
  const parsed = parseDevelopmentInstanceArguments(arguments_);
  arguments_ = parsed.arguments_;
  developmentInstanceName = parsed.instanceName ?? environment.OPENAGENT_DEV_INSTANCE?.trim();
}
const embeddedRuntime = arguments_.includes("--embedded-runtime");
if (embeddedRuntime) {
  if (arguments_[0] !== "dev") {
    throw new Error("--embedded-runtime is available only with tauri dev");
  }
  arguments_ = arguments_.filter((argument) => argument !== "--embedded-runtime");
  arguments_.push(
    "--runner",
    path.join(
      root,
      "scripts",
      process.platform === "win32" ? "embedded-cargo.cmd" : "embedded-cargo.sh",
    ),
  );
  environment.OPENAGENT_RUNTIME_MODE = "embedded";
  environment.OPENAGENT_DEV_RUNTIME_SOURCE = "1";
  environment.CARGO_TARGET_DIR ??= path.join(root, "sdk", "target", "desktop-host", "target");
  console.log("Using the explicit embedded development Runtime");
}
if (developmentParentLifetime) {
  if (developmentInstanceName) {
    Object.assign(
      environment,
      applyDevelopmentInstanceEnvironment(environment, developmentInstanceName),
    );
    console.log(`Starting isolated development instance "${environment.OPENAGENT_DEV_INSTANCE}"`);
  }
  const port = await findAvailableLoopbackPort();
  environment.OPENAGENT_DEV_PORT = String(port);
  arguments_ = addDevUrlConfigArgument(arguments_, port);
  const customRunner = arguments_.some(
    (argument) => argument === "--runner" || argument.startsWith("--runner="),
  );
  if (!environment.CARGO_TARGET_DIR && !customRunner) {
    const targetDirectory = resolveTauriDevTargetDirectory(root, { environment });
    arguments_ = addCargoTargetDirectoryArgument(arguments_, targetDirectory);
    console.log(`Using isolated Cargo target directory ${targetDirectory}`);
  }
  console.log(`Starting development server on http://localhost:${port}`);
}

if (developmentParentLifetime) {
  environment.OPENAGENT_HOME ??= path.join(os.homedir(), ".openagent-dev");
  // Keep the development desktop tied to this launcher. On Windows, closing
  // the terminal does not reliably deliver a console signal to the GUI host,
  // but it does close this pipe when the launcher exits.
  environment.OPENAGENT_DEV_PARENT_LIFETIME = "1";
}

const child = spawn(process.execPath, [tauriCli, ...arguments_], {
  cwd: root,
  env: environment,
  stdio: developmentParentLifetime ? ["pipe", "inherit", "inherit"] : "inherit",
});
if (developmentParentLifetime) {
  const closeChildInput = () => {
    child.stdin?.end();
  };
  process.once("SIGINT", closeChildInput);
  process.once("SIGTERM", closeChildInput);
}
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
process.exit(exitCode);
