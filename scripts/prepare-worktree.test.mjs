import { afterAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { worktreePreparationPlan } from "./prepare-worktree.mjs";
import { prepareSubmodules } from "./prepare-submodules.mjs";

/** @type {string[]} */
const fixtures = [];
afterAll(() => {
  for (const fixture of fixtures) rmSync(fixture, { recursive: true, force: true });
});

function checkoutFixture() {
  const directory = mkdtempSync(join(tmpdir(), "openagent-submodule-eol-"));
  fixtures.push(directory);
  const globalConfig = join(directory, "gitconfig");
  writeFileSync(globalConfig, "[core]\n\tautocrlf = true\n");
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_ALLOW_PROTOCOL: "file",
  };
  /** @param {string} cwd @param {string[]} args */
  const git = (cwd, args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  /** @param {string} name */
  const repository = (name) => {
    const root = join(directory, name);
    mkdirSync(root);
    git(root, ["init", "--quiet"]);
    git(root, ["config", "core.autocrlf", "false"]);
    git(root, ["config", "user.name", "Checkout Fixture"]);
    git(root, ["config", "user.email", "fixture@example.invalid"]);
    return root;
  };
  /** @param {string} root */
  const commit = (root) => {
    git(root, ["add", "."]);
    git(root, ["commit", "--quiet", "-m", "fixture"]);
  };
  const leaf = repository("leaf");
  for (const name of ["artifact", "edited", "staged", "deleted"]) {
    writeFileSync(join(leaf, name), "first\nsecond\n");
  }
  writeFileSync(join(leaf, ".gitattributes"), "windows text eol=crlf\nbinary -text\n");
  writeFileSync(join(leaf, "windows"), "windows\n");
  writeFileSync(join(leaf, "binary"), Buffer.from([0, 13, 10, 1]));
  commit(leaf);
  const middle = repository("middle");
  git(middle, ["submodule", "add", "--quiet", leaf, "nested"]);
  commit(middle);
  const parent = repository("parent");
  git(parent, ["submodule", "add", "--quiet", middle, "plugin"]);
  commit(parent);
  const root = join(directory, "checkout");
  git(directory, ["clone", "--quiet", parent, root]);
  return { root, env, git, globalConfig, plugin: join(root, "plugin", "nested") };
}

test("recursive first checkout preserves LF despite inherited Windows autocrlf", () => {
  const { root, env, git, globalConfig, plugin } = checkoutFixture();
  const before = readFileSync(globalConfig);
  expect(prepareSubmodules({ root, env })).toEqual({ submodules: 2, repaired: 0 });
  expect(readFileSync(join(plugin, "artifact"), "utf8")).toBe("first\nsecond\n");
  expect(readFileSync(join(plugin, "windows"), "utf8")).toBe("windows\r\n");
  expect(readFileSync(join(plugin, "binary"))).toEqual(Buffer.from([0, 13, 10, 1]));
  for (const module of [join(root, "plugin"), plugin]) {
    expect(git(module, ["config", "--local", "core.autocrlf"])).toBe("false");
    expect(git(module, ["config", "--local", "core.eol"])).toBe("lf");
  }
  expect(git(plugin, ["status", "--porcelain"])).toBe("");
  expect(readFileSync(globalConfig)).toEqual(before);
  // Future checkout without the helper also keeps artifact bytes unchanged.
  rmSync(join(plugin, "artifact"));
  git(plugin, ["checkout-index", "--force", "--", "artifact"]);
  expect(readFileSync(join(plugin, "artifact"), "utf8")).toBe("first\nsecond\n");
}, 60_000);

test("legacy conversion repair preserves edits, staging, deletion and explicit attributes", () => {
  const { root, env, git, plugin } = checkoutFixture();
  git(root, ["submodule", "update", "--init", "--recursive"]);
  expect(readFileSync(join(plugin, "artifact"), "utf8")).toBe("first\r\nsecond\r\n");
  writeFileSync(join(plugin, "edited"), "user edit\r\n");
  writeFileSync(join(plugin, "staged"), "staged edit\r\n");
  git(plugin, ["add", "staged"]);
  rmSync(join(plugin, "deleted"));
  writeFileSync(join(plugin, "untracked"), "untracked\r\n");
  const index = git(plugin, ["ls-files", "--stage"]);
  expect(prepareSubmodules({ root, env }).repaired).toBeGreaterThan(0);
  expect(readFileSync(join(plugin, "artifact"), "utf8")).toBe("first\nsecond\n");
  expect(readFileSync(join(plugin, "edited"), "utf8")).toBe("user edit\r\n");
  expect(readFileSync(join(plugin, "staged"), "utf8")).toBe("staged edit\r\n");
  expect(readFileSync(join(plugin, "untracked"), "utf8")).toBe("untracked\r\n");
  expect(readFileSync(join(plugin, "windows"), "utf8")).toBe("windows\r\n");
  expect(readFileSync(join(plugin, "binary"))).toEqual(Buffer.from([0, 13, 10, 1]));
  expect(git(plugin, ["ls-files", "--stage"])).toBe(index);
  expect(git(plugin, ["status", "--porcelain"])).toContain("D deleted");
  expect(git(plugin, ["status", "--porcelain"])).not.toContain("artifact");
  expect(prepareSubmodules({ root, env }).repaired).toBe(0);
}, 60_000);

test("light development preparation has no Cargo or sandbox build", () => {
  const commands = worktreePreparationPlan({ platform: "linux", profile: "dev" });

  expect(
    commands.map(([command, args]) => [command === process.execPath ? "bun" : command, args]),
  ).toEqual([
    ["bun", ["scripts/prepare-submodules.mjs"]],
    ["bun", ["install", "--frozen-lockfile"]],
    ["bun", ["scripts/prepare-source-dev.mjs", "--client-only"]],
  ]);
});

test("prepares Windows helpers but skips the Linux-only helper", () => {
  const commands = worktreePreparationPlan({ platform: "win32", profile: "release" });

  expect(commands.map(([, args]) => args)).toEqual([
    ["scripts/prepare-submodules.mjs"],
    ["install", "--frozen-lockfile"],
    ["scripts/prepare-source-dev.mjs", "--client-only"],
    ["scripts/prepare-node-runtime.mjs"],
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
