import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  getMsiVersion,
  getNextBetaNumber,
  getNextReleaseVersion,
  getLatestReleaseTag,
  getStablePromotion,
} from "./release-version.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const ci = args.has("--ci");
const verify = args.has("--verify");
const channelArg = process.argv.find((arg) => arg.startsWith("--channel="))?.split("=", 2)[1];
const promoteBetaTag = process.argv
  .find((arg) => arg.startsWith("--promote-beta="))
  ?.split("=", 2)[1];
const releaseManifestFile = ".github/release.json";
const releaseFiles = [
  releaseManifestFile,
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "CHANGELOG.md",
];
const releaseRelevantPaths = [
  "assets/**",
  "patches/**",
  "sdk",
  "src/**",
  "src-tauri/**",
  "static/**",
  "bun.lock",
  "package.json",
  "svelte.config.js",
  "tsconfig.json",
  "vite.config.js",
];
const promotionSourcePaths = [
  "assets",
  "patches",
  "sdk",
  "src",
  "src-tauri",
  "static",
  "bun.lock",
  "package.json",
  "svelte.config.js",
  "tsconfig.json",
  "vite.config.js",
];

function git(gitArgs, options = {}) {
  return execFileSync("git", gitArgs, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

function run(command, commandArgs) {
  if (dryRun) {
    console.log(`[dry-run] ${command} ${commandArgs.join(" ")}`);
    return "";
  }
  return execFileSync(command, commandArgs, { encoding: "utf8", stdio: "inherit" });
}

function getCurrentVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

function getCurrentTauriVersion() {
  return JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
}

function getCurrentBranch() {
  return git(["branch", "--show-current"]) || process.env.GITHUB_REF_NAME || "";
}

function getLatestTag() {
  const tags = git(["tag", "--list", "v[0-9]*"])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return getLatestReleaseTag(tags);
}

function tagExists(tag) {
  try {
    git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function refHasPath(reference, path) {
  try {
    git(["cat-file", "-e", `${reference}:${path}`]);
    return true;
  } catch {
    return false;
  }
}

function versionFromTag(tag) {
  if (!tag.startsWith("v")) {
    throw new Error(`Unsupported release tag: ${tag}`);
  }
  return tag.slice(1);
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function isReleaseRelevantFile(file) {
  const normalized = normalizePath(file);
  return releaseRelevantPaths.some((pattern) => {
    if (pattern.endsWith("/**")) {
      return normalized.startsWith(pattern.slice(0, -2));
    }
    return normalized === pattern;
  });
}

function getChangedFiles(commitHash) {
  return git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commitHash])
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function getReleaseRelevantCommitMessages(lastTag) {
  const sourceBase = lastTag ? git(["merge-base", lastTag, "HEAD"]) : "";
  const range = sourceBase ? `${sourceBase}..HEAD` : "HEAD";
  const hashes = git(["log", range, "--format=%H"])
    .split(/\r?\n/)
    .map((hash) => hash.trim())
    .filter(Boolean);

  return hashes
    .map((hash) => ({
      message: git(["log", "-1", "--format=%B", hash]),
      files: getChangedFiles(hash),
    }))
    .filter(({ message }) => !message.split(/\r?\n/, 1)[0].startsWith("chore: release v"))
    .filter(({ files }) => files.some(isReleaseRelevantFile))
    .map(({ message }) => message.trim())
    .filter(Boolean);
}

function parseConventionalCommit(message) {
  const [subject, ...body] = message.split(/\r?\n/);
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/);
  if (!match) {
    return null;
  }
  return {
    type: match[1],
    scope: match[2] ?? "",
    breaking: Boolean(match[3]) || body.join("\n").includes("BREAKING CHANGE:"),
    message: match[4],
  };
}

function determineBump(commits) {
  let bump = "none";
  for (const commit of commits) {
    if (!commit) continue;
    if (commit.breaking) return "major";
    if (commit.type === "feat" && bump !== "major") bump = "minor";
    if ((commit.type === "fix" || commit.type === "perf") && bump === "none") {
      bump = "patch";
    }
  }
  return bump;
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+)\.(\d+))?$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    base: `${match[1]}.${match[2]}.${match[3]}`,
    prereleaseChannel: match[4] ?? "",
    prereleaseNumber: match[5] ? Number.parseInt(match[5], 10) : null,
  };
}

function determineChannel() {
  const channel = channelArg || process.env.RELEASE_CHANNEL;
  if (channel === "test" || channel === "beta") return "beta";
  if (channel === "production" || channel === "stable") return "stable";
  throw new Error("Select a release type with --channel=beta or --channel=stable.");
}

