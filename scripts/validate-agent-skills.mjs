import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = resolve(root, ".agents/skills");
const manifestPath = resolve(skillsRoot, "manifest.json");

/** @typedef {{ name: string, description: string }} SkillFields */
/** @typedef {{ skill: string, paths: string[] }} SkillOwner */
/** @typedef {{ version: number, owners: SkillOwner[] }} SkillManifest */

export const MAX_SKILL_ENTRYPOINT_CHARS = 200;

/**
 * @param {string} file
 * @returns {SkillFields}
 */
function frontmatter(file) {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end < 0) throw new Error(`${file}: missing YAML frontmatter`);
  /** @type {Partial<SkillFields>} */
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (name !== "name" && name !== "description") continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[name] = value;
  }
  if (!fields.name || !fields.description) {
    throw new Error(`${file}: name and description are required`);
  }
  return /** @type {SkillFields} */ (fields);
}

/**
 * @param {string} file
 * @returns {string[]}
 */
function relativeLinks(file) {
  const source = readFileSync(file, "utf8");
  const errors = [];
  for (const match of source.matchAll(/\]\(([^)#\s]+)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:)/.test(target)) continue;
    if (target.startsWith("/")) continue;
    if (!existsSync(resolve(dirname(file), target))) errors.push(`${file}: missing ${target}`);
  }
  return errors;
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
function markdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(file));
    else if (entry.isFile() && file.endsWith(".md")) files.push(file);
  }
  return files;
}

/**
 * Return the prose length of a skill entrypoint. YAML metadata and fenced
 * examples are routing data or reference material, so they do not count
 * toward the compact entrypoint budget.
 *
 * @param {string} source
 * @returns {number}
 */
export function skillBodyCharacterCount(source) {
  const lines = source.split(/\r?\n/);
  const frontmatterEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const bodyLines = lines.slice(frontmatterEnd >= 0 ? frontmatterEnd + 1 : 0);
  let inFence = false;
  const body = bodyLines
    .filter((line) => {
      if (line.startsWith("```")) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join(" ")
    .replace(/\s/gu, "");
  return [...body].length;
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
export function skillEntrypoints(directory = skillsRoot) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(directory, entry.name, "SKILL.md"))
    .filter((file) => existsSync(file));
}

/**
 * @param {{ directory?: string, maxChars?: number }} [options]
 * @returns {string[]}
 */
export function skillLengthErrors({
  directory = skillsRoot,
  maxChars = MAX_SKILL_ENTRYPOINT_CHARS,
} = {}) {
  return skillEntrypoints(directory).flatMap((file) => {
    const count = skillBodyCharacterCount(readFileSync(file, "utf8"));
    return count > maxChars
      ? [`${file}: entrypoint has ${count} prose characters (maximum ${maxChars})`]
      : [];
  });
}

/** @param {{ name: string; isDirectory(): boolean }} entry @param {string[]} errors @param {Set<string>} skillNames */
function validateSkillDirectory(entry, errors, skillNames) {
  const file = resolve(skillsRoot, entry.name, "SKILL.md");
  if (!existsSync(file)) {
    errors.push(`${file}: every skill directory needs SKILL.md`);
    return;
  }
  try {
    const fields = frontmatter(file);
    if (fields.name !== entry.name) errors.push(`${file}: name must match directory`);
    if (skillNames.has(fields.name)) errors.push(`${file}: duplicate skill name`);
    skillNames.add(fields.name);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  for (const markdown of markdownFiles(resolve(skillsRoot, entry.name))) {
    errors.push(...relativeLinks(markdown));
  }
}

/** @param {string[]} errors @param {Set<string>} skillNames */
function validateSkillDirectories(errors, skillNames) {
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    validateSkillDirectory(entry, errors, skillNames);
  }
}

/** @param {string[]} errors @param {Set<string>} skillNames */
function validateManifest(errors, skillNames) {
  if (!existsSync(manifestPath)) {
    errors.push(`${manifestPath}: missing routing manifest`);
    return;
  }
  /** @type {SkillManifest | undefined} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    errors.push(`${manifestPath}: invalid JSON (${error})`);
  }
  const owners = manifest?.owners;
  if (!Array.isArray(owners) || owners.length === 0) {
    errors.push(`${manifestPath}: owners must be a non-empty array`);
    return;
  }
  const listed = new Set();
  for (const owner of owners) {
    if (
      !owner ||
      typeof owner.skill !== "string" ||
      !Array.isArray(owner.paths) ||
      owner.paths.length === 0
    ) {
      errors.push(`${manifestPath}: each owner needs a skill and non-empty paths`);
      continue;
    }
    if (!skillNames.has(owner.skill)) errors.push(`${manifestPath}: unknown skill ${owner.skill}`);
    if (listed.has(owner.skill)) errors.push(`${manifestPath}: duplicate owner ${owner.skill}`);
    listed.add(owner.skill);
  }
  for (const skill of skillNames) {
    if (!listed.has(skill)) errors.push(`${manifestPath}: unlisted skill ${skill}`);
  }
}

function validate() {
  const errors = [...skillLengthErrors()];
  const skillNames = new Set();
  validateSkillDirectories(errors, skillNames);
  validateManifest(errors, skillNames);
  return errors;
}

const errors = validate();
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Agent skill contract is valid.");
}

export { validate };
