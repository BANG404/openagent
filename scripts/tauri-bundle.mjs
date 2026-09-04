import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
await access(tauriCli);

const result = spawnSync(process.execPath, [tauriCli, "bundle", ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
