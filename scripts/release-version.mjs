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
