/** @param {string} content */
function releaseHeadings(content) {
  return [...content.matchAll(/^## \[/gm)].map((match) => match.index);
}

/** @param {string} heading @param {string} version */
function isVersionHeading(heading, version) {
  const prefix = `## [${version}]`;
  return heading === prefix || heading.startsWith(`${prefix} - `);
}

/**
 * Replace the current release section when an unpublished release is refreshed.
 * Older release history and the changelog preamble remain byte-for-byte stable.
 *
 * @param {string} content
 * @param {string} version
 * @param {string} section
 * @returns {string | null}
 */
export function replaceCurrentReleaseSection(content, version, section) {
  const headings = releaseHeadings(content);
  const firstRelease = headings[0];
  if (firstRelease === undefined) return null;

  const currentHeading = content.slice(firstRelease).split(/\r?\n/, 1)[0];
  if (!isVersionHeading(currentHeading, version)) return null;

  const historyStart = headings[1] ?? content.length;
  const prefix = content.slice(0, firstRelease).trimEnd();
  const history = content.slice(historyStart);
  return `${prefix}\n\n${section}${history ? `\n${history}` : ""}`;
}

/**
 * Verify that a refresh changed at most the current release section.
 *
 * @param {string} previous
 * @param {string} current
 * @param {string} version
 * @returns {boolean}
 */
export function isReleaseRefreshChangelog(previous, current, version) {
  if (current === previous) return true;

  const previousHeadings = releaseHeadings(previous);
  const currentHeadings = releaseHeadings(current);
  const previousFirst = previousHeadings[0];
  const currentFirst = currentHeadings[0];
  if (previousFirst === undefined || currentFirst === undefined) return false;

  const previousHeading = previous.slice(previousFirst).split(/\r?\n/, 1)[0];
  const currentHeading = current.slice(currentFirst).split(/\r?\n/, 1)[0];
  if (!isVersionHeading(previousHeading, version) || !isVersionHeading(currentHeading, version)) {
    return false;
  }

  const previousHistory = previous.slice(previousHeadings[1] ?? previous.length);
  const currentHistory = current.slice(currentHeadings[1] ?? current.length);
  return (
    previous.slice(0, previousFirst) === current.slice(0, currentFirst) &&
    previousHistory === currentHistory
  );
}