function getNextPrereleaseNumber(baseVersion, channel, currentVersion) {
  const tags = git(["tag", "--list", `v${baseVersion}-${channel}.*`])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return getNextBetaNumber(baseVersion, tags, currentVersion);
}

function getNextRelease(currentVersion, bump, channel, migrateLegacyBetaVersion = false) {
  const initial = getNextReleaseVersion(currentVersion, bump, channel, {
    migrateLegacyBetaVersion,
  });
  const version =
    channel === "beta"
      ? getNextReleaseVersion(currentVersion, bump, channel, {
          betaNumber: getNextPrereleaseNumber(initial.baseVersion, "beta", currentVersion),
          migrateLegacyBetaVersion,
        }).version
      : initial.version;
  return { version, tag: `v${version}`, promotion: initial.promotion };
}

function assertReleaseFilesClean() {
  const dirty = git(["status", "--porcelain", "--", ...releaseFiles])
    .split(/\r?\n/)
    .filter(Boolean);
  if (dirty.length && process.env.ALLOW_DIRTY_RELEASE !== "1") {
    throw new Error(
      `Release files have uncommitted changes:\n${dirty.join(
        "\n",
      )}\nCommit or stash them first, or set ALLOW_DIRTY_RELEASE=1.`,
    );
  }
}

