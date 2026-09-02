import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

export function worktreePreparationPlan({ platform = process.platform, profile = "dev" } = {}) {
  if (profile !== "dev" && profile !== "release") {
    throw new Error(`Unsupported Cargo profile: ${profile}`);
  }

  const bun = process.execPath;
  const commands = [
    ["git", ["submodule", "update", "--init", "--recursive"]],
    [bun, ["install", "--frozen-lockfile"]],
  ];
  if (platform === "linux") {
    commands.push([bun, ["run", `prepare:linux-sandbox:${profile}`]]);
  } else if (platform === "win32") {
    commands.push([bun, ["run", `prepare:windows-sandbox:${profile}`]]);
  }
  commands.push([bun, ["run", `prepare:runtime-server:${profile}`]]);
  return commands;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

export function prepareWorktree({ platform = process.platform, profile = "dev" } = {}) {
  for (const [command, args] of worktreePreparationPlan({ platform, profile })) {
    run(command, args);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  prepareWorktree({ profile: argument("--profile", "dev") });
}
