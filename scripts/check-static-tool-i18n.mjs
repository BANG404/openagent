import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const STATIC_TOOL_COMPONENTS = Object.freeze([
  "ToolCallCard.svelte",
  "ToolCallGroup.svelte",
  "ToolApprovalActions.svelte",
  "UserInputForm.svelte",
  "UserInputSummary.svelte",
  "StreamItemRenderer.svelte",
  "ProcessRecordGroup.svelte",
  "RetryAttempt.svelte",
  "MermaidToolPreview.svelte",
  "FileDiffView.svelte",
  "StandaloneDevPreview.svelte",
  "CheckpointFlowStatus.svelte",
  "CheckpointFlowToggleButton.svelte",
  "CompactionStatus.svelte",
]);

const staticTextNodePattern =
  /<(?:span|summary|p|h[1-6]|label|button)\b[^>]*>([^<]*)<\/(?:span|summary|p|h[1-6]|label|button)>/giu;
const staticAttributePattern =
  /\b(?:aria-label|title|placeholder|alt)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu;
const forbiddenLiteralPattern = /["'](Thinking|Yes|No)["']/gu;

const allowedStaticText = new Set(["OpenAgent", "ChatGPT OAuth · gpt-5.6"]);

/**
 * Parse the two translation objects without importing the Svelte module. This
 * keeps the contract test usable in Bun's Node-compatible test environment.
 *
 * @param {string} source
 * @returns {Set<string>}
 */
export function translationKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/^\s{2}([A-Za-z]\w*):/gmu)) keys.add(match[1]);
  return keys;
}

/**
 * @param {string} source
 * @returns {{ zh: Set<string>, en: Set<string> }}
 */
export function translationCatalogs(source) {
  const zhBody = /(?:const|export const) zh = \{([\s\S]*?)\} as const;/u.exec(source)?.[1] ?? "";
  const enBody = /(?:const|export const) en(?:: [^=]+)? = \{([\s\S]*?)\};/u.exec(source)?.[1] ?? "";
  return { zh: translationKeys(zhBody), en: translationKeys(enBody) };
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function usedTranslationKeys(source) {
  return [...source.matchAll(/\b(?:\$t|t)\(\s*["']([A-Za-z]\w*)["']\s*\)/gu)].map(
    (match) => match[1],
  );
}

/**
 * @param {string} source
 * @param {string} file
 * @param {Set<string>} keys
 * @returns {string[]}
 */
export function staticToolI18nViolations(source, file, keys) {
  const errors = [];
  if (!/from\s+["']\$lib\/i18n["']/.test(source)) {
    errors.push(`${file}: static tool UI must import its labels from $lib/i18n.`);
  }

  for (const key of usedTranslationKeys(source)) {
    if (!keys.has(key))
      errors.push(`${file}: translation key ${key} is missing from zh/en catalogs.`);
  }

  for (const match of source.matchAll(staticTextNodePattern)) {
    const text = match[1].trim();
    if (/^[A-Za-z]/u.test(text) && !/[{}]/u.test(text) && !allowedStaticText.has(text)) {
      errors.push(`${file}: hardcoded tool UI text "${text}" must use $t(...).`);
    }
  }
  for (const match of source.matchAll(staticAttributePattern)) {
    const text = (match[1] ?? match[2] ?? "").trim();
    if (/^[A-Za-z]/u.test(text) && !allowedStaticText.has(text)) {
      errors.push(`${file}: hardcoded tool UI attribute "${text}" must use $t(...).`);
    }
  }
  for (const match of source.matchAll(forbiddenLiteralPattern)) {
    errors.push(`${file}: hardcoded tool status value "${match[1]}" must use $t(...).`);
  }
  return errors;
}

/**
 * @param {{ root?: string, components?: readonly string[], i18nSource?: string }} [options]
 * @returns {string[]}
 */
export function staticToolI18nErrors({
  root: projectRoot = root,
  components = STATIC_TOOL_COMPONENTS,
  i18nSource = readFileSync(resolve(projectRoot, "src/lib/i18n.ts"), "utf8"),
} = {}) {
  const catalogs = translationCatalogs(i18nSource);
  if (catalogs.zh.size === 0 || catalogs.en.size === 0) {
    const zhSource = readFileSync(resolve(projectRoot, "src/lib/i18n.zh.ts"), "utf8");
    const enSource = readFileSync(resolve(projectRoot, "src/lib/i18n.en.ts"), "utf8");
    const splitCatalogs = translationCatalogs(`${zhSource}\n${enSource}`);
    catalogs.zh = splitCatalogs.zh;
    catalogs.en = splitCatalogs.en;
  }
  const keys = new Set([...catalogs.zh].filter((key) => catalogs.en.has(key)));
  return components.flatMap((name) => {
    const file = resolve(projectRoot, "src/lib/components", name);
    return staticToolI18nViolations(readFileSync(file, "utf8"), name, keys);
  });
}

function main() {
  const errors = staticToolI18nErrors();
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Static agent-tool i18n contract is valid.");
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) main();
