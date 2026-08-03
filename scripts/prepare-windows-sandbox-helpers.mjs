import { copyFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const helperNames = ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

if (process.platform !== "win32") {
  console.log("Windows sandbox helpers are not required on this platform.");
  process.exit(0);
}

const requestedProfile = argument("--profile", "dev");
if (!new Set(["dev", "release"]).has(requestedProfile)) {
  throw new Error(`Unsupported Cargo profile: ${requestedProfile}`);
}
const profileDirectory = requestedProfile === "dev" ? "debug" : "release";
const targetDirectory = path.resolve(
  root,
  argument("--target-dir", path.join("src-tauri", "target")),
);
const cargo = process.env.CARGO ?? "cargo";

const metadata = JSON.parse(
  run(cargo, [
    "metadata",
    "--locked",
    "--format-version",
    "1",
    "--manifest-path",
    path.join("sdk", "Cargo.toml"),
  ]),
);
const sandboxPackage = metadata.packages.find(
  (candidate) => candidate.name === "codex-windows-sandbox" && candidate.source?.startsWith("git+"),
);
if (!sandboxPackage) {
  throw new Error("The pinned Codex Windows sandbox package was not found in SDK metadata.");
}
const revision = sandboxPackage.source.split("#").at(-1);
if (!revision || !/^[0-9a-f]{40}$/.test(revision)) {
  throw new Error(
    `The Codex Windows sandbox source is not pinned to a commit: ${sandboxPackage.source}`,
  );
}

run(
  cargo,
  [
    "build",
    "--locked",
    "--manifest-path",
    sandboxPackage.manifest_path,
    "--package",
    "codex-windows-sandbox",
    "--bin",
    "codex-windows-sandbox-setup",
    "--bin",
    "codex-command-runner",
    "--profile",
    requestedProfile,
    "--target-dir",
    targetDirectory,
  ],
  { stdio: "inherit" },
);

const resourceDirectory = path.join(root, "src-tauri", "resources", "codex-resources");
await mkdir(resourceDirectory, { recursive: true });
for (const helperName of helperNames) {
  await copyFile(
    path.join(targetDirectory, profileDirectory, helperName),
    path.join(resourceDirectory, helperName),
  );
}

console.log(`Prepared Codex Windows sandbox helpers from ${revision}.`);
