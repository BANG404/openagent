import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activeExecutablePaths,
  cleanDevelopmentTargets,
  cleanDevelopmentRuntimeImages,
  registerDevelopmentTarget,
  withDevelopmentRuntimeCache,
} from "./development-cache.mjs";
import { defaultTauriDevTargetRoot, resolveTauriDevTargetDirectory } from "./tauri-dev-target.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "openagent-cache-test-"));
  const repositoryRoot = path.join(root, "repo");
  await mkdir(repositoryRoot);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repositoryRoot });
  const targetRoot = path.join(root, "targets");
  await mkdir(targetRoot);
  return {
    root,
    repositoryRoot,
    targetRoot,
    common: path.join(repositoryRoot, ".git").toLowerCase(),
  };
}

/** @param {string} directory */
const exists = (directory) =>
  access(directory).then(
    () => true,
    () => false,
  );

test.skipIf(process.platform !== "win32")(
  "Windows process discovery protects the running executable",
  () => {
    const paths = activeExecutablePaths().map((file) => path.normalize(file).toLowerCase());
    expect(paths).toContain(path.normalize(process.execPath).toLowerCase());
  },
);

test("collects owned orphan targets while protecting live processes, ordinary targets and foreign caches", async () => {
  const f = await fixture();
  const previousRoot = process.env.OPENAGENT_DEV_TARGET_ROOT;
  process.env.OPENAGENT_DEV_TARGET_ROOT = f.targetRoot;
  try {
    const common = process.platform === "win32" ? f.common : path.join(f.repositoryRoot, ".git");
    const ordinary = resolveTauriDevTargetDirectory(f.repositoryRoot, {
      environment: { ...process.env, OPENAGENT_HOME: undefined },
    });
    await registerDevelopmentTarget(ordinary, f.repositoryRoot);
    for (const [name, values] of Object.entries({
      orphan: {},
      live: { pid: process.pid },
      executable: {},
      recent: { repository: f.repositoryRoot, lastUsed: Date.now() },
      idle: { repository: f.repositoryRoot },
      foreign: { common: "different-repo" },
    })) {
      const directory = path.join(f.targetRoot, name);
      await mkdir(directory);
      await writeFile(
        path.join(directory, ".openagent-dev-cache.json"),
        JSON.stringify({
          version: 1,
          common,
          repository: path.join(f.root, "removed-worktree"),
          lastUsed: 1,
          pid: 0,
          ...values,
        }),
      );
    }
    const options = {
      repositoryRoot: f.repositoryRoot,
      root: f.targetRoot,
      activePaths: [path.join(f.targetRoot, "executable", "debug", "openagent.exe")],
    };
    const preview = await cleanDevelopmentTargets(options);
    expect(preview.map((row) => path.basename(row.path)).sort()).toEqual(["idle", "orphan"]);
    expect(await exists(path.join(f.targetRoot, "orphan"))).toBe(true);
    const applied = await cleanDevelopmentTargets({ ...options, apply: true });
    expect(applied.every((row) => row.removed)).toBe(true);
    expect(await exists(path.join(f.targetRoot, "orphan"))).toBe(false);
    expect(await exists(ordinary)).toBe(true);
    for (const name of ["live", "executable", "recent", "foreign"])
      expect(await exists(path.join(f.targetRoot, name))).toBe(true);
  } finally {
    if (previousRoot === undefined) delete process.env.OPENAGENT_DEV_TARGET_ROOT;
    else process.env.OPENAGENT_DEV_TARGET_ROOT = previousRoot;
    await rm(f.root, { recursive: true, force: true });
  }
});

