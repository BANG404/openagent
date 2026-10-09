import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRustHost } from "./prepare-runtime-server.mjs";
import { sourceCargoEnvironment, withSourceCargoLock } from "./source-cargo.mjs";

/** @param {{ packageName: string; testTarget?: string; caseName: string; targetTriple: string; qualify?: boolean }} options */
export function runtimeVerificationPlan({
  packageName,
  testTarget,
  caseName,
  targetTriple,
  qualify = false,
}) {
  if (!packageName?.trim() || !caseName?.trim())
    throw new Error("A package and focused case are required.");
  const base = ["test", "--locked", "--manifest-path", "sdk/Cargo.toml", "--target", targetTriple];
  const focused = [...base, "-p", packageName];
  if (testTarget) focused.push("--test", testTarget);
  else focused.push("--lib");
  focused.push(caseName, "--", "--exact", "--nocapture");
  return qualify ? [focused, [...base, "--workspace"]] : [focused];
}

/** Stop at the first failed stage; full qualification never overlaps focused tests.
 * @param {string[][]} plan
 * @param {(args: string[]) => number} run
 * @param {() => string} [sourceState]
 */
export function runRuntimeVerification(plan, run, sourceState = () => "") {
  const initial = sourceState();
  for (const args of plan) {
    const status = run(args);
    if (status !== 0) return status;
    if (sourceState() !== initial)
      throw new Error(
        "Source changed during verification; rerun the focused case before qualification.",
      );
  }
  return 0;
}

/** A typo or ignored case must not silently qualify a workspace.
 * @param {string} output
 */
export function passedRuntimeTests(output) {
  return [...output.matchAll(/test result: ok\. (\d+) passed;/g)].reduce(
    (sum, match) => sum + Number(match[1]),
    0,
  );
}

/** @param {string} root */
function sourceState(root) {
  const sdkRoot = path.join(root, "sdk");
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, { cwd: sdkRoot, maxBuffer: 64 * 1024 * 1024 });
  const hash = createHash("sha256")
    .update(git(["rev-parse", "HEAD"]))
    .update(git(["diff", "HEAD", "--binary"]));
  for (const file of git(["ls-files", "--others", "--exclude-standard", "-z"])
    .toString()
    .split("\0")
    .filter(Boolean)
    .sort()) {
    hash.update(file).update(readFileSync(path.join(sdkRoot, file)));
  }
  hash.update(readFileSync(path.join(root, ".cargo", "config.toml")));
  return hash.digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--package", "--test", "--case", "--target", "--qualify"]);
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error(`Unknown argument: ${flag}`);
    if (flag === "--qualify") continue;
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const environment = sourceCargoEnvironment({ repositoryRoot: root });
  const version = spawnSync(process.env.RUSTC ?? "rustc", ["-vV"], { encoding: "utf8" });
  if (version.error) throw version.error;
  if (version.status !== 0) throw new Error("Could not inspect the Rust toolchain.");
  const plan = runtimeVerificationPlan({
    packageName: values.get("--package") ?? "openagent-runtime",
    testTarget: values.get("--test"),
    caseName: values.get("--case") ?? "",
    targetTriple:
      values.get("--target") ??
      process.env.OPENAGENT_RUNTIME_TARGET ??
      parseRustHost(version.stdout),
    qualify: args.includes("--qualify"),
  });
  // Keep evidence for inspection; never inherit a developer's application data.
  const fixture = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-verification-"));
  environment.OPENAGENT_HOME = fixture;
  console.log(`Isolated Runtime test data: ${fixture}`);
  process.exitCode = await withSourceCargoLock(environment.CARGO_TARGET_DIR, async () =>
    runRuntimeVerification(
      plan,
      (cargoArgs) => {
        console.log(`Running: cargo ${cargoArgs.join(" ")}`);
        const result = spawnSync(process.env.CARGO ?? "cargo", cargoArgs, {
          cwd: root,
          env: environment,
          encoding: "utf8",
          maxBuffer: 128 * 1024 * 1024,
        });
        const log = path.join(
          fixture,
          cargoArgs.includes("--workspace") ? "workspace.log" : "focused.log",
        );
        writeFileSync(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
        console.log(`Runtime verification log: ${log}`);
        if (result.error) throw result.error;
        if (result.status !== 0) return result.status ?? 1;
        const passed = passedRuntimeTests(result.stdout);
        if (!passed)
          throw new Error(
            "No Runtime tests passed. Check the exact case name or ignored-test status; qualification was stopped.",
          );
        console.log(`Passed Runtime tests: ${passed}`);
        return 0;
      },
      () => sourceState(root),
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
