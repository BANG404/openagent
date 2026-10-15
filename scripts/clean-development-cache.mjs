import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activeExecutablePaths,
  cleanDevelopmentTargets,
  cleanDevelopmentRuntimeImages,
} from "./development-cache.mjs";
import { parseRustHost } from "./prepare-runtime-server.mjs";
import { execFileSync } from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => !["--apply", "--include-legacy"].includes(argument)))
  throw new Error("Usage: bun scripts/clean-development-cache.mjs [--apply] [--include-legacy]");
const apply = arguments_.includes("--apply");
const activePaths = activeExecutablePaths();
const targetTriple = parseRustHost(execFileSync("rustc", ["-vV"], { encoding: "utf8" }));
const results = await cleanDevelopmentTargets({
  repositoryRoot,
  apply,
  activePaths,
  includeLegacy: arguments_.includes("--include-legacy"),
});
results.push(
  ...(await cleanDevelopmentRuntimeImages({
    repositoryRoot,
    targetTriple,
    apply,
    activePaths,
    destination: path.join(
      repositoryRoot,
      "src-tauri",
      "binaries",
      `openagent-server-${targetTriple}${targetTriple.includes("windows") ? ".exe" : ""}`,
    ),
  })),
);
for (const result of results)
  console.log(
    `${result.removed ? "Removed" : apply ? "Skipped" : "Would remove"}: ${result.path} (${result.reason})`,
  );
console.log(
  `${apply ? "Removed" : "Eligible"} cache directories: ${apply ? results.filter((result) => result.removed).length : results.length}`,
);
