import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_DIAGNOSTIC_BYTES = 48 * 1024;
const PRIVATE_CHECK_PREFIX = "Public SDK diagnostics";
const PRIVATE_DIAGNOSTIC_POINTER = "sdk-private-diagnostic-name";
const SENSITIVE_ENVIRONMENT_NAME = /(credential|key|password|secret|token)/i;

/**
 * @param {string} text
 * @param {NodeJS.ProcessEnv} env
 */
export function redactSensitiveEnvironmentValues(text, env) {
  let redacted = text;
  for (const [name, value] of Object.entries(env)) {
    if (SENSITIVE_ENVIRONMENT_NAME.test(name) && typeof value === "string" && value.length >= 8) {
      redacted = redacted.replaceAll(value, "[REDACTED]");
    }
  }
  return redacted;
}

/**
 * @param {string} directory
 * @param {NodeJS.ProcessEnv} env
 * @param {number} maxBytes
 */
export async function collectPrivateDiagnostic(
  directory,
  env = process.env,
  maxBytes = MAX_DIAGNOSTIC_BYTES,
) {
  let name;
  try {
    name = (await readFile(resolve(directory, PRIVATE_DIAGNOSTIC_POINTER), "utf8")).trim();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { diagnostic: "", truncated: false };
    }
    throw error;
  }
  if (!/^sdk-[a-zA-Z0-9._-]+\.log$/.test(name)) {
    throw new Error("Private diagnostic log name is invalid.");
  }

  const contents = await readFile(resolve(directory, name), "utf8");
  const diagnostic = redactSensitiveEnvironmentValues(`===== ${name} =====\n${contents}`, env);
  const bytes = Buffer.from(diagnostic, "utf8");
  if (bytes.length <= maxBytes) {
    return { diagnostic, truncated: false };
  }

  const suffix = bytes.subarray(bytes.length - maxBytes).toString("utf8");
  return {
    diagnostic: suffix.replace(/^\uFFFD/, ""),
    truncated: true,
  };
}

/**
 * @param {{
 *   diagnosticName: string;
 *   diagnostic: string;
 *   truncated: boolean;
 * }} input
 */
export function buildPrivateCheckOutput({ diagnosticName, diagnostic, truncated }) {
  const prefix = truncated
    ? "The diagnostic exceeded the private check limit; only its tail is shown.\n\n"
    : "";
  const escaped = diagnostic.replaceAll("```", "` ` `");
  const text = diagnostic
    ? `${prefix}\`\`\`text\n${escaped}\n\`\`\``
    : "The job failed before it produced a private command log.";

  return {
    title: `${diagnosticName} failed`,
    summary:
      "Private diagnostic captured by the public SDK validation runner. This output is stored only on the private SDK commit.",
    text,
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv;
 *   fetchImpl?: typeof fetch;
 * }} options
 */
export async function reportPrivateSdkDiagnostic({ env = process.env, fetchImpl = fetch } = {}) {
  const token = env.GH_TOKEN ?? "";
  const sha = env.SDK_SHA ?? "";
  const repository = env.SDK_REPOSITORY ?? "";
  const diagnosticName = env.SDK_DIAGNOSTIC_NAME ?? "SDK validation";
  const runnerTemp = env.RUNNER_TEMP ?? "";

  if (!token || !/^[0-9a-f]{40}$/.test(sha) || !repository || !runnerTemp) {
    throw new Error("Private diagnostic reporter configuration is incomplete.");
  }

  const { diagnostic, truncated } = await collectPrivateDiagnostic(runnerTemp, env);
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/check-runs`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      name: `${PRIVATE_CHECK_PREFIX} / ${diagnosticName}`,
      head_sha: sha,
      status: "completed",
      conclusion: "failure",
      output: buildPrivateCheckOutput({
        diagnosticName,
        diagnostic,
        truncated,
      }),
    }),
  });

  if (!response.ok) {
    throw new Error(`Private diagnostic delivery returned HTTP ${response.status}.`);
  }
}

async function main() {
  try {
    await reportPrivateSdkDiagnostic();
  } catch {
    console.error("::warning::Private SDK diagnostic delivery failed.");
    process.exitCode = 1;
  }
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  await main();
}
