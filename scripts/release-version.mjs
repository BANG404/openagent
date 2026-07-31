const releaseVersionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

/**
 * @param {string} version
 * @returns {string}
 */
export function getMsiVersion(version) {
  const match = version.match(releaseVersionPattern);
  if (!match) {
    throw new Error(`Cannot derive an MSI version from ${version}.`);
  }

  const [, major, minor, patch, prerelease] = match;
  const parts = [major, minor, patch, prerelease]
    .filter((part) => part !== undefined)
    .map((part) => Number.parseInt(part, 10));
  const limits = [255, 255, 65_535, 65_535];
  const invalidPart = parts.findIndex((part, index) => part > limits[index]);
  if (invalidPart !== -1) {
    throw new Error(
      `MSI version component ${parts[invalidPart]} exceeds ${limits[invalidPart]} in ${version}.`,
    );
  }

  return prerelease === undefined
    ? `${major}.${minor}.${patch}`
    : `${major}.${minor}.${patch}.${prerelease}`;
}

/**
 * Plan the version itself independently from Git tags. Conventional Commits
 * provide `bump`; the selected channel only controls the Beta suffix.
 *
 * @param {string} currentVersion
 * @param {"none" | "major" | "minor" | "patch"} bump
 * @param {"beta" | "stable"} channel
 * @param {{ betaNumber?: number, migrateLegacyBetaVersion?: boolean }} [options]
 * @returns {{ version: string, baseVersion: string, promotion: boolean }}
 */
export function getNextReleaseVersion(currentVersion, bump, channel, options = {}) {
  const match = currentVersion.match(releaseVersionPattern);
  if (!match) throw new Error(`Unsupported version format: ${currentVersion}`);
  if (channel !== "beta" && channel !== "stable") {
    throw new Error(`Unsupported release channel: ${channel}`);
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  const currentBase = `${major}.${minor}.${patch}`;
  const isBeta = match[4] !== undefined;
  const promotion = channel === "stable" && isBeta && bump === "none";

  if (promotion) {
    return { version: currentBase, baseVersion: currentBase, promotion: true };
  }
  if (bump === "none" && !isBeta) {
    throw new Error("A stable version requires a release-worthy bump.");
  }

  let baseVersion;
  if (isBeta && bump === "none" && !options.migrateLegacyBetaVersion) {
    baseVersion = currentBase;
  } else {
    const effectiveBump = isBeta && bump === "none" ? "patch" : bump;
    if (effectiveBump === "major") baseVersion = `${major + 1}.0.0`;
    else if (effectiveBump === "minor") baseVersion = `${major}.${minor + 1}.0`;
    else if (effectiveBump === "patch") baseVersion = `${major}.${minor}.${patch + 1}`;
    else throw new Error(`Unsupported release bump: ${bump}`);
  }

  const version =
    channel === "beta" ? `${baseVersion}-beta.${options.betaNumber ?? 1}` : baseVersion;
  return { version, baseVersion, promotion: false };
}

/**
 * Resolve the next Beta counter from both immutable tags and the checked-in
 * version. The latter keeps numbering continuous when historical tags are not
 * present in a newly separated repository.
 *
 * @param {string} baseVersion
 * @param {string[]} tags
 * @param {string} currentVersion
 * @returns {number}
 */
export function getNextBetaNumber(baseVersion, tags, currentVersion) {
  const escapedBase = baseVersion.replaceAll(".", "\\.");
  const matcher = new RegExp(`^v?${escapedBase}-beta\\.(\\d+)$`);
  const numbers = [...tags, currentVersion]
    .map((value) => value.match(matcher)?.[1])
    .filter((value) => value !== undefined)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => !Number.isNaN(value));
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

/**
 * Resolve the immutable Stable target for a Beta selected from a persistent
 * X.Y release line.
 *
 * @param {string} betaTag
 * @param {string} releaseLine
 * @returns {{ sourceVersion: string, version: string, tag: string }}
 */
export function getStablePromotion(betaTag, releaseLine) {
  if (!/^\d+\.\d+$/.test(releaseLine)) {
    throw new Error(`Release line must use X.Y form, got: ${releaseLine}`);
  }
  const match = betaTag.match(/^v(\d+\.\d+\.\d+)-beta\.(\d+)$/);
  if (!match) {
    throw new Error(`Stable promotion source must be a Beta tag, got ${betaTag}.`);
  }
  const version = match[1];
  if (!version.startsWith(`${releaseLine}.`)) {
    throw new Error(`${betaTag} does not belong to release line ${releaseLine}.`);
  }
  return { sourceVersion: betaTag.slice(1), version, tag: `v${version}` };
}
