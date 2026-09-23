import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = resolve(root, ".agents/skills");
const manifestPath = resolve(skillsRoot, "manifest.json");

/** @typedef {{ name: string, description: string }} SkillFields */
/** @typedef {{ skill: string, paths: string[] }} SkillOwner */
/** @typedef {{ version: number, owners: SkillOwner[] }} SkillManifest */

/**
 * @param {string} file
 * @returns {SkillFields}
 */
function frontmatter(file) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${file}: missing YAML frontmatter`);
  /** @type {Partial<SkillFields>} */
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(name|description):\s*["']?(.*?)["']?\s*$/);
    if (field && (field[1] === "name" || field[1] === "description")) {
      fields[field[1]] = field[2].trim();
    }
  }
  if (!fields.name || !fields.description) {
    throw new Error(`${file}: name and description are required`);
  }
  if (!/^metadata:\s*$/m.test(match[1]) || !/\n\s+category:\s*\S+/.test(match[1])) {
    throw new Error(`${file}: metadata.category is required`);
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
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:)/.test(target)) continue;
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

function validate() {
  const errors = [];
  const skillNames = new Set();
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = resolve(skillsRoot, entry.name, "SKILL.md");
    if (!existsSync(file)) {
      errors.push(`${file}: every skill directory needs SKILL.md`);
      continue;
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

  if (!existsSync(manifestPath)) errors.push(`${manifestPath}: missing routing manifest`);
  else {
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
    } else {
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
        if (!skillNames.has(owner.skill))
          errors.push(`${manifestPath}: unknown skill ${owner.skill}`);
        if (listed.has(owner.skill)) errors.push(`${manifestPath}: duplicate owner ${owner.skill}`);
        listed.add(owner.skill);
      }
      for (const skill of skillNames)
        if (!listed.has(skill)) errors.push(`${manifestPath}: unlisted skill ${skill}`);
    }
  }
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
