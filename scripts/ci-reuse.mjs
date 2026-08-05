import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const CI_CAPABILITIES = [
  "automation",
  "frontend",
  "nativeQuality",
  "nativePlatform",
  "embedding",
  "harness",
];

/** @type {Record<string, {fast?: string; full?: string}>} */
export const VERIFIED_CI_CONTEXTS = {
  automation: { fast: "Verified CI / automation" },
  frontend: {
    fast: "Verified CI / frontend-fast",
    full: "Verified CI / frontend-full",
  },
  nativeQuality: {
    fast: "Verified CI / native-quality-fast",
    full: "Verified CI / native-quality-full",
  },
  nativePlatform: { full: "Verified CI / native-platform-full" },
  embedding: {
    fast: "Verified CI / embedding-fast",
    full: "Verified CI / embedding-full",
  },
  harness: {
    fast: "Verified CI / harness-fast",
    full: "Verified CI / harness-full",
  },
};

const REQUIRED_CONTEXT = "Required PR Head";
const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const REUSABLE_SOURCE_EVENTS = new Set(["pull_request", "workflow_dispatch"]);

/** @returns {Record<string, boolean>} */
function emptyCapabilities() {
  return Object.fromEntries(CI_CAPABILITIES.map((name) => [name, false]));
}

/** @param {string} capability */
function capabilityEnvName(capability) {
  return capability.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {Array<Record<string, unknown>>} statuses
 * @param {string} context
 */
export function latestStatus(statuses, context) {
  return statuses
    .filter((status) => status.context === context)
    .sort((left, right) =>
      String(right.updated_at ?? right.created_at ?? "").localeCompare(
        String(left.updated_at ?? left.created_at ?? ""),
      ),
    )[0];
}

/** @param {unknown} description */
export function verifiedTreeFromDescription(description) {
  return (
    String(description ?? "").match(/(?:^|\s)tree=(?<tree>[0-9a-f]{40})(?:\s|$)/)?.groups?.tree ??
    ""
  );
}

/**
 * @param {string} targetUrl
 * @param {string} repository
 */
export function parseRunId(targetUrl, repository) {
  try {
    const url = new URL(targetUrl);
    const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = url.pathname.match(
      new RegExp(`^/${escapedRepository}/actions/runs/(?<runId>[0-9]+)/?$`, "i"),
    );
    return url.hostname === "github.com" ? (match?.groups?.runId ?? "") : "";
  } catch {
    return "";
  }
}

/**
 * @param {Record<string, boolean>} requested
 * @param {Record<string, boolean>} reusable
 * @param {boolean} full
 */
export function selectCiModules(requested, reusable, full) {
  return Object.fromEntries(
    CI_CAPABILITIES.map((name) => {
      if (name === "nativePlatform" && !full) {
        return [name, false];
      }
      return [name, requested[name] === true && reusable[name] !== true];
    }),
  );
}

/**
 * @param {Array<Record<string, unknown>>} statuses
 * @param {boolean} full
 */
export function reusableCapabilitiesFromStatuses(statuses, full) {
  const reusable = emptyCapabilities();
  for (const capability of CI_CAPABILITIES) {
    if (capability === "nativePlatform" && !full) {
      continue;
    }
    const contexts = VERIFIED_CI_CONTEXTS[capability];
    const context = full && contexts.full ? contexts.full : contexts.fast;
    reusable[capability] = Boolean(context && latestStatus(statuses, context)?.state === "success");
  }
  return reusable;
}

/**
 * @typedef {{
 *   repository: string;
 *   targetSha: string;
 *   targetTree: string;
 *   targetBranch: string;
 *   eventName: string;
 *   runId: string;
 *   full: boolean;
 *   api: (path: string) => Promise<unknown>;
 * }} ResolveReuseOptions
 */

/**
 * Resolve prior authoritative CI results without trusting commit messages,
 * branch names, or a caller-provided source SHA. Any incomplete verification
 * returns an empty capability set so the current workflow runs normally.
 *
 * @param {ResolveReuseOptions} options
 */
export async function resolveVerifiedTreeReuse(options) {
  /** @param {string} reason */
  const none = (reason) => ({
    reusable: emptyCapabilities(),
    sourceSha: "",
    sourceTree: "",
    sourceRuns: [],
    reason,
  });

  if (
    !options.repository ||
    !/^[0-9a-f]{40}$/.test(options.targetSha) ||
    !/^[0-9a-f]{40}$/.test(options.targetTree)
  ) {
    return none("The repository, target SHA, or checked-out tree is invalid.");
  }
  if (!new Set(["pull_request", "push"]).has(options.eventName)) {
    return none(`The ${options.eventName || "unknown"} event never reuses CI.`);
  }

  try {
    /** @type {Array<{sha: string; tree: string; kind: string}>} */
    const candidates = [{ sha: options.targetSha, tree: options.targetTree, kind: "exact commit" }];

    if (options.eventName === "push") {
      const pulls = await options.api(
        `/repos/${options.repository}/commits/${options.targetSha}/pulls`,
      );
      if (Array.isArray(pulls)) {
        for (const pull of pulls) {
          if (
            !isRecord(pull) ||
            pull.merged_at == null ||
            pull.merge_commit_sha !== options.targetSha ||
            !isRecord(pull.base) ||
            pull.base.ref !== options.targetBranch ||
            !isRecord(pull.head) ||
            !isRecord(pull.head.repo) ||
            String(pull.head.repo.full_name).toLowerCase() !== options.repository.toLowerCase()
          ) {
            continue;
          }
          const headSha = String(pull.head.sha ?? "");
          if (!/^[0-9a-f]{40}$/.test(headSha) || headSha === options.targetSha) {
            continue;
          }
          candidates.push({
            sha: headSha,
            tree: options.targetTree,
            kind: `pull request #${pull.number}`,
          });
        }
      }
    }

    for (const candidate of candidates) {
      const combined = await options.api(
        `/repos/${options.repository}/commits/${candidate.sha}/status`,
      );
      if (!isRecord(combined) || !Array.isArray(combined.statuses)) {
        continue;
      }
      const statuses = combined.statuses.filter(isRecord);
      const required = latestStatus(statuses, REQUIRED_CONTEXT);
      if (
        !required ||
        required.state !== "success" ||
        verifiedTreeFromDescription(required.description) !== options.targetTree
      ) {
        continue;
      }

      const statusEntries = [required];
      const reusable = reusableCapabilitiesFromStatuses(statuses, options.full);
      for (const capability of CI_CAPABILITIES) {
        if (!reusable[capability]) {
          continue;
        }
        const contexts = VERIFIED_CI_CONTEXTS[capability];
        const context = options.full && contexts.full ? contexts.full : contexts.fast;
        const status = context ? latestStatus(statuses, context) : undefined;
        if (status && verifiedTreeFromDescription(status.description) === options.targetTree) {
          statusEntries.push(status);
        } else {
          reusable[capability] = false;
        }
      }

      const runIds = new Set();
      let valid = true;
      for (const status of statusEntries) {
        const sourceRunId = parseRunId(String(status.target_url ?? ""), options.repository);
        if (!sourceRunId || sourceRunId === options.runId) {
          valid = false;
          break;
        }
        runIds.add(sourceRunId);
      }
      if (!valid) continue;

      /** @type {string[]} */
      const sourceRuns = [];
      for (const sourceRunId of runIds) {
        const run = await options.api(`/repos/${options.repository}/actions/runs/${sourceRunId}`);
        if (
          !isRecord(run) ||
          run.conclusion !== "success" ||
          run.head_sha !== candidate.sha ||
          run.path !== CI_WORKFLOW_PATH ||
          !REUSABLE_SOURCE_EVENTS.has(String(run.event)) ||
          !isRecord(run.repository) ||
          String(run.repository.full_name).toLowerCase() !== options.repository.toLowerCase()
        ) {
          valid = false;
          break;
        }
        sourceRuns.push(String(run.html_url ?? ""));
      }
      if (!valid) continue;

      return {
        reusable,
        sourceSha: candidate.sha,
        sourceTree: options.targetTree,
        sourceRuns: [...new Set(sourceRuns)].filter(Boolean),
        reason: `Reusing authoritative capabilities from ${candidate.kind}.`,
      };
    }
    return none("No authoritative successful CI result covers this exact tree.");
  } catch (error) {
    return none(
      `CI reuse lookup failed closed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * @param {string} path
 * @param {string} token
 */
async function githubApi(path, token) {
  const apiUrl = process.env.GITHUB_API_URL || "https://api.github.com";
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status}.`);
  }
  return response.json();
}

/**
 * @param {Record<string, string | boolean>} outputs
 */
function writeOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}`);
  if (outputPath) {
    appendFileSync(outputPath, `${lines.join("\n")}\n`);
  } else {
    console.log(lines.join("\n"));
  }
}

async function resolveCommand() {
  const token = process.env.GITHUB_TOKEN ?? "";
  /** @param {string} path */
  const api = (path) => githubApi(path, token);
  const options = {
    repository: process.env.GITHUB_REPOSITORY ?? "",
    targetSha: process.env.CI_TARGET_SHA ?? "",
    targetTree: process.env.CI_TARGET_TREE ?? "",
    targetBranch: process.env.CI_TARGET_BRANCH ?? "",
    eventName: process.env.CI_EVENT_NAME ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
    full: process.env.CI_FULL === "true",
    api,
  };
  const waitSeconds = Number.parseInt(process.env.CI_REUSE_WAIT_SECONDS ?? "0", 10) || 0;
  const deadline = Date.now() + waitSeconds * 1000;
  let result = await resolveVerifiedTreeReuse(options);
  while (!Object.values(result.reusable).some(Boolean) && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 15_000));
    result = await resolveVerifiedTreeReuse(options);
  }

  const capabilities = CI_CAPABILITIES.filter((name) => result.reusable[name]);
  writeOutputs({
    ...result.reusable,
    sourceSha: result.sourceSha,
    sourceTree: result.sourceTree,
    sourceRuns: result.sourceRuns.join(","),
    capabilities: capabilities.join(","),
  });
  console.log(result.reason);
  if (capabilities.length > 0) {
    console.log(`Reusable CI capabilities: ${capabilities.join(", ")}`);
  }
}

function selectCommand() {
  const requested = Object.fromEntries(
    CI_CAPABILITIES.map((name) => [
      name,
      process.env[`CI_REQUEST_${capabilityEnvName(name)}`] === "true",
    ]),
  );
  const reusable = Object.fromEntries(
    CI_CAPABILITIES.map((name) => [
      name,
      process.env[`CI_REUSE_${capabilityEnvName(name)}`] === "true",
    ]),
  );
  const selected = selectCiModules(requested, reusable, process.env.CI_FULL === "true");
  const reused = CI_CAPABILITIES.filter((name) => requested[name] && reusable[name]);
  writeOutputs({ ...selected, reused: reused.join(",") });
}

async function main() {
  const command = process.argv[2];
  if (command === "resolve") {
    await resolveCommand();
  } else if (command === "select") {
    selectCommand();
  } else {
    throw new Error("Usage: node scripts/ci-reuse.mjs <resolve|select>");
  }
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
