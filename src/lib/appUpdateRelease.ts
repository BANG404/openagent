const OPENAGENT_RELEASES_URL = "https://github.com/BANG404/openagent/releases/tag";

export function appUpdateReleaseUrl(version: string): string {
  const normalizedVersion = version.trim();
  const tag = normalizedVersion.startsWith("v") ? normalizedVersion : `v${normalizedVersion}`;
  return `${OPENAGENT_RELEASES_URL}/${encodeURIComponent(tag)}`;
}
