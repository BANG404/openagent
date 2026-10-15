import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePluginSources } from "./prepare-plugin-sources.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "plugin-subscription-"));
  const upstream = join(root, "upstream");
  mkdirSync(upstream);
  const global = join(root, "gitconfig");
  writeFileSync(
    global,
    `[user]\nname = Fixture\nemail = fixture@example.invalid\n[url "${upstream.replaceAll("\\", "/")}"]\ninsteadOf = https://github.com/example/demo\n`,
  );
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: global,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_ALLOW_PROTOCOL: "file",
  };
  const git = (/** @type {string} */ cwd, /** @type {string[]} */ args) =>
    execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  git(upstream, ["init", "--initial-branch=main"]);
  const commit = (/** @type {string} */ version) => {
    writeFileSync(join(upstream, "plugin.json"), JSON.stringify({ name: "demo", version }));
    git(upstream, ["add", "."]);
    git(upstream, ["commit", "-m", `feat: ${version}`]);
    return git(upstream, ["rev-parse", "HEAD"]);
  };
  commit("1.0.0");
  const plugins = join(root, "plugins");
  mkdirSync(plugins);
  const indexFile = join(plugins, "dev-index.json");
  writeFileSync(
    indexFile,
    JSON.stringify({
      demo: { path: "demo", repository: "https://github.com/example/demo", branch: "main" },
    }),
  );
  return {
    root,
    upstream,
    git,
    commit,
    directory: join(plugins, "demo"),
    options: { indexFile, env },
  };
}

test("follows main without a parent commit and preserves edits, feature branches and local commits", () => {
  const f = fixture();
  try {
    const index = readFileSync(f.options.indexFile);
    expect(preparePluginSources(f.options)[0].version).toBe("1.0.0");
    const next = f.commit("1.1.0");
    expect(preparePluginSources({ ...f.options, update: true })[0]).toMatchObject({
      revision: next,
      version: "1.1.0",
      status: "current",
    });
    expect(readFileSync(f.options.indexFile)).toEqual(index);
    f.git(f.directory, ["switch", "--detach"]);
    f.commit("1.2.0");
    expect(preparePluginSources({ ...f.options, update: true })[0].version).toBe("1.2.0");
    expect(f.git(f.directory, ["branch", "--show-current"])).toBe("main");
    writeFileSync(join(f.directory, "untracked"), "developer bytes");
    f.commit("1.3.0");
    expect(preparePluginSources({ ...f.options, update: true })[0]).toMatchObject({
      version: "1.2.0",
      status: "preserved",
    });
    expect(readFileSync(join(f.directory, "untracked"), "utf8")).toBe("developer bytes");
    f.git(f.directory, ["add", "untracked"]);
    f.git(f.directory, ["commit", "-m", "fix: local work"]);
    const local = f.git(f.directory, ["rev-parse", "HEAD"]);
    expect(preparePluginSources({ ...f.options, update: true })[0].revision).toBe(local);
    f.git(f.directory, ["switch", "--detach", next]);
    expect(preparePluginSources({ ...f.options, update: true })[0]).toMatchObject({
      revision: next,
      branch: "",
      status: "preserved",
    });
    expect(f.git(f.directory, ["rev-parse", "main"])).toBe(local);
    f.git(f.directory, ["switch", "-c", "feature"]);
    expect(preparePluginSources({ ...f.options, update: true })[0].status).toBe("preserved");
    expect(f.git(f.directory, ["branch", "--show-current"])).toBe("feature");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}, 60_000);

test("rejects a changed origin and linked destinations without touching their contents", () => {
  const f = fixture();
  try {
    preparePluginSources(f.options);
    f.git(f.directory, ["remote", "set-url", "origin", "https://github.com/foreign/demo"]);
    expect(() => preparePluginSources({ ...f.options, update: true })).toThrow(
      "origin does not match",
    );
    const root = join(f.root, "linked");
    mkdirSync(root);
    symlinkSync(f.upstream, join(root, "demo"), process.platform === "win32" ? "junction" : "dir");
    writeFileSync(join(root, "dev-index.json"), readFileSync(f.options.indexFile));
    expect(() =>
      preparePluginSources({ ...f.options, indexFile: join(root, "dev-index.json") }),
    ).toThrow("link");
    expect(f.git(f.upstream, ["status", "--porcelain"])).toBe("");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}, 60_000);
