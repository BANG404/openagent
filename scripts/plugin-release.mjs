import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLatestReleaseTag, getNextReleaseVersion } from "./release-version.mjs";

/** @param {string[]} commits */
export function pluginReleaseBump(commits) {
  if (
    commits.some(
      (body) => /^[a-z]+(?:\([^\n]*\))?!:/m.test(body) || /^BREAKING CHANGE:/m.test(body),
    )
  )
    return "major";
  if (commits.some((body) => /^feat(?:\([^\n]*\))?:/m.test(body))) return "minor";
  if (commits.some((body) => /^(?:fix|perf)(?:\([^\n]*\))?:/m.test(body))) return "patch";
  return "none";
}

/** @param {{version: string, tags: string[], commits: string[], sameSource: boolean}} input */
export function planPluginRelease({ version, tags, commits, sameSource }) {
  const latest = getLatestReleaseTag(tags.map((tag) => tag.replace(/^plugin-v/, "v")));
  const base = latest ? latest.slice(1) : version;
  const bump = pluginReleaseBump(commits);
  if (sameSource) return { version: base, publish: false };
  return {
    version: latest
      ? getNextReleaseVersion(base, bump === "none" ? "patch" : bump, "stable").version
      : version,
    publish: true,
  };
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

/** @param {{root: string, output: string, publish: boolean}} options */
export function releasePinnedPlugins({ root, output, publish }) {
  const index = JSON.parse(readFileSync(join(root, "plugins/dev-index.json"), "utf8"));
  const protocolSource = readFileSync(join(root, "sdk/rust/openagent-protocol/src/lib.rs"), "utf8");
  const protocol = Number(/PLUGIN_PROTOCOL_VERSION:\s*u32\s*=\s*(\d+)/.exec(protocolSource)?.[1]);
  if (!Number.isInteger(protocol) || protocol < 1)
    throw new Error("Missing pinned plugin protocol version");
  mkdirSync(output, { recursive: true });
  const results = [];
  for (const [id, relative] of Object.entries(index)) {
    if (typeof relative !== "string" || !/^[a-z0-9-]+$/.test(relative))
      throw new Error("Invalid pinned plugin path");
    const directory = join(root, "plugins", relative);
    const sha = git(root, ["rev-parse", `HEAD:plugins/${relative}`]);
    if (git(directory, ["rev-parse", "HEAD"]) !== sha || git(directory, ["status", "--porcelain"]))
      throw new Error(`Plugin ${id} is not the clean pinned source`);
    const manifest = JSON.parse(git(directory, ["show", `${sha}:plugin.json`]));
    const repository = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/.exec(manifest.repository)?.[1];
    if (manifest.name !== id || !repository || !/^\d+\.\d+\.\d+$/.test(manifest.version))
      throw new Error(`Invalid release identity for ${id}`);
    const range = manifest.extensions?.openagent?.compatibility?.plugin_protocol ?? {
      min: 1,
      max: 1,
    };
    if (
      !Number.isInteger(range.min) ||
      !Number.isInteger(range.max) ||
      range.min < 1 ||
      range.min > range.max ||
      protocol < range.min ||
      protocol > range.max
    )
      throw new Error(`Plugin ${id} does not support protocol ${protocol}`);
    const tags = git(directory, ["tag", "--merged", sha]).split(/\r?\n/).filter(Boolean);
    // Releasing an older pinned source must not collide with a newer release
    // from another Runtime channel. Check all immutable tags for version space,
    // but derive the source diff from this commit's newest ancestor release.
    const allTags = git(directory, ["tag", "--list"]).split(/\r?\n/).filter(Boolean);
    const latest = getLatestReleaseTag(tags.map((tag) => tag.replace(/^plugin-v/, "v")));
    const previous = tags.find((tag) => tag.replace(/^plugin-v/, "v") === latest);
    const commits = git(directory, [
      "log",
      "--format=%B%x00",
      previous ? `${previous}..${sha}` : sha,
    ]).split("\0");
    const plan = planPluginRelease({
      version: manifest.version,
      tags: allTags,
      commits,
      sameSource: Boolean(previous && git(directory, ["rev-list", "-n", "1", previous]) === sha),
    });
    if (!plan.publish && previous) plan.version = latest.slice(1);
    const tag = previous && !plan.publish ? previous : `plugin-v${plan.version}`;
    results.push({
      id,
      repository,
      source_sha: sha,
      version: plan.version,
      tag,
      plugin_protocol: range,
      publish: plan.publish,
    });
    const packageDirectory = join(output, id);
    mkdirSync(packageDirectory, { recursive: true });
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
    tar(["-xf", sourceArchive, "-C", packageDirectory]);
    manifest.version = plan.version;
    manifest.extensions ??= {};
    manifest.extensions.openagent ??= {};
    manifest.extensions.openagent.compatibility ??= { plugin_protocol: range };
    writeFileSync(join(packageDirectory, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const archive = join(output, `${id}-${plan.version}.tar.gz`);
    const deterministic =
      process.platform === "win32"
        ? []
        : ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner"];
    // Do not emit a bare './' root member: the portable loader rejects empty
    // archive paths. Members are package-relative and plugin.json is at root.
    tar([
      ...deterministic,
      "-czf",
      archive,
      "-C",
      packageDirectory,
      "--",
      ...readdirSync(packageDirectory),
    ]);
    const metadata = { schema_version: 1, source_sha: sha, plugin_protocol: range };
    const notes = join(output, `${id}-notes.md`);
    writeFileSync(
      notes,
      `Verified OpenAgent standard package from ${sha}.\n\n<!-- openagent-plugin ${JSON.stringify(metadata)} -->\n`,
    );
    if (publish && plan.publish) {
      // Immutable automation tags avoid the package's manually versioned v*
      // workflow. Retries verify ownership rather than replacing release bytes.
      const releases = JSON.parse(gh(["api", `repos/${repository}/releases?per_page=100`]));
      const existing = releases.find(
        (/** @type {{tag_name: string}} */ item) => item.tag_name === tag,
      );
      if (existing) {
        if (!existing.body?.includes(`"source_sha":"${sha}"`))
          throw new Error(`Release ${repository}/${tag} belongs to different source`);
      } else {
        gh([
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
      }
    }
  }
  writeFileSync(
    join(output, "openagent-plugin-releases.json"),
    `${JSON.stringify({ schema_version: 1, plugin_protocol: protocol, plugins: results }, null, 2)}\n`,
  );
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[process.argv.indexOf("--output") + 1];
  if (!process.argv.includes("--output") || !output)
    throw new Error("Usage: plugin-release.mjs --output <directory> [--publish]");
  releasePinnedPlugins({
    root: resolve("."),
    output: resolve(output),
    publish: process.argv.includes("--publish"),
  });
}
