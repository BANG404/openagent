import { spawnSync } from "node:child_process";
import { verifyPreparedDevKit } from "./prepare-dev-kit.mjs";

if (process.env.OPENAGENT_DEV_RUNTIME_SOURCE === "1") {
  const script =
    process.platform === "win32"
      ? "prepare:windows-sandbox:dev"
      : process.platform === "linux"
        ? "prepare:linux-sandbox:dev"
        : null;
  if (script) {
    const result = spawnSync(process.execPath, ["run", script], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} else {
  await verifyPreparedDevKit();
  console.log("Using the verified helper resources from the pinned public development kit.");
}

const bootstrap = spawnSync(process.execPath, ["run", "build:bootstrap"], { stdio: "inherit" });
if (bootstrap.error) throw bootstrap.error;
if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);
