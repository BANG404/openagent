import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLatestReleaseTag } from "./release-version.mjs";

const stableVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

/**
 * Source manifests own release versions. Tags are immutable ownership evidence,
 * including automation tags produced before source-owned versioning.
 * @param {{version: string, sourceSha: string, tags: {tag: string, sourceSha: string}[]}} input
 */
export function planPluginRelease({ version, sourceSha, tags }) {
  if (!stableVersion.test(version)) throw new Error(`Invalid stable plugin version: ${version}`);
  const releases = tags.filter(
    ({ tag }) =>
      /^(?:plugin-)?v/.test(tag) && stableVersion.test(tag.replace(/^(?:plugin-)?v/, "")),
  );
  const matching = releases.filter(
    ({ tag }) => tag === `v${version}` || tag === `plugin-v${version}`,
  );
  if (matching.some((release) => release.sourceSha !== sourceSha)) {
    throw new Error(
      `Plugin version ${version} already belongs to different source; bump plugin.json`,
    );
  }
  if (matching.length) {
    const existing = matching.find(({ tag }) => tag === `v${version}`) ?? matching[0];
    return { version, tag: existing.tag, publish: false };
  }
  const latest = getLatestReleaseTag(releases.map(({ tag }) => tag.replace(/^plugin-v/, "v")));
  if (latest && getLatestReleaseTag([latest, `v${version}`]) !== `v${version}`) {
    throw new Error(
      `Plugin source version ${version} must exceed ${latest.slice(1)}; bump plugin.json`,
    );
  }
  return { version, tag: `plugin-v${version}`, publish: true };
}

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

/** @param {string[]} args */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

/** @param {string[]} args */
function tar(args) {
  // Git's GNU tar interprets Windows drive prefixes as remote hosts.
  const executable =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe")
      : "tar";
  return execFileSync(executable, args);
}

/** @param {unknown} compatibility @param {string} id */
export function pluginProtocolRange(compatibility, id) {
  if (compatibility === undefined) return { min: 1, max: 1 };
  if (
    !compatibility ||
    typeof compatibility !== "object" ||
    Array.isArray(compatibility) ||
    Object.keys(compatibility).length !== 1 ||
    !Object.hasOwn(compatibility, "plugin_protocol")
  )
    throw new Error(`Invalid plugin compatibility for ${id}`);
  const range = /** @type {Record<string, unknown>} */ (compatibility).plugin_protocol;
  if (
    !range ||
    typeof range !== "object" ||
    Array.isArray(range) ||
    Object.keys(range).length !== 2
  )
    throw new Error(`Invalid plugin protocol range for ${id}`);
  const { min, max } = /** @type {Record<string, unknown>} */ (range);
  if (
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 1 ||
    min > max ||
    max > 0xffffffff
  )
    throw new Error(`Invalid plugin protocol range for ${id}`);
  return { min, max };
}

