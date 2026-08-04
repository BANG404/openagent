import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { prepareLinuxSandboxHelper } from "./prepare-linux-sandbox-helper.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
await access(tauriCli);

const tauriArguments = process.argv.slice(2);
const targetIndex = tauriArguments.findIndex(
  (argument) => argument === "--target" || argument === "-t",
);
const targetTriple =
  targetIndex === -1
    ? tauriArguments.find((argument) => argument.startsWith("--target="))?.slice("--target=".length)
    : tauriArguments[targetIndex + 1];
const environment = { ...process.env };
if (process.platform === "linux") {
  const { digest } = await prepareLinuxSandboxHelper({
    profile: "release",
    targetTriple,
  });
  if (!digest) throw new Error("The Linux release sandbox helper did not produce a digest.");
  environment.CODEX_BWRAP_SHA256 = digest;
}

const result = spawnSync(process.execPath, [tauriCli, "build", ...tauriArguments], {
  cwd: root,
  env: environment,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
