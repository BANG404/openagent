import { describe, expect, test } from "bun:test";
import { planPluginRelease, pluginReleaseBump } from "./plugin-release.mjs";
import { releasePinnedPlugins } from "./plugin-release.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("independent plugin release versions", () => {
  test("uses the software Conventional Commit policy", () => {
    expect(pluginReleaseBump(["feat: bridge capability", "fix: bug"])).toBe("minor");
    expect(pluginReleaseBump(["feat!: incompatible bridge"])).toBe("major");
    expect(pluginReleaseBump(["fix: bug\n\nBREAKING CHANGE: changed contract"])).toBe("major");
    expect(pluginReleaseBump(["perf: startup"])).toBe("patch");
    expect(pluginReleaseBump(["docs: usage"])).toBe("none");
  });
  test("bumps from automation tags and reuses unchanged source", () => {
    const source = {
      version: "1.0.0",
      tags: ["v1.0.0", "plugin-v1.1.0"],
      commits: ["fix: bridge"],
      sameSource: false,
    };
    expect(planPluginRelease(source)).toEqual({ version: "1.1.1", publish: true });
    expect(planPluginRelease({ ...source, sameSource: true })).toEqual({
      version: "1.1.0",
      publish: false,
    });
    expect(planPluginRelease({ ...source, commits: ["docs: usage"] })).toEqual({
      version: "1.1.1",
      publish: true,
    });
  });
  test("packages the pinned changed source with an independent version and root manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "openagent-plugin-publication-"));
    try {
      const source = join(root, "plugins", "demo");
      mkdirSync(source, { recursive: true });
      /** @param {string} cwd @param {string[]} args */
      const git = (cwd, args) =>
        execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
      for (const directory of [root, source]) {
        git(directory, ["init"]);
        git(directory, ["config", "user.name", "Plugin test"]);
        git(directory, ["config", "user.email", "plugin-test@example.invalid"]);
        git(directory, ["config", "core.autocrlf", "false"]);
      }
      const manifest = {
        name: "demo",
        version: "1.0.0",
        repository: "https://github.com/example/demo",
      };
      writeFileSync(join(source, "plugin.json"), JSON.stringify(manifest));
      git(source, ["add", "plugin.json"]);
      git(source, ["commit", "-m", "feat: initial package"]);
      git(source, ["tag", "v1.0.0"]);
      writeFileSync(join(source, "README.md"), "Changed standard code");
      git(source, ["add", "README.md"]);
      git(source, ["commit", "-m", "fix: standard package"]);
      const sha = git(source, ["rev-parse", "HEAD"]);
      writeFileSync(join(root, "plugins", "dev-index.json"), JSON.stringify({ demo: "demo" }));
      mkdirSync(join(root, "sdk/rust/openagent-protocol/src"), { recursive: true });
      writeFileSync(
        join(root, "sdk/rust/openagent-protocol/src/lib.rs"),
        "pub const PLUGIN_PROTOCOL_VERSION: u32 = 1;",
      );
      git(root, ["add", "plugins/dev-index.json", "sdk"]);
      git(root, ["update-index", "--add", "--cacheinfo", "160000", sha, "plugins/demo"]);
      git(root, ["commit", "-m", "feat: pin package"]);
      const output = join(root, "candidates");
      expect(releasePinnedPlugins({ root, output, publish: false })[0]).toMatchObject({
        version: "1.0.1",
        source_sha: sha,
        publish: true,
      });
      const packaged = JSON.parse(readFileSync(join(output, "demo/plugin.json"), "utf8"));
      expect(packaged.version).toBe("1.0.1");
      expect(packaged.extensions.openagent.compatibility.plugin_protocol).toEqual({
        min: 1,
        max: 1,
      });
      expect(JSON.parse(readFileSync(join(source, "plugin.json"), "utf8"))).toEqual(manifest);
      const tar =
        process.platform === "win32"
          ? join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe")
          : "tar";
      const members = execFileSync(tar, ["-tf", join(output, "demo-1.0.1.tar.gz")], {
        encoding: "utf8",
      })
        .trim()
        .split(/\r?\n/);
      expect(members).toContain("plugin.json");
      expect(members).not.toContain("./");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
