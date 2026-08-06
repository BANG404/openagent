import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { addDevUrlConfigArgument, findAvailableLoopbackPort } from "./tauri-dev-port.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
await access(tauriCli);

let arguments_ = process.argv.slice(2);
const environment = { ...process.env };
if (arguments_[0] === "dev") {
  const port = await findAvailableLoopbackPort();
  environment.OPENAGENT_DEV_PORT = String(port);
  arguments_ = addDevUrlConfigArgument(arguments_, port);
  console.log(`Starting development server on http://localhost:${port}`);
}

const child = spawn(process.execPath, [tauriCli, ...arguments_], {
  cwd: root,
  env: environment,
  stdio: "inherit",
});
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
process.exit(exitCode);
