import { expect, test } from "bun:test";

import { worktreePreparationPlan } from "./prepare-worktree.mjs";

test("light development preparation has no Cargo or sandbox build", () => {
  const commands = worktreePreparationPlan({ platform: "linux", profile: "dev" });

  expect(
    commands.map(([command, args]) => [command === process.execPath ? "bun" : command, args]),
  ).toEqual([
    ["git", ["submodule", "update", "--init", "--recursive"]],
    ["bun", ["install", "--frozen-lockfile"]],
    ["bun", ["scripts/prepare-source-dev.mjs", "--client-only"]],
  ]);
});

test("prepares Windows helpers but skips the Linux-only helper", () => {
  const commands = worktreePreparationPlan({ platform: "win32", profile: "release" });

  expect(commands.map(([, args]) => args)).toEqual([
    ["submodule", "update", "--init", "--recursive"],
    ["install", "--frozen-lockfile"],
    ["scripts/prepare-source-dev.mjs", "--client-only"],
    ["run", "prepare:windows-sandbox:release"],
    ["run", "prepare:runtime-server:release"],
  ]);
});

test("native development preparation is explicit and follows source client preparation", () => {
  const commands = worktreePreparationPlan({ platform: "win32", native: true });
  expect(commands.slice(-2).map(([, args]) => args)).toEqual([
    ["run", "prepare:windows-sandbox:dev"],
    ["run", "prepare:runtime-server:dev"],
  ]);
  expect(commands[2][1]).toEqual(["scripts/prepare-source-dev.mjs", "--client-only"]);
});

test("rejects an unsupported profile", () => {
  expect(() => worktreePreparationPlan({ profile: "test" })).toThrow("Unsupported Cargo profile");
});
