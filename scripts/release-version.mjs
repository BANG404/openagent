const releaseVersionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-(beta|rc)\.(\d+))?$/;

/**
 * Recognize the narrow retry shape that moves an unpublished prerelease marker
 * to newer source without rewriting its generated release files.
 *
 * @param {Record<string, unknown> | null} previousManifest
 * @param {Record<string, unknown>} manifest
 * @param {string[]} changedFiles
 * @param {string} releaseManifestFile
 * @returns {boolean}
 */
export function isPrereleaseReleaseRefresh(
  previousManifest,
  manifest,
  changedFiles,
  releaseManifestFile,
) {
  if (
    !previousManifest ||
    (manifest.channel !== "beta" && manifest.channel !== "rc") ||
    manifest.sourceTag ||
    previousManifest.ready !== true ||
    previousManifest.sourceTag ||
    previousManifest.sourceSha === manifest.sourceSha ||
    changedFiles.length !== 1 ||
    changedFiles[0] !== releaseManifestFile
  ) {
    return false;
  }

  const previousIdentity = { ...previousManifest, sourceSha: "" };
  const currentIdentity = { ...manifest, sourceSha: "" };
  return JSON.stringify(previousIdentity) === JSON.stringify(currentIdentity);
}

/** @deprecated Use isPrereleaseReleaseRefresh for every prerelease channel. */
export const isBetaReleaseRefresh = isPrereleaseReleaseRefresh;

/**
 * Select the highest immutable release tag by SemVer precedence. Stable tags
 * sort after RC and Beta tags for the same X.Y.Z base.
 *
 * @param {string[]} tags
 * @returns {string}
 */
export function getLatestReleaseTag(tags) {
  const parsed = [];
  for (const tag of tags) {
    const match = tag.match(/^v(\d+)\.(\d+)\.(\d+)(?:-(beta|rc)\.(\d+))?$/);
    if (!match) continue;
    parsed.push({
      tag,
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      patch: Number.parseInt(match[3], 10),
      precedence: match[4] === undefined ? 2 : match[4] === "rc" ? 1 : 0,
      prerelease: match[5] === undefined ? 0 : Number.parseInt(match[5], 10),
    });
  }

  parsed.sort((left, right) => {
    if (left.major !== right.major) return right.major - left.major;
    if (left.minor !== right.minor) return right.minor - left.minor;
    if (left.patch !== right.patch) return right.patch - left.patch;
    if (left.precedence !== right.precedence) return right.precedence - left.precedence;
    return right.prerelease - left.prerelease;
  });
  return parsed[0]?.tag ?? "";
}

/**
 * @param {string} currentVersion
 * @param {"none" | "major" | "minor" | "patch"} bump
 * @param {"beta" | "rc" | "stable"} channel
 * @param {{ prereleaseNumber?: number, migrateLegacyBetaVersion?: boolean }} [options]
 * @returns {{ version: string, baseVersion: string, promotion: boolean }}
 */
export function getNextReleaseVersion(currentVersion, bump, channel, options = {}) {
  const match = currentVersion.match(releaseVersionPattern);
  if (!match) throw new Error(`Unsupported version format: ${currentVersion}`);
  if (!["beta", "rc", "stable"].includes(channel))
    throw new Error(`Unsupported release channel: ${channel}`);

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  const currentBase = `${major}.${minor}.${patch}`;
  const prereleaseChannel = match[4] ?? "";
  const isPrerelease = Boolean(prereleaseChannel);
  const promotion =
    bump === "none" &&
    ((channel === "rc" && prereleaseChannel === "beta") ||
      (channel === "stable" && prereleaseChannel === "rc"));
  if (promotion) {
    return {
      version:
        channel === "rc" ? `${currentBase}-rc.${options.prereleaseNumber ?? 1}` : currentBase,
      baseVersion: currentBase,
      promotion: true,
    };
  }
  if (bump === "none" && !isPrerelease)
    throw new Error("A stable version requires a release-worthy bump.");

  let baseVersion;
  if (isPrerelease && bump === "none" && !options.migrateLegacyBetaVersion) {
    baseVersion = currentBase;
  } else {
    const effectiveBump = isPrerelease && bump === "none" ? "patch" : bump;
    if (effectiveBump === "major") baseVersion = `${major + 1}.0.0`;
    else if (effectiveBump === "minor") baseVersion = `${major}.${minor + 1}.0`;
    else if (effectiveBump === "patch") baseVersion = `${major}.${minor}.${patch + 1}`;
    else throw new Error(`Unsupported release bump: ${bump}`);
  }
  const version =
    channel === "stable"
      ? baseVersion
      : `${baseVersion}-${channel}.${options.prereleaseNumber ?? 1}`;
  return { version, baseVersion, promotion: false };
}

/** @param {string} baseVersion @param {string[]} tags @param {string} currentVersion */
export function getNextBetaNumber(baseVersion, tags, currentVersion) {
  return getNextPrereleaseNumber(baseVersion, "beta", tags, currentVersion);
}

/** @param {string} baseVersion @param {"beta" | "rc"} channel @param {string[]} tags @param {string} currentVersion */
export function getNextPrereleaseNumber(baseVersion, channel, tags, currentVersion) {
  const escapedBase = baseVersion.replaceAll(".", "\\.");
  const matcher = new RegExp(`^v?${escapedBase}-${channel}\\.(\\d+)$`);
  const numbers = [...tags, currentVersion]
    .map((value) => value.match(matcher)?.[1])
    .filter((value) => value !== undefined)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => !Number.isNaN(value));
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

/** @param {string} versionOrTag */
export function getReleaseLine(versionOrTag) {
  const match = versionOrTag.match(/^v?(\d+)\.(\d+)\.\d+(?:-(?:beta|rc)\.\d+)?$/);
  if (!match)
    throw new Error(
      `Release version or tag must use X.Y.Z or prerelease form, got: ${versionOrTag}`,
    );
  return `${match[1]}.${match[2]}`;
}

/** @param {string} sourceTag @param {string} releaseLine @param {"beta" | "rc"} sourceChannel @param {"rc" | "stable"} targetChannel */
export function getPromotion(sourceTag, releaseLine, sourceChannel, targetChannel) {
  if (!/^\d+\.\d+$/.test(releaseLine))
    throw new Error(`Release line must use X.Y form, got: ${releaseLine}`);
  const match = sourceTag.match(new RegExp(`^v(\\d+\\.\\d+\\.\\d+)-${sourceChannel}\\.(\\d+)$`));
  if (!match)
    throw new Error(
      `${targetChannel} promotion source must be a ${sourceChannel} tag, got ${sourceTag}.`,
    );
  const version = match[1];
  if (!version.startsWith(`${releaseLine}.`))
    throw new Error(`${sourceTag} does not belong to release line ${releaseLine}.`);
  return { sourceVersion: sourceTag.slice(1), version, tag: `v${version}` };
}

/** @param {string} betaTag @param {string} releaseLine */
export function getRcPromotion(betaTag, releaseLine) {
  return getPromotion(betaTag, releaseLine, "beta", "rc");
}

/** @param {string} rcTag @param {string} releaseLine */
export function getStablePromotion(rcTag, releaseLine) {
  return getPromotion(rcTag, releaseLine, "rc", "stable");
}
