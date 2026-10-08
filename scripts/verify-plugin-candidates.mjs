import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} source @returns {"node" | "bun"} */
export function candidateTestFramework(source) {
  const node = /\bfrom\s*["']node:test["']/.test(source);
  const bun = /\bfrom\s*["']bun:test["']/.test(source);
  if (node && bun) {
    throw new Error("Candidate tests cannot mix node:test and bun:test.");
  }
  // Existing Bun suites also use the runner's implicit test/expect globals.
  return node ? "node" : "bun";
}

/** @param {string} root @returns {Array<{command: "node" | "bun", args: string[]}>} */
export function candidateVerificationCommands(root) {
  /** @type {Record<"node" | "bun", string[]>} */
  const files = { node: [], bun: [] };
  for (const packageEntry of readdirSync(root, { withFileTypes: true })) {
    if (!packageEntry.isDirectory()) continue;
    const directory = join(root, packageEntry.name, "tests");
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".test.mjs")) continue;
      const path = join(directory, entry.name);
      const framework = candidateTestFramework(readFileSync(path, "utf8"));
      files[framework].push(path);
    }
  }
  if (files.node.length + files.bun.length === 0) {
    throw new Error("No packaged plugin tests found.");
  }
  /** @type {Array<{command: "node" | "bun", args: string[]}>} */
  const commands = [];
  if (files.node.length) {
    commands.push({
      command: "node",
      args: ["--test", "--test-timeout=10000", ...files.node.sort()],
    });
  }
  if (files.bun.length) {
    commands.push({ command: "bun", args: ["test", "--timeout", "10000", ...files.bun.sort()] });
  }
  return commands;
}

/**
 * @param {string} root
 * @param {{run?: (command: string, args: string[], options: {stdio: "inherit", timeout: number}) => {status: number | null, error?: Error}}} [options]
 */
export function verifyCandidateTests(root, { run = spawnSync } = {}) {
  for (const { command, args } of candidateVerificationCommands(root)) {
    const count = args.filter((argument) => argument.endsWith(".test.mjs")).length;
    console.log(`Verifying packaged ${command} tests (${count} files).`);
    const result = run(command, args, { stdio: "inherit", timeout: 120000 });
    if (result.error || result.status !== 0) {
      throw new Error(`Packaged ${command} tests failed or exceeded the verification deadline.`, {
        cause: result.error,
      });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--root");
  const root = index >= 0 ? process.argv[index + 1] : undefined;
  if (!root)
    throw new Error("Usage: bun scripts/verify-plugin-candidates.mjs --root <extracted-packages>");
  verifyCandidateTests(resolve(root));
}