/** @param {string} root @param {string} [base] @param {string} [hostRevision] */
export function verifyPinnedPluginVersions(root, base, hostRevision = "HEAD") {
  const index = JSON.parse(readFileSync(join(root, "plugins/dev-index.json"), "utf8"));
  if (!index || typeof index !== "object" || Array.isArray(index) || !Object.keys(index).length)
    throw new Error("Invalid pinned plugin index");
  return Object.entries(index).map(([id, relative]) => {
    if (!/^[a-z0-9-]+$/.test(id) || typeof relative !== "string" || !/^[a-z0-9-]+$/.test(relative))
      throw new Error("Invalid pinned plugin path");
    const directory = join(root, "plugins", relative);
    const revision =
      hostRevision === "INDEX" ? `:plugins/${relative}` : `${hostRevision}:plugins/${relative}`;
    const sha = git(root, ["rev-parse", revision]);
    if (git(directory, ["rev-parse", "HEAD"]) !== sha || git(directory, ["status", "--porcelain"]))
      throw new Error(`Plugin ${id} is not the clean pinned source`);
    const manifest = JSON.parse(git(directory, ["show", `${sha}:plugin.json`]));
    const repository = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/.exec(manifest.repository)?.[1];
    if (manifest.name !== id || !repository || !stableVersion.test(manifest.version))
      throw new Error(`Invalid release identity for ${id}`);
    const range = pluginProtocolRange(manifest.extensions?.openagent?.compatibility, id);
    const tags = git(directory, ["tag", "--list"])
      .split(/\r?\n/)
      .filter(
        (tag) =>
          /^(?:plugin-)?v/.test(tag) && stableVersion.test(tag.replace(/^(?:plugin-)?v/, "")),
      );
    const plan = planPluginRelease({
      version: manifest.version,
      sourceSha: sha,
      tags: tags.map((tag) => ({
        tag,
        sourceSha: git(directory, ["rev-parse", `${tag}^{commit}`]),
      })),
    });
    if (base) {
      const previous = /^160000 commit ([a-f0-9]+)\t/.exec(
        git(root, ["ls-tree", base, "--", `plugins/${relative}`]),
      );
      if (previous && previous[1] !== sha) {
        const oldManifest = JSON.parse(git(directory, ["show", `${previous[1]}:plugin.json`]));
        if (
          !stableVersion.test(oldManifest.version) ||
          oldManifest.version === manifest.version ||
          getLatestReleaseTag([`v${oldManifest.version}`, `v${manifest.version}`]) !==
            `v${manifest.version}`
        )
          throw new Error(
            `Plugin ${id} changed source without advancing version ${oldManifest.version}; bump plugin.json`,
          );
      }
    }
    return { id, directory, sha, manifest, repository, plan, range };
  });
}

/** @param {{root: string, output: string, publish: boolean, runGh?: typeof gh}} options */
export function releasePinnedPlugins({ root, output, publish, runGh = gh }) {
  const packages = verifyPinnedPluginVersions(root);
  const runtimeSourceSha = git(join(root, "sdk"), ["rev-parse", "HEAD"]);
  const protocolSource = readFileSync(join(root, "sdk/rust/openagent-protocol/src/lib.rs"), "utf8");
  const protocol = Number(/PLUGIN_PROTOCOL_VERSION:\s*u32\s*=\s*(\d+)/.exec(protocolSource)?.[1]);
  if (!Number.isInteger(protocol) || protocol < 1)
    throw new Error("Missing pinned plugin protocol version");
  mkdirSync(output, { recursive: true });
  const results = [];
  for (const { id, directory, sha, repository, plan, range } of packages) {
    if (protocol < range.min || protocol > range.max)
      throw new Error(`Plugin ${id} does not support protocol ${protocol}`);
    const tag = plan.tag;
    results.push({
      id,
      repository,
      source_sha: sha,
      version: plan.version,
      tag,
      plugin_protocol: range,
      publish: plan.publish,
    });
    const packageDirectory = mkdtempSync(join(output, `${id}-source-`));
    const sourceArchive = join(output, `${id}-source.tar`);
    execFileSync("git", [
      "-C",
      directory,
      "archive",
      "--format=tar",
      "--output",
      sourceArchive,
      sha,
    ]);
    const archive = join(output, `${id}-${plan.version}.tar.gz`);
    const deterministic =
      process.platform === "win32"
        ? []
        : ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner"];
    // Do not emit a bare './' root member: the portable loader rejects empty
    // archive paths. Members are package-relative and plugin.json is at root.
    try {
      tar(["-xf", sourceArchive, "-C", packageDirectory]);
      tar([
        ...deterministic,
        "-czf",
        archive,
        "-C",
        packageDirectory,
        "--",
        ...readdirSync(packageDirectory),
      ]);
    } finally {
      // This directory was allocated by this invocation, never a prior stage.
      rmSync(packageDirectory, { recursive: true, force: true });
    }
    const metadata = { schema_version: 1, source_sha: sha, plugin_protocol: range };
    const notes = join(output, `${id}-notes.md`);
    writeFileSync(
      notes,
      `Verified OpenAgent standard package from ${sha}.\n\n<!-- openagent-plugin ${JSON.stringify(metadata)} -->\n`,
    );
    if (publish) {
      // Immutable automation tags avoid the package's manually versioned v*
      // workflow. Retries verify ownership rather than replacing release bytes.
      const releases = JSON.parse(
        runGh(["api", "--paginate", "--slurp", `repos/${repository}/releases?per_page=100`]),
      ).flat();
      const existing = releases.find(
        (/** @type {{tag_name: string}} */ item) => item.tag_name === tag,
      );
      if (existing) {
        verifyPublishedPlugin({ repository, tag, sha, range, existing, runGh });
      } else {
        runGh([
          "release",
          "create",
          tag,
          archive,
          "--repo",
          repository,
          "--target",
          sha,
          "--title",
          `${id} ${plan.version}`,
          "--notes-file",
          notes,
        ]);
        const created = JSON.parse(runGh(["api", `repos/${repository}/releases/tags/${tag}`]));
        verifyPublishedPlugin({ repository, tag, sha, range, existing: created, runGh });
      }
    }
  }
  writeFileSync(
    join(output, "openagent-plugin-releases.json"),
    `${JSON.stringify({ schema_version: 1, runtime_source_sha: runtimeSourceSha, plugin_protocol: protocol, plugins: results }, null, 2)}\n`,
  );
  return results;
}

