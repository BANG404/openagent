import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ZERO_SHA = /^0+$/;

const AGENT_DOCUMENTATION = [
  /^AGENTS\.md$/,
  /^README(?:\.[^/]+)?\.md$/,
  /^CHANGELOG\.md$/,
  /^docs\/.+\.md$/,
  /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
  /^static\/skills\/[^/]+\/SKILL\.md$/,
];

const LOGIC_FILES = [
  /^src\/.+\.(?:js|mjs|cjs|ts|svelte)$/,
  /^src-tauri\/src\/.+\.rs$/,
  /^src-tauri\/build\.rs$/,
  /^src-tauri\/capabilities\/.+\.json$/,
  /^src-tauri\/(?:Cargo|tauri\.conf)\.(?:toml|json)$/,
  /^scripts\/.+\.(?:js|mjs|cjs|ts|ps1)$/,
  /^\.github\/workflows\/.+\.ya?ml$/,
  /^package\.json$/,
  /^tsconfig\.json$/,
  /^(?:eslint|svelte|vite)\.config\.(?:js|mjs|ts)$/,
];

const CHAT_FRONTEND_FILES = [
  /^src\/routes\/(?:remote\/)?\+page\.svelte$/,
  /^src\/lib\/(?:chatStream|conversationDb|checkpointTree|assistantOutput|chatQueue|remoteConversationProjection|startupRestoreCache|toolCallGroups|types)\.ts$/,
  /^src\/lib\/components\/(?:AttachmentPreview|FileChangeBanner|MermaidToolPreview|MessageInput|MessageList|ProcessRecordGroup|RetryAttempt|StreamItemRenderer|ToolApprovalActions|ToolCallCard|ToolCallGroup|UserInputForm|UserInputSummary|VirtualMessageList)\.svelte$/,
  /^src\/lib\/streamdown\//,
];

const CHAT_SKILL = ".agents/skills/openagent-chat-frontend/SKILL.md";

function normalize(files) {
  return [...new Set(files.map((file) => file.trim().replaceAll("\\", "/")).filter(Boolean))];
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

/**
 * @param {string[]} files
 * @returns {string[]}
 */
export function documentationSyncErrors(files) {
  const changed = normalize(files);
  const logic = changed.filter((file) => matchesAny(file, LOGIC_FILES));
  if (logic.length === 0) {
    return [];
  }

  const documentation = changed.filter((file) => matchesAny(file, AGENT_DOCUMENTATION));
  const errors = [];

  if (documentation.length === 0) {
    errors.push(
      "Logic changed without agent-facing documentation. Update AGENTS.md, a relevant docs/*.md or README, or a workspace SKILL.md in the same change.",
    );
  }

  const chatLogic = logic.filter((file) => matchesAny(file, CHAT_FRONTEND_FILES));
  if (chatLogic.length > 0 && !changed.includes(CHAT_SKILL)) {
    errors.push(
      `Chat frontend logic changed without ${CHAT_SKILL}. Update the skill's current invariant in the same change.`,
    );
  }

  return errors;
}

function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

function changedFiles() {
  const base = process.env.DOCS_BASE_SHA?.trim() ?? "";
  const head = process.env.DOCS_HEAD_SHA?.trim() || "HEAD";

  if (base && !ZERO_SHA.test(base)) {
    return gitLines(["diff", "--name-only", "--diff-filter=ACDMRT", base, head]);
  }

  if (process.env.CI) {
    console.log("Documentation sync check skipped: CI did not provide a usable base SHA.");
    return [];
  }

  return [
    ...gitLines(["diff", "--name-only", "--diff-filter=ACDMRT", "HEAD"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ];
}

function main() {
  const errors = documentationSyncErrors(changedFiles());
  if (errors.length === 0) {
    console.log("Agent-facing documentation is synchronized with changed logic.");
    return;
  }

  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  main();
}
