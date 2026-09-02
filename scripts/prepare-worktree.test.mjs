import { expect, test } from "bun:test";

import { worktreePreparationPlan } from "./prepare-worktree.mjs";

test("prepares a Linux development worktree in dependency order", () => {
  const commands = worktreePreparationPlan({ platform: "linux", profile: "dev" });

  expect(
    commands.map(([command, args]) => [command === process.execPath ? "bun" : command, args]),
  ).toEqual([
    ["git", ["submodule", "update", "--init", "--recursive"]],
    ["bun", ["install", "--frozen-lockfile"]],
    ["bun", ["run", "prepare:linux-sandbox:dev"]],
    ["bun", ["run", "prepare:runtime-server:dev"]],
  ]);
});

test("prepares Windows helpers but skips the Linux-only helper", () => {
  const commands = worktreePreparationPlan({ platform: "win32", profile: "release" });

  expect(commands.map(([, args]) => args)).toEqual([
    ["submodule", "update", "--init", "--recursive"],
    ["install", "--frozen-lockfile"],
    ["run", "prepare:windows-sandbox:release"],
    ["run", "prepare:runtime-server:release"],
  ]);
});

test("rejects an unsupported profile", () => {
  expect(() => worktreePreparationPlan({ profile: "test" })).toThrow("Unsupported Cargo profile");
});