test("rejects cache-root and candidate junctions without touching their destinations", async () => {
  const f = await fixture();
  try {
    const outside = path.join(f.root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "keep"), "user data");
    const link = path.join(f.targetRoot, "junction");
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    expect(
      await cleanDevelopmentTargets({
        repositoryRoot: f.repositoryRoot,
        root: f.targetRoot,
        apply: true,
        activePaths: [],
      }),
    ).toEqual([]);
    expect(
      await cleanDevelopmentTargets({
        repositoryRoot: f.repositoryRoot,
        root: link,
        apply: true,
        activePaths: [],
      }),
    ).toEqual([]);
    expect(await readFile(path.join(outside, "keep"), "utf8")).toBe("user data");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Runtime collection retains the newest three, current selection and active images", async () => {
  const f = await fixture();
  try {
    const targetTriple = "fixture-target";
    const root = path.join(f.repositoryRoot, ".cache", "development-runtime", targetTriple);
    const destination = path.join(f.root, "server");
    const digests = Array.from({ length: 7 }, (_, index) => index.toString(16).repeat(64));
    for (let index = 0; index < digests.length; index++) {
      const directory = path.join(root, digests[index]);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "server.exe"), "cached");
      await utimes(directory, new Date(index * 1000), new Date(index * 1000));
    }
    await writeFile(
      `${destination}.selection.json`,
      JSON.stringify({ schema_version: 1, sha256: digests[0] }),
    );
    const options = {
      repositoryRoot: f.repositoryRoot,
      targetTriple,
      destination,
      activePaths: [path.join(root, digests[1], "server.exe")],
    };
    const preview = await cleanDevelopmentRuntimeImages(options);
    expect(preview.map((row) => path.basename(row.path)).sort()).toEqual([digests[2], digests[3]]);
    const applied = await cleanDevelopmentRuntimeImages({ ...options, apply: true });
    expect(applied.length).toBe(2);
    for (const index of [0, 1, 4, 5, 6])
      expect(await exists(path.join(root, digests[index]))).toBe(true);
    expect(await exists(path.join(root, digests[2]))).toBe(false);
    // Missing selection fails closed.
    await rm(`${destination}.selection.json`);
    await expect(cleanDevelopmentRuntimeImages(options)).rejects.toThrow("selected Runtime");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Runtime collector cannot race an in-progress stage", async () => {
  const f = await fixture();
  try {
    await withDevelopmentRuntimeCache(f.repositoryRoot, "fixture-target", async () => {
      expect(
        await cleanDevelopmentRuntimeImages({
          repositoryRoot: f.repositoryRoot,
          targetTriple: "fixture-target",
          destination: path.join(f.root, "server"),
          apply: true,
          activePaths: [],
        }),
      ).toEqual([]);
    });
    await expect(
      withDevelopmentRuntimeCache(f.repositoryRoot, "../escape", async () => 1),
    ).rejects.toThrow("target triple");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform !== "win32")(
  "legacy collection is explicit, recognizes Cargo output and preserves existing source checkouts",
  async () => {
    const f = await fixture();
    const previousLocal = process.env.LOCALAPPDATA;
    const previousRoot = process.env.OPENAGENT_DEV_TARGET_ROOT;
    process.env.LOCALAPPDATA = path.join(f.root, "local");
    delete process.env.OPENAGENT_DEV_TARGET_ROOT;
    try {
      const root = defaultTauriDevTargetRoot();
      const names = [
        "repo-removed-0123456789abcdef",
        "repo-existing-0123456789abcdef",
        "repo-unrecognized-0123456789abcdef",
      ];
      for (const name of names) {
        const directory = path.join(root, name);
        await mkdir(directory, { recursive: true });
        if (!name.includes("unrecognized"))
          await writeFile(
            path.join(directory, "CACHEDIR.TAG"),
            "Signature: 8a477f597d28d172789f06886806bc55\n",
          );
      }
      await mkdir(path.join(f.root, "repo-existing"));
      const options = { repositoryRoot: f.repositoryRoot, root, activePaths: [] };
      expect(await cleanDevelopmentTargets(options)).toEqual([]);
      const preview = await cleanDevelopmentTargets({ ...options, includeLegacy: true });
      expect(preview.map((row) => path.basename(row.path))).toEqual([names[0]]);
      await cleanDevelopmentTargets({ ...options, includeLegacy: true, apply: true });
      expect(await exists(path.join(root, names[0]))).toBe(false);
      expect(await exists(path.join(root, names[1]))).toBe(true);
      expect(await exists(path.join(root, names[2]))).toBe(true);
    } finally {
      if (previousLocal === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocal;
      if (previousRoot === undefined) delete process.env.OPENAGENT_DEV_TARGET_ROOT;
      else process.env.OPENAGENT_DEV_TARGET_ROOT = previousRoot;
      await rm(f.root, { recursive: true, force: true });
    }
  },
);
