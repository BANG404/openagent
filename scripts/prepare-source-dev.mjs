import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareSourceClient } from "./prepare-dev-kit.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
await prepareSourceClient(root);
if (!process.argv.includes("--client-only")) {
  const result = spawnSync(
    process.execPath,
    ["scripts/tauri.mjs", "dev", ...process.argv.slice(2)],
    {
      cwd: root,
      env: { ...process.env, OPENAGENT_DEV_RUNTIME_SOURCE: "1" },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
