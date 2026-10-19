import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// cf 1.0.0-beta.18 Build Output Specification v0; no application build or secrets.
const scratch = await mkdtemp(join(tmpdir(), "openagent-site-proxy-"));
try {
  const output = join(scratch, ".cloudflare/output/v0");
  const worker = join(output, "workers/default");
  await mkdir(join(worker, "bundle"), { recursive: true });
  await copyFile(
    new URL("./cloudflare-site-proxy.mjs", import.meta.url),
    join(worker, "bundle/index.mjs"),
  );
  await writeFile(
    join(output, "config.json"),
    JSON.stringify({
      accountId: "967574badc2c697e84fc0d2558a7d2a2",
      buildContext: { isPreview: false },
    }),
  );
  await writeFile(
    join(worker, "worker.config.json"),
    JSON.stringify({
      name: "openagent-site-proxy",
      compatibilityDate: "2026-10-06",
      domains: ["openagent.ibat.ac.cn"],
      manifest: {
        type: "complete",
        mainModule: "index.mjs",
        modules: { "index.mjs": { type: "esm" } },
      },
    }),
  );
  const args = ["deploy", "--prebuilt"];
  if (process.argv.includes("--dry-run")) args.push("--dry-run");
  execFileSync("cf", args, { cwd: scratch, stdio: "inherit", windowsHide: true });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
