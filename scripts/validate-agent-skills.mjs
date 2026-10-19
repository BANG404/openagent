import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadSkillManifest, resolveSkillOwner } from "./agent-skill-routing.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = resolve(root, ".agents/skills");
const manifestPath = resolve(skillsRoot, "manifest.json");

/** @typedef {{ name: string, description: string }} SkillFields */
/** @typedef {{ skill: string, paths: string[] }} SkillOwner */
/** @typedef {{ version: number, owners: SkillOwner[] }} SkillManifest */

export const RECOMMENDED_SKILL_ENTRYPOINT_CHARS = 6000;

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

/** Count all loaded body text, including examples and link destinations.
 * @param {string} source
 */
export function skillBodyCharacterCount(source) {
  const lines = source.split(/\r?\n/);
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  return [
    ...lines
      .slice(end >= 0 ? end + 1 : 0)
      .join("\n")
      .replace(/\s/gu, ""),
  ].length;
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
export function skillLengthWarnings({
  directory = skillsRoot,
  maxChars = RECOMMENDED_SKILL_ENTRYPOINT_CHARS,
} = {}) {
  return skillEntrypoints(directory).flatMap((file) => {
    const count = skillBodyCharacterCount(readFileSync(file, "utf8"));
    return count > maxChars
      ? [
          `${file}: entrypoint has ${count} body characters (recommended ${maxChars}); consider routing conditional detail to references`,
        ]
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

/**
 * @param {SkillManifest} manifest
 * @param {Set<string>} skillNames
 * @param {string[]} files
 * @returns {string[]}
 */
export function manifestErrors(manifest, skillNames, files) {
  const errors = [];
  if (manifest.version !== 2) errors.push("Skill manifest version must be 2");
  if (!Array.isArray(manifest.owners) || manifest.owners.length === 0) {
    return [...errors, "Skill manifest owners must be a non-empty array"];
  }
  const listed = new Set();
  const patterns = new Map();
  for (const owner of manifest.owners) {
    if (!owner || typeof owner.skill !== "string" || !Array.isArray(owner.paths)) {
      errors.push("Each owner needs a skill and a paths array (empty for workflow-only skills)");
      continue;
    }
    if (!skillNames.has(owner.skill)) errors.push(`Unknown skill ${owner.skill}`);
    if (listed.has(owner.skill)) errors.push(`Duplicate owner ${owner.skill}`);
    listed.add(owner.skill);
    for (const pattern of owner.paths) {
      if (
        typeof pattern !== "string" ||
        !pattern ||
        /[\\?#[\]{}]|\*\*|^\/|(?:^|\/)\.\.?(?:\/|$)/.test(pattern)
      ) {
        errors.push(`${owner.skill}: invalid route ${String(pattern)}`);
        continue;
      }
      const previous = patterns.get(pattern);
      if (previous) errors.push(`Duplicate route ${pattern}: ${previous}, ${owner.skill}`);
      patterns.set(pattern, owner.skill);
      // Exact files may be prospective workspace context, such as DESIGN.md.
      // Independent ignored plugin checkouts are not part of this inventory.
      if ((pattern.endsWith("/") || pattern.includes("*")) && !pattern.startsWith("plugins/")) {
        const prefix = pattern.split("*")[0];
        if (!files.some((file) => file.startsWith(prefix))) {
          errors.push(`${owner.skill}: route matches no repository paths: ${pattern}`);
        }
      }
    }
  }
  for (const skill of skillNames) {
    if (!listed.has(skill)) errors.push(`Unlisted skill ${skill}`);
  }
  if (errors.length) return errors;
  for (const file of files) {
    try {
      resolveSkillOwner(file, manifest);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

/** References must be reachable from their own skill, without searching the directory.
 * @param {string} directory
 * @returns {string[]}
 */
export function referenceRoutingErrors(directory = skillsRoot) {
  const errors = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillRoot = resolve(directory, entry.name);
    const pending = [resolve(skillRoot, "SKILL.md")];
    const seen = new Set();
    while (pending.length) {
      const file = pending.pop();
      if (!file || seen.has(file) || !existsSync(file)) continue;
      seen.add(file);
      for (const match of readFileSync(file, "utf8").matchAll(/\]\(([^)#\s]+)/g)) {
        const target = resolve(dirname(file), match[1]);
        if (target.startsWith(`${skillRoot}/`) || target.startsWith(`${skillRoot}\\`)) {
          if (target.endsWith(".md")) pending.push(target);
        }
      }
    }
    const references = resolve(skillRoot, "references");
    if (!existsSync(references)) continue;
    for (const file of markdownFiles(references)) {
      if (!seen.has(file)) errors.push(`${file}: no link route from this skill's SKILL.md`);
    }
  }
  return errors;
}

export function validate() {
  /** @type {string[]} */
  const errors = [];
  const skillNames = new Set();
  validateSkillDirectories(errors, skillNames);
  errors.push(...referenceRoutingErrors());
  try {
    const files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
      .split("\0")
      .filter(Boolean);
    errors.push(...manifestErrors(loadSkillManifest(), skillNames, files));
  } catch (error) {
    errors.push(`${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

function main() {
  for (const warning of skillLengthWarnings()) console.warn(`- ${warning}`);
  const errors = validate();
  if (errors.length) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Agent skill contract is valid.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