function updateJsonVersion(file, version) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.version = version;
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function updateTauriConfig(version, channel) {
  const file = "src-tauri/tauri.conf.json";
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.version = version;
  data.bundle.windows ??= {};
  data.bundle.windows.wix ??= {};
  data.bundle.windows.wix.version = getMsiVersion(version);
  data.plugins.updater.endpoints = [
    channel === "beta"
      ? "https://github.com/BANG404/openagent/releases/download/beta/latest.json"
      : "https://github.com/BANG404/openagent/releases/latest/download/latest.json",
  ];
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function updateCargoToml(version) {
  const file = "src-tauri/Cargo.toml";
  const content = readFileSync(file, "utf8");
  writeFileSync(file, content.replace(/^version = ".+"$/m, `version = "${version}"`));
}

function updateCargoLock(version) {
  const file = "src-tauri/Cargo.lock";
  const content = readFileSync(file, "utf8");
  const updated = content.replace(
    /(\[\[package\]\]\r?\nname = "openagent"\r?\nversion = )".+?"/,
    `$1"${version}"`,
  );
  writeFileSync(file, updated);
}

function updateReleaseManifest(version, tag, channel, sourceSha, previousTag, sourceTag = "") {
  const manifest = { ready: true, version, tag, channel, sourceSha, previousTag };
  if (sourceTag) manifest.sourceTag = sourceTag;
  writeFileSync(releaseManifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readReferenceFile(reference, file) {
  return execFileSync("git", ["show", `${reference}:${file}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertSameJsonExcept(currentFile, ignoredKeys, baselineRef) {
  const previous = JSON.parse(readReferenceFile(baselineRef, currentFile));
  const current = readJson(currentFile);
  for (const key of ignoredKeys) {
    current[key] = previous[key];
  }
  if (JSON.stringify(current) !== JSON.stringify(previous)) {
    throw new Error(`${currentFile} contains changes outside: ${ignoredKeys.join(", ")}`);
  }
}

function assertTauriConfigChange(baselineRef) {
  const file = "src-tauri/tauri.conf.json";
  const previous = JSON.parse(readReferenceFile(baselineRef, file));
  const current = readJson(file);
  current.version = previous.version;
  current.bundle.windows.wix.version = previous.bundle.windows.wix.version;
  current.plugins.updater.endpoints = previous.plugins.updater.endpoints;
  if (JSON.stringify(current) !== JSON.stringify(previous)) {
    throw new Error(
      `${file} contains changes outside version, MSI version, and updater endpoints.`,
    );
  }
}

function cargoPackageVersion(content) {
  return content.match(/^\[package\][\s\S]*?^version = "([^"]+)"$/m)?.[1] ?? "";
}

function lockfilePackageVersion(content) {
  return content.match(/\[\[package\]\]\r?\nname = "openagent"\r?\nversion = "([^"]+)"/)?.[1] ?? "";
}

function assertOnlyVersionChanged(file, versionPattern, normalizeVersion, baselineRef) {
  const previous = readReferenceFile(baselineRef, file);
  const current = readFileSync(file, "utf8");
  const previousVersion = versionPattern(previous);
  const currentVersion = versionPattern(current);
  if (!previousVersion || !currentVersion) {
    throw new Error(`Unable to locate the OpenAgent version in ${file}.`);
  }
  if (normalizeVersion(current, previousVersion) !== previous) {
    throw new Error(`${file} contains changes outside the OpenAgent version.`);
  }
}

function verifyChangelog(version) {
  const previous = readReferenceFile("HEAD^", "CHANGELOG.md");
  const current = readFileSync("CHANGELOG.md", "utf8");
  const previousRelease = previous.search(/^## \[/m);
  if (previousRelease < 0) {
    if (!current.includes(`## [${version}]`)) {
      throw new Error(`CHANGELOG.md has no section for ${version}.`);
    }
    return;
  }

  const previousPrefix = previous.slice(0, previousRelease).trimEnd();
  const previousHistory = previous.slice(previousRelease);
  if (
    !current.startsWith(`${previousPrefix}\n\n## [${version}]`) ||
    !current.endsWith(previousHistory)
  ) {
    throw new Error("CHANGELOG.md must prepend one release section without editing history.");
  }
}

function verifyPendingRelease() {
  const manifest = readJson(releaseManifestFile);
  if (manifest.ready !== true) {
    throw new Error(`${releaseManifestFile} is not marked ready.`);
  }
  if (!["beta", "stable"].includes(manifest.channel)) {
    throw new Error(`Unsupported release channel: ${manifest.channel}`);
  }
  if (manifest.tag !== `v${manifest.version}`) {
    throw new Error(`Release tag ${manifest.tag} does not match ${manifest.version}.`);
  }
  const isBeta = manifest.version.includes("-beta.");
  if ((manifest.channel === "beta") !== isBeta) {
    throw new Error(`Release channel ${manifest.channel} does not match ${manifest.version}.`);
  }
  const sourceTag = manifest.sourceTag ?? "";
  const sourceSha = manifest.sourceSha ?? "";
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error(`Release source SHA is invalid: ${sourceSha || "(missing)"}.`);
  }
  const expectedSourceSha = sourceTag
    ? git(["rev-parse", `${sourceTag}^{commit}`])
    : git(["rev-parse", "HEAD^"]);
  if (sourceSha !== expectedSourceSha) {
    throw new Error(`Release source SHA ${sourceSha} does not match ${expectedSourceSha}.`);
  }
  if (manifest.previousTag && !tagExists(manifest.previousTag)) {
    throw new Error(`Previous release tag ${manifest.previousTag} does not exist.`);
  }
  if (sourceTag) {
    if (manifest.channel !== "stable") {
      throw new Error("Only Stable releases may declare a Beta source tag.");
    }
    const sourceVersion = versionFromTag(sourceTag);
    const source = parseSemver(sourceVersion);
    if (source.prereleaseChannel !== "beta" || source.base !== manifest.version) {
      throw new Error(`Beta source ${sourceTag} cannot be promoted to ${manifest.version}.`);
    }
    if (!tagExists(sourceTag)) {
      throw new Error(`Beta source tag ${sourceTag} does not exist.`);
    }
  }

  const changed = git(["diff", "--name-only", "HEAD^", "HEAD"]).split(/\r?\n/).filter(Boolean);
  const unexpected = sourceTag ? [] : changed.filter((file) => !releaseFiles.includes(file));
  const missing = releaseFiles.filter((file) => !changed.includes(file));
  if (unexpected.length || missing.length) {
    throw new Error(
      [
        unexpected.length ? `Unexpected release files: ${unexpected.join(", ")}` : "",
        missing.length ? `Missing release files: ${missing.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (sourceTag) {
    const sourceDifferences = git([
      "diff",
      "--name-only",
      sourceTag,
      "HEAD",
      "--",
      ...promotionSourcePaths,
    ])
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => !releaseFiles.includes(normalizePath(file)));
    if (sourceDifferences.length) {
      throw new Error(
        `Stable promotion differs from ${sourceTag}: ${sourceDifferences.join(", ")}`,
      );
    }
  }

  const baselineRef = sourceTag || "HEAD^";
  assertSameJsonExcept("package.json", ["version"], baselineRef);
  assertTauriConfigChange(baselineRef);
  assertOnlyVersionChanged(
    "src-tauri/Cargo.toml",
    cargoPackageVersion,
    (content, version) => content.replace(/^version = ".+"$/m, `version = "${version}"`),
    baselineRef,
  );
  assertOnlyVersionChanged(
    "src-tauri/Cargo.lock",
    lockfilePackageVersion,
    (content, version) =>
      content.replace(
        /(\[\[package\]\]\r?\nname = "openagent"\r?\nversion = )".+?"/,
        `$1"${version}"`,
      ),
    baselineRef,
  );
  verifyChangelog(manifest.version);

  const packageVersion = readJson("package.json").version;
  const tauriConfig = readJson("src-tauri/tauri.conf.json");
  const cargoVersion = cargoPackageVersion(readFileSync("src-tauri/Cargo.toml", "utf8"));
  const lockVersion = lockfilePackageVersion(readFileSync("src-tauri/Cargo.lock", "utf8"));
  for (const [file, version] of [
    ["package.json", packageVersion],
    ["src-tauri/tauri.conf.json", tauriConfig.version],
    ["src-tauri/Cargo.toml", cargoVersion],
    ["src-tauri/Cargo.lock", lockVersion],
  ]) {
    if (version !== manifest.version) {
      throw new Error(`${file} version ${version} does not match ${manifest.version}.`);
    }
  }

  const msiVersion = tauriConfig.bundle?.windows?.wix?.version;
  const expectedMsiVersion = getMsiVersion(manifest.version);
  if (msiVersion !== expectedMsiVersion) {
    throw new Error(
      `MSI version ${msiVersion ?? "(missing)"} does not match ${expectedMsiVersion}.`,
    );
  }

  const expectedEndpoint =
    manifest.channel === "beta"
      ? "https://github.com/BANG404/openagent/releases/download/beta/latest.json"
      : "https://github.com/BANG404/openagent/releases/latest/download/latest.json";
  const endpoints = tauriConfig.plugins?.updater?.endpoints;
  if (JSON.stringify(endpoints) !== JSON.stringify([expectedEndpoint])) {
    throw new Error(`Updater endpoint does not match the ${manifest.channel} channel.`);
  }

  console.log(`release metadata: ok (${manifest.tag})`);
}

function groupCommits(commits) {
  const groups = new Map([
    ["feat", { title: "Features", items: [] }],
    ["fix", { title: "Bug Fixes", items: [] }],
    ["perf", { title: "Performance", items: [] }],
    ["refactor", { title: "Refactoring", items: [] }],
    ["docs", { title: "Documentation", items: [] }],
    ["ci", { title: "CI/CD", items: [] }],
    ["test", { title: "Testing", items: [] }],
    ["style", { title: "Styling", items: [] }],
    ["chore", { title: "Miscellaneous", items: [] }],
  ]);

  for (const commit of commits) {
    if (!commit) continue;
    const group = groups.get(commit.type);
    if (!group) continue;
    const scope = commit.scope ? `**${commit.scope}**: ` : "";
    const breaking = commit.breaking ? " **BREAKING**" : "";
    group.items.push(`- ${scope}${capitalize(commit.message)}${breaking}`);
  }

  return [...groups.values()].filter((group) => group.items.length);
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function updateChangelog(version, commits) {
  const file = "CHANGELOG.md";
  const today = new Date().toISOString().slice(0, 10);
  const groups = groupCommits(commits);
  const section = [
    `## [${version}] - ${today}`,
    "",
    ...groups.flatMap((group) => [`### ${group.title}`, ...group.items, ""]),
  ].join("\n");

  if (!existsSync(file)) {
    writeFileSync(
      file,
      `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${section}`,
    );
    return;
  }

  const content = readFileSync(file, "utf8");
  const duplicate = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m");
  if (duplicate.test(content)) {
    return;
  }

  const firstRelease = content.search(/^## \[/m);
  if (firstRelease === -1) {
    writeFileSync(file, `${content.trimEnd()}\n\n${section}\n`);
    return;
  }

  writeFileSync(
    file,
    `${content.slice(0, firstRelease).trimEnd()}\n\n${section}\n${content.slice(firstRelease)}`,
  );
}

function updatePromotionChangelog(version, prereleaseVersion) {
  const file = "CHANGELOG.md";
  const today = new Date().toISOString().slice(0, 10);
  const section = [
    `## [${version}] - ${today}`,
    "",
    "### Release",
    `- Promote \`${prereleaseVersion}\` to stable.`,
    "",
  ].join("\n");

  if (!existsSync(file)) {
    writeFileSync(
      file,
      `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${section}`,
    );
    return;
  }

  const content = readFileSync(file, "utf8");
  const duplicate = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m");
  if (duplicate.test(content)) return;

  const firstRelease = content.search(/^## \[/m);
  if (firstRelease === -1) {
    writeFileSync(file, `${content.trimEnd()}\n\n${section}`);
    return;
  }

  writeFileSync(
    file,
    `${content.slice(0, firstRelease).trimEnd()}\n\n${section}${content.slice(firstRelease)}`,
  );
}

function main() {
  if (verify) {
    verifyPendingRelease();
    return;
  }

  if (ci) {
    run("git", ["config", "user.name", "github-actions[bot]"]);
    run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  }

  const branch = getCurrentBranch();
  if (!dryRun && !branch.startsWith("release/") && !branch.startsWith("prepare/")) {
    throw new Error(
      `Release commits must be prepared on a release/* or prepare/* branch, not ${branch || "detached HEAD"}.`,
    );
  }
  const channel = determineChannel();
  if (promoteBetaTag && channel !== "stable") {
    throw new Error("--promote-beta requires --channel=stable.");
  }

  if (promoteBetaTag) {
    const promotion = getStablePromotion(
      promoteBetaTag,
      versionFromTag(promoteBetaTag).split(".").slice(0, 2).join("."),
    );
    if (!tagExists(promoteBetaTag)) {
      throw new Error(`Beta source tag ${promoteBetaTag} does not exist.`);
    }
    if (tagExists(promotion.tag)) {
      throw new Error(`Stable tag ${promotion.tag} already exists.`);
    }
    if (!dryRun) {
      git(["merge-base", "--is-ancestor", promoteBetaTag, "HEAD"]);
      const restorablePaths = promotionSourcePaths.filter(
        (path) => refHasPath("HEAD", path) || refHasPath(promoteBetaTag, path),
      );
      git([
        "restore",
        "--source",
        promoteBetaTag,
        "--staged",
        "--worktree",
        "--",
        ...restorablePaths,
      ]);
      try {
        git(["diff", "--cached", "--quiet"]);
      } catch {
        run("git", ["commit", "-m", `chore(release): restore ${promoteBetaTag} source`]);
      }
    }
  }

  const currentVersion = getCurrentVersion();
  const currentTauriVersion = getCurrentTauriVersion();
  const lastTag = promoteBetaTag || getLatestTag();
  const latestVersion = lastTag ? versionFromTag(lastTag) : currentVersion;
  const releaseBaseTag = lastTag;
  const releaseBaseVersion = latestVersion;

  const commits = promoteBetaTag
    ? []
    : getReleaseRelevantCommitMessages(releaseBaseTag).map(parseConventionalCommit).filter(Boolean);
  const bump = determineBump(commits);
  const current = parseSemver(releaseBaseVersion);
  const promotion = channel === "stable" && Boolean(current.prereleaseChannel) && bump === "none";
  const betaIncrement =
    channel === "beta" && current.prereleaseChannel === "beta" && bump === "none";
  // Older Beta bundles used the base version in Tauri, so 0.24.0-beta.7
  // would compare lower than an installed 0.24.0. Move the next Beta to the
  // following patch line once; later releases retain the full Beta version.
  const migrateLegacyBetaVersion = betaIncrement && currentTauriVersion === current.base;

  if (bump === "none" && !promotion && !betaIncrement) {
    console.log("No release-worthy Conventional Commits found.");
    return;
  }

  const { version: nextVersion, tag: nextTag } = getNextRelease(
    releaseBaseVersion,
    bump,
    channel,
    migrateLegacyBetaVersion,
  );

  console.log(`${currentVersion} -> ${nextVersion} (${bump}, ${channel})`);
  if (dryRun) return;

  try {
    git(["rev-parse", "-q", "--verify", `refs/tags/${nextTag}`]);
    throw new Error(`Tag ${nextTag} already exists.`);
  } catch (error) {
    if (!String(error.message).includes("already exists")) {
      // Missing tag is expected.
    } else {
      throw error;
    }
  }

  assertReleaseFilesClean();
  const sourceSha = git(["rev-parse", promoteBetaTag ? `${promoteBetaTag}^{commit}` : "HEAD"]);
  updateJsonVersion("package.json", nextVersion);
  updateTauriConfig(nextVersion, channel);
  updateCargoToml(nextVersion);
  updateCargoLock(nextVersion);
  updateReleaseManifest(nextVersion, nextTag, channel, sourceSha, lastTag, promoteBetaTag);
  if (promotion) {
    updatePromotionChangelog(nextVersion, currentVersion);
  } else {
    updateChangelog(nextVersion, commits);
  }

  run("git", ["add", ...releaseFiles]);
  run("git", ["commit", "-m", `chore: release ${nextTag}`]);
}

main();
