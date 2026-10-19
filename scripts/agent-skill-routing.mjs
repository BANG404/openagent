import { readFileSync } from "node:fs";

/** @typedef {{ skill: string, paths: string[] }} SkillOwner */
/** @typedef {{ version: number, owners: SkillOwner[] }} SkillManifest */

/** @returns {SkillManifest} */
export function loadSkillManifest() {
  return JSON.parse(
    readFileSync(new URL("../.agents/skills/manifest.json", import.meta.url), "utf8"),
  );
}

/**
 * Paths are exact files, directory prefixes ending in /, or single-segment *
 * patterns. Specificity is the length of the literal prefix before the first *.
 * @param {string} file
 * @param {string} pattern
 */
function matchScore(file, pattern) {
  if (pattern.endsWith("/")) return file.startsWith(pattern) ? pattern.length : -1;
  if (!pattern.includes("*")) return file === pattern ? pattern.length + 1 : -1;
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${expression}$`).test(file) ? pattern.indexOf("*") : -1;
}

/**
 * Resolve one primary owner; equal-specificity matches across owners are errors.
 * Each skill implicitly owns its own directory, including its executable helpers.
 * @param {string} path
 * @param {SkillManifest} [manifest]
 * @returns {string | undefined}
 */
export function resolveSkillOwner(path, manifest = loadSkillManifest()) {
  const file = path.replaceAll("\\", "/").replace(/^\.\//, "");
  let best = -1;
  const matches = new Set();
  for (const owner of manifest.owners) {
    const score = Math.max(
      -1,
      ...[...owner.paths, `.agents/skills/${owner.skill}/`].map((pattern) =>
        matchScore(file, pattern),
      ),
    );
    if (score < 0 || score < best) continue;
    if (score > best) matches.clear();
    matches.add(owner.skill);
    best = score;
  }
  if (matches.size > 1) {
    throw new Error(`Ambiguous skill ownership for ${file}: ${[...matches].sort().join(", ")}`);
  }
  return [...matches][0];
}
