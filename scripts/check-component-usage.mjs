import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src");
const sharedUiRoot = resolve(sourceRoot, "lib/components/ui");

/** @typedef {{ checkbox: number, radio: number }} NativeControlCounts */

// These controls predate the shared wrappers and are intentionally retained
// until their host surfaces can migrate without changing interaction state.
// The count is a ratchet: adding another native checkbox or radio fails.
/** @type {Readonly<Record<string, NativeControlCounts>>} */
export const NATIVE_CONTROL_BASELINE = Object.freeze({
  "src/lib/components/DevInspector.svelte": { checkbox: 1, radio: 0 },
  "src/lib/components/RoleEditorDialog.svelte": { checkbox: 2, radio: 0 },
  "src/lib/components/SettingsView.svelte": { checkbox: 2, radio: 0 },
  "src/lib/components/UserInputForm.svelte": { checkbox: 2, radio: 0 },
});

const nativeInputPattern = /<input\b[^>]*\btype\s*=\s*["'](checkbox|radio)["'][^>]*>/giu;
const forbiddenNativePatterns = [
  { element: "select", pattern: /<select\b/g, replacement: "the shared Select component" },
  {
    element: "dialog",
    pattern: /<dialog\b/g,
    replacement: "Bits UI Dialog or a shared dialog surface",
  },
];

const nativeTitlePattern = /\btitle\s*=\s*(?:["'][^"']*["']|\{[^}]*\})/u;
const nativeElementsWithVisualTitles = new Set([
  "a",
  "article",
  "button",
  "div",
  "img",
  "input",
  "label",
  "li",
  "p",
  "section",
  "span",
  "time",
]);

/**
 * @param {string} directory
 * @returns {string[]}
 */
function svelteFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...svelteFiles(file));
    else if (entry.isFile() && file.endsWith(".svelte")) files.push(file);
  }
  return files;
}

/**
 * @param {string} file
 * @returns {string}
 */
function relative(file) {
  return file.slice(root.length + 1).replaceAll("\\", "/");
}

/**
 * Check frontend files for primitives that have a project-owned replacement.
 * Text inputs, textareas, and buttons remain valid native editing/action
 * surfaces; the design system deliberately styles those at the app level.
 *
 * @param {{ files?: string[], baseline?: typeof NATIVE_CONTROL_BASELINE }} [options]
 * @returns {string[]}
 */
export function componentUsageErrors({
  files = svelteFiles(sourceRoot),
  baseline = NATIVE_CONTROL_BASELINE,
} = {}) {
  const errors = [];
  for (const file of files) {
    if (file.startsWith(sharedUiRoot)) continue;
    const source = readFileSync(file, "utf8");
    const name = relative(file);
    errors.push(...componentSourceErrors(source, name, baseline));
  }
  return errors;
}

/**
 * @param {string} source
 * @param {string} name
 * @param {typeof NATIVE_CONTROL_BASELINE} baseline
 * @returns {string[]}
 */
export function componentSourceErrors(source, name, baseline = NATIVE_CONTROL_BASELINE) {
  const errors = [];
  for (const rule of forbiddenNativePatterns) {
    const matches = rule.pattern.exec(source) ?? [];
    if (matches.length > 0) {
      errors.push(`${name}: native <${rule.element}> is not allowed; use ${rule.replacement}.`);
    }
  }

  for (const match of source.matchAll(/<([a-z][\w.-]*)\b[^>]*>/giu)) {
    const element = match[1].toLowerCase();
    if (nativeElementsWithVisualTitles.has(element) && nativeTitlePattern.test(match[0])) {
      errors.push(
        `${name}: native <${element}> title is not allowed for visual hints; use the shared Tooltip component.`,
      );
    }
  }

  const nativeInputs = [...source.matchAll(nativeInputPattern)];
  if (nativeInputs.length === 0) return errors;
  const expected = baseline[name];
  /** @type {NativeControlCounts} */
  const counts = { checkbox: 0, radio: 0 };
  for (const match of nativeInputs) {
    const kind = match[1].toLowerCase();
    if (kind === "checkbox" || kind === "radio") counts[kind] += 1;
  }
  if (!expected) {
    errors.push(
      `${name}: native checkbox/radio controls are not allowed; use the shared Switch or SegmentedControl component.`,
    );
    return errors;
  }
  /** @type {Array<keyof NativeControlCounts>} */
  const kinds = ["checkbox", "radio"];
  for (const kind of kinds) {
    if (counts[kind] > expected[kind]) {
      errors.push(
        `${name}: added native ${kind} control (${counts[kind]} found, ${expected[kind]} allowed); use the shared UI component.`,
      );
    }
  }
  return errors;
}

/**
 * @returns {string[]}
 */
export function sharedUiFiles() {
  return existsSync(sharedUiRoot)
    ? readdirSync(sharedUiRoot)
        .filter((file) => file.endsWith(".svelte"))
        .map((file) => resolve(sharedUiRoot, file))
    : [];
}

function main() {
  const errors = componentUsageErrors();
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Shared frontend component contract is valid.");
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) main();
