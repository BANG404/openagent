import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  planPluginRelease,
  pluginProtocolRange,
  releasePlugins,
  verifyPluginSources,
} from "./plugin-release.mjs";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(30_000);

/** @param {string} cwd @param {string[]} args */
const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const tar =
  process.platform === "win32"
    ? join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe")
    : "tar";

/** @param {string} directory */
function initializeFixtureRepository(directory) {
  git(directory, ["init", "--initial-branch=main"]);
  appendFileSync(
    join(directory, ".git", "config"),
    "\n[user]\n\tname = Plugin test\n\temail = plugin-test@example.invalid\n[core]\n\tautocrlf = false\n",
  );
}

/** @param {string} output @param {string} version */
function unpack(output, version) {
  const directory = join(output, "unpacked");
  mkdirSync(directory, { recursive: true });
  execFileSync(tar, ["-xf", join(output, `demo-${version}.tar.gz`), "-C", directory]);
  return directory;
}

/** @param {(fixture: ReturnType<typeof fixtureSource>) => void} run */
function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "openagent-plugin-publication-"));
  try {
    cpSync(fixtureTemplateRoot, root, { recursive: true });
    run(fixtureSource(root, fixtureTemplate));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * @param {string} root
 * @param {{ initial: string, base: string } | undefined} [prepared]
 */
function fixtureSource(root, prepared) {
  const source = join(root, "plugins", "demo");
  mkdirSync(source, { recursive: true });
  if (!prepared) for (const directory of [root, source]) initializeFixtureRepository(directory);
  const manifest = {
    name: "demo",
    version: "1.0.0",
    repository: "https://github.com/example/demo",
    extensions: { openagent: { compatibility: { plugin_protocol: { min: 1, max: 1 } } } },
  };
  /** @param {string} message */
  const commitSource = (message) => {
    writeFileSync(join(source, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    git(source, ["add", "."]);
    git(source, ["commit", "-m", message]);
    return git(source, ["rev-parse", "HEAD"]);
  };
  const initial = prepared?.initial ?? commitSource("feat: initial package");
  const protocolFile = join(root, "runtime/rust/openagent-protocol/src/lib.rs");
  const sdk = join(root, "runtime");
  if (!prepared) {
    git(source, ["tag", "v1.0.0"]);
    writeFileSync(
      join(root, "plugins", "dev-index.json"),
      JSON.stringify({
        demo: {
          path: "demo",
          repository: "https://github.com/example/demo",
          branch: "main",
        },
      }),
    );
    mkdirSync(join(root, "runtime/rust/openagent-protocol/src"), { recursive: true });
    writeFileSync(protocolFile, "pub const PLUGIN_PROTOCOL_VERSION: u32 = 1;");
    initializeFixtureRepository(sdk);
    git(sdk, ["add", "."]);
    git(sdk, ["commit", "-m", "feat: protocol"]);
  }
  /** @param {string} _sha */
  const checkpoint = (_sha) => {
    git(root, ["add", "plugins/dev-index.json", "runtime"]);

    git(root, ["commit", "--allow-empty", "-m", "feat: checkpoint package"]);
    return git(root, ["rev-parse", "HEAD"]);
  };
  const base = prepared?.base ?? checkpoint(initial);
  const output = join(root, "candidates");
  return { root, source, manifest, initial, base, output, protocolFile, commitSource, checkpoint };
}

// Copy a committed seed into each independent test root. This preserves real
// Git repositories while keeping their repeated setup out of each assertion's
// default timeout budget. No test mutates the shared seed.
const fixtureTemplateRoot = mkdtempSync(join(tmpdir(), "openagent-plugin-publication-seed-"));
const fixtureTemplate = fixtureSource(fixtureTemplateRoot);
afterAll(() => rmSync(fixtureTemplateRoot, { recursive: true, force: true }));

describe("source-owned plugin release versions", () => {
  test("matches Runtime range validation without relaxing malformed declarations", () => {
    expect(pluginProtocolRange(undefined, "demo")).toEqual({ min: 1, max: 1 });
    expect(
      pluginProtocolRange(
        {
          plugin_protocol: { min: 1, max: 1 },
          features: [
            "configuration-v1",
            "plugin-oauth-v1",
            "theme-v1",
            "integration-v1",
            "conversation-observations-v1",
            "context-sessions-v1",
            "model-observations-v1",
          ],
        },
        "demo",
      ),
    ).toEqual({ min: 1, max: 1 });
    expect(pluginProtocolRange({ plugin_protocol: { min: 1, max: 2 } }, "demo")).toEqual({
      min: 1,
      max: 2,
    });
    for (const declaration of [
      null,
      {},
      { plugin_protocol: null },
      { plugin_protocol: { min: 1, max: 1 }, features: "configuration-v1" },
      { plugin_protocol: { min: 1, max: 1 }, features: ["unknown-feature"] },
      { plugin_protocol: { min: 1, max: 1 }, typo: true },
      { plugin_protocol: { min: 0, max: 1 } },
      { plugin_protocol: { min: 2, max: 1 } },
      { plugin_protocol: { min: 1, max: 4294967296 } },
      { plugin_protocol: { min: "1", max: 1 } },
      { plugin_protocol: { min: 1, max: 1, typo: true } },
    ]) {
      expect(() => pluginProtocolRange(declaration, "demo")).toThrow("Invalid plugin");
    }
  });
  test("uses the declared version without deriving a Conventional Commit bump", () => {
    expect(
      planPluginRelease({
        version: "2.4.0",
        sourceSha: "new",
        tags: [{ tag: "v1.0.0", sourceSha: "old" }],
      }),
    ).toEqual({ version: "2.4.0", tag: "plugin-v2.4.0", publish: true });
  });
  test("reuses both manual and automation tags for the exact source", () => {
    for (const tag of ["v1.2.0", "plugin-v1.2.0"]) {
      expect(
        planPluginRelease({
          version: "1.2.0",
          sourceSha: "accepted",
          tags: [
            { tag, sourceSha: "accepted" },
            { tag: "v3.0.0", sourceSha: "future" },
          ],
        }),
      ).toEqual({ version: "1.2.0", tag, publish: false });
    }
  });
  test("rejects version reuse, downgrades and conflicting tag aliases", () => {
    expect(() =>
      planPluginRelease({
        version: "1.0.0",
        sourceSha: "new",
        tags: [{ tag: "v1.0.0", sourceSha: "old" }],
      }),
    ).toThrow("different source");
    expect(() =>
      planPluginRelease({
        version: "1.1.0",
        sourceSha: "new",
        tags: [{ tag: "plugin-v1.2.0", sourceSha: "old" }],
      }),
    ).toThrow("must exceed 1.2.0");
    expect(() =>
      planPluginRelease({
        version: "1.0.0",
        sourceSha: "new",
        tags: [
          { tag: "v1.0.0", sourceSha: "new" },
          { tag: "plugin-v1.0.0", sourceSha: "old" },
        ],
      }),
    ).toThrow("different source");
    for (const version of ["01.0.0", "1.0.0-beta.1", "1.0", "1.0.0+build"]) {
      expect(() => planPluginRelease({ version, sourceSha: "new", tags: [] })).toThrow(
        "Invalid stable",
      );
    }
  });
  test("packages snapshot bytes without rewriting the source manifest or compatibility", () => {
    withFixture(({ root, source, manifest, output, commitSource, checkpoint }) => {
      manifest.version = "1.1.0";
      writeFileSync(join(source, "README.md"), "Changed standard code");
      const sha = commitSource("fix: standard package");
      checkpoint(sha);
      expect(releasePlugins({ root, output, publish: false })[0]).toMatchObject({
        version: "1.1.0",
        source_sha: sha,
        publish: true,
      });
      expect(readFileSync(join(unpack(output, manifest.version), "plugin.json"), "utf8")).toBe(
        readFileSync(join(source, "plugin.json"), "utf8"),
      );
      const members = execFileSync(tar, ["-tf", join(output, "demo-1.1.0.tar.gz")], {
        encoding: "utf8",
      })
        .trim()
        .split(/\r?\n/);
      expect(members).toContain("plugin.json");
      expect(members).not.toContain("./");
      expect(
        JSON.parse(readFileSync(join(output, "openagent-plugin-releases.json"), "utf8")).plugins[0],
      ).toMatchObject({
        version: manifest.version,
        source_sha: sha,
        plugin_protocol: { min: 1, max: 1 },
      });
      expect(
        JSON.parse(readFileSync(join(output, "openagent-plugin-releases.json"), "utf8"))
          .runtime_source_sha,
      ).toBe(git(join(root, "runtime"), ["rev-parse", "HEAD"]));
    });
  });
  test("repeated staging excludes files retained from earlier package candidates", () => {
    withFixture(({ root, output }) => {
      releasePlugins({ root, output, publish: false });
      mkdirSync(join(output, "demo"));
      writeFileSync(join(output, "demo", "stale-secret.txt"), "retained output");
      releasePlugins({ root, output, publish: false });
      const members = execFileSync(tar, ["-tf", join(output, "demo-1.0.0.tar.gz")], {
        encoding: "utf8",
      });
      expect(members).not.toContain("stale-secret.txt");
      expect(readFileSync(join(output, "demo", "stale-secret.txt"), "utf8")).toBe(
        "retained output",
      );
    });
  });
  test("source can advance without changing the parent commit or index", () => {
    withFixture(({ root, source, base, commitSource }) => {
      git(source, ["tag", "-d", "v1.0.0"]);
      writeFileSync(join(source, "README.md"), "Changed content");
      const sha = commitSource("docs: package instructions");
      expect(verifyPluginSources(root)[0].sha).toBe(sha);
      expect(git(root, ["rev-parse", "HEAD"])).toBe(base);
    });
  });
  test("accepts an advanced source version against the parent baseline", () => {
    withFixture(({ root, manifest, commitSource, checkpoint }) => {
      manifest.version = "1.0.1";
      checkpoint(commitSource("fix: package behavior"));
      expect(verifyPluginSources(root)[0].plan.version).toBe("1.0.1");
    });
  });
  test("rejects dirty source and incompatible Runtime protocols", () => {
    withFixture(({ root, source, output, protocolFile }) => {
      writeFileSync(join(source, "README.md"), "Uncommitted");
      expect(() => releasePlugins({ root, output, publish: false })).toThrow(
        "clean source checkout",
      );
      rmSync(join(source, "README.md"));
      writeFileSync(protocolFile, "pub const PLUGIN_PROTOCOL_VERSION: u32 = 2;");
      expect(() => releasePlugins({ root, output, publish: false })).toThrow(
        "does not support protocol 2",
      );
    });
  });
  test("rejects changed source without a source version bump", () => {
    withFixture(({ root, source, output, commitSource, checkpoint }) => {
      writeFileSync(join(source, "README.md"), "Changed package");
      checkpoint(commitSource("feat!: breaking change"));
      expect(() => releasePlugins({ root, output, publish: false })).toThrow("different source");
    });
  });
  test("preserves the protocol-1 default without adding a declaration to package bytes", () => {
    withFixture(({ root, manifest, output, commitSource, checkpoint }) => {
      manifest.version = "1.0.1";
      Reflect.deleteProperty(manifest, "extensions");
      checkpoint(commitSource("fix: legacy package"));
      expect(releasePlugins({ root, output, publish: false })[0].plugin_protocol).toEqual({
        min: 1,
        max: 1,
      });
      expect(
        JSON.parse(readFileSync(join(unpack(output, manifest.version), "plugin.json"), "utf8"))
          .extensions,
      ).toBeUndefined();
    });
  });
  test("verifies reusable manual releases and never creates a duplicate release", () => {
    withFixture(({ root, initial, output }) => {
      /** @type {string[][]} */
      const calls = [];
      /** @param {string[]} args */
      const runGh = (args) => {
        calls.push(args);
        if (args.includes("--slurp"))
          return JSON.stringify([
            [
              {
                tag_name: "v1.0.0",
                draft: false,
                prerelease: false,
                assets: [{ name: "demo.zip", digest: `sha256:${"a".repeat(64)}` }],
              },
            ],
          ]);
        return JSON.stringify({ object: { type: "commit", sha: initial } });
      };
      expect(releasePlugins({ root, output, publish: true, runGh })[0].tag).toBe("v1.0.0");
      expect(calls.some((args) => args.includes("create"))).toBe(false);
    });
  });
  test("publishes a fixed source version when its tag exists without a release", () => {
    withFixture(({ root, initial, output }) => {
      /** @type {string[][]} */
      const calls = [];
      /** @param {string[]} args */
      const runGh = (args) => {
        calls.push(args);
        if (args.includes("--slurp")) return "[[]]";
        if (args[0] === "release") return "";
        if (args[1].includes("/releases/tags/"))
          return JSON.stringify({
            assets: [{ name: "demo-1.0.0.tar.gz", digest: `sha256:${"a".repeat(64)}` }],
          });
        return JSON.stringify({ object: { type: "commit", sha: initial } });
      };
      releasePlugins({ root, output, publish: true, runGh });
      expect(calls.find((args) => args.includes("create"))).toContain("v1.0.0");
      expect(calls.find((args) => args.includes("create"))).toContain(initial);
    });
  });
  test.each(["digest", "source", "range", "draft", "prerelease"])(
    "rejects published release with invalid %s",
    (failure) => {
      withFixture(({ root, initial, output }) => {
        /** @param {string[]} args */
        const runGh = (args) => {
          if (args.includes("--slurp"))
            return JSON.stringify([
              [
                {
                  tag_name: "v1.0.0",
                  draft: failure === "draft",
                  prerelease: failure === "prerelease",
                  assets: [
                    {
                      name: "demo.zip",
                      digest: failure === "digest" ? null : `sha256:${"a".repeat(64)}`,
                    },
                  ],
                  body:
                    failure === "range"
                      ? `<!-- openagent-plugin ${JSON.stringify({ source_sha: initial, plugin_protocol: { min: 2, max: 2 } })} -->`
                      : "",
                },
              ],
            ]);
          return JSON.stringify({
            object: { type: "commit", sha: failure === "source" ? "wrong" : initial },
          });
        };
        expect(() => releasePlugins({ root, output, publish: true, runGh })).toThrow();
      });
    },
  );
});
