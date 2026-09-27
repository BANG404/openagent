import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.sonar");

try {
  const contents = readFileSync(envFile, "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_]\w*$/u.test(name)) continue;
    const value = line.slice(separator + 1).trim();
    process.env[name] = /^(["'])[\s\S]*\1$/u.test(value) ? value.slice(1, -1) : value;
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (!process.env.SONAR_TOKEN) {
  console.error(`Missing SONAR_TOKEN in ${envFile}`);
  process.exit(1);
}

const repositoryRoot = process.cwd();
const coverageRoot = resolve(repositoryRoot, "coverage", "sonar");

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: command === "sonar-scanner" && process.platform === "win32",
  });

  if (result.error) {
    console.error(`Unable to start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function testFilesUnder(directory) {
  const absoluteDirectory = resolve(repositoryRoot, directory);
  const entries = readdirSync(absoluteDirectory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) return testFilesUnder(relativePath);
    if (!entry.isFile() || !/\.(?:test|spec)\.(?:js|mjs|ts)$/u.test(entry.name)) return [];
    return [relative(repositoryRoot, resolve(repositoryRoot, relativePath))];
  });
}

rmSync(coverageRoot, { recursive: true, force: true });
mkdirSync(coverageRoot, { recursive: true });

for (const packagePath of ["sdk/typescript", "sdk/harness-typescript"]) {
  run(process.execPath, ["install", "--frozen-lockfile"], resolve(repositoryRoot, packagePath));
}

run(process.execPath, [
  "test",
  "--coverage",
  "--coverage-reporter=lcov",
  "--coverage-dir",
  join(coverageRoot, "host"),
  ...testFilesUnder("tests"),
  ...testFilesUnder("scripts"),
]);

run(process.execPath, [
  "test",
  "--coverage",
  "--coverage-reporter=lcov",
  "--coverage-dir",
  join(coverageRoot, "sdk-typescript"),
  "sdk/typescript/tests",
]);

run(process.execPath, [
  "test",
  "--coverage",
  "--coverage-reporter=lcov",
  "--coverage-dir",
  join(coverageRoot, "sdk-harness-typescript"),
  "sdk/harness-typescript/tests",
]);

run("cargo", [
  "test",
  "--manifest-path",
  resolve(repositoryRoot, "sdk", "Cargo.toml"),
  "--workspace",
]);

run("cargo", ["test", "--manifest-path", resolve(repositoryRoot, "src-tauri", "Cargo.toml")]);

const scannerAvailable =
  process.platform === "win32"
    ? spawnSync("where.exe", ["sonar-scanner"], { stdio: "ignore" }).status === 0 // NOSONAR: fixed platform lookup utility.
    : spawnSync("sh", ["-c", "command -v sonar-scanner"], { stdio: "ignore" }).status === 0; // NOSONAR: fixed platform lookup utility.

if (scannerAvailable) {
  run("sonar-scanner", []);
} else {
  run(process.execPath, ["x", "--bun", "sonar-scanner"]);
}