/**
 * A tag alone is not an installable release. Verify its immutable remote source
 * and an archive digest; manual v* releases need not contain automation notes.
 * @param {{repository: string, tag: string, sha: string, range: {min: number, max: number}, existing: {draft?: boolean, prerelease?: boolean, body?: string, assets?: {name: string, digest?: string}[]}, runGh: typeof gh}} input
 */
function verifyPublishedPlugin({ repository, tag, sha, range, existing, runGh }) {
  if (
    existing.draft ||
    existing.prerelease ||
    !existing.assets?.some(
      (asset) =>
        /\.(?:zip|tar\.gz|tgz)$/.test(asset.name) &&
        /^sha256:[a-f0-9]{64}$/.test(asset.digest ?? ""),
    )
  )
    throw new Error(`Release ${repository}/${tag} has no verified stable plugin archive`);
  let object = JSON.parse(runGh(["api", `repos/${repository}/git/ref/tags/${tag}`])).object;
  for (let depth = 0; object.type === "tag" && depth < 8; depth++) {
    object = JSON.parse(runGh(["api", `repos/${repository}/git/tags/${object.sha}`])).object;
  }
  if (object.type !== "commit" || object.sha !== sha)
    throw new Error(`Release ${repository}/${tag} belongs to different source`);
  const marker = /<!-- openagent-plugin (.*?) -->/.exec(existing.body ?? "");
  if (marker) {
    const metadata = JSON.parse(marker[1]);
    if (
      metadata.source_sha !== sha ||
      metadata.plugin_protocol?.min !== range.min ||
      metadata.plugin_protocol?.max !== range.max
    )
      throw new Error(`Release ${repository}/${tag} has mismatched plugin compatibility metadata`);
  } else if (tag.startsWith("plugin-v")) {
    throw new Error(`Release ${repository}/${tag} is missing plugin compatibility metadata`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--verify")) {
    const baseIndex = process.argv.indexOf("--base");
    const base = baseIndex < 0 ? undefined : process.argv[baseIndex + 1];
    if (baseIndex >= 0 && !base) throw new Error("--base requires an immutable host revision");
    console.log(
      JSON.stringify(
        verifyPinnedPluginVersions(resolve("."), base, "INDEX").map(({ id, sha, plan }) => ({
          id,
          source_sha: sha,
          ...plan,
        })),
        null,
        2,
      ),
    );
  } else {
    const output = process.argv[process.argv.indexOf("--output") + 1];
    if (!process.argv.includes("--output") || !output)
      throw new Error("Usage: plugin-release.mjs --verify | --output <directory> [--publish]");
    releasePinnedPlugins({
      root: resolve("."),
      output: resolve(output),
      publish: process.argv.includes("--publish"),
    });
  }
}
