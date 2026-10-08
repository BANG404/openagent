import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const workflowPath = new URL("../.github/workflows/release.yml", import.meta.url);

/**
 * @param {string} jobName
 * @param {string} nextJobName
 */
async function releaseJobSource(jobName, nextJobName) {
  const source = (await readFile(workflowPath, "utf8")).replaceAll("\r\n", "\n");
  const start = source.indexOf(`  ${jobName}:\n`);
  const end = source.indexOf(`  ${nextJobName}:\n`, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("release workflow publication gates", () => {
  test("plugin tag setup excludes the separately checked-out private SDK", async () => {
    const source = (
      await readFile(new URL("../.github/workflows/plugin-releases.yml", import.meta.url), "utf8")
    ).replaceAll("\r\n", "\n");
    const step = source.slice(
      source.indexOf("      - name: Initialize pinned standard package sources"),
    );
    const runSource = step.match(/ {8}run: \|\n((?: {10}.*\n|\n)+)/)?.[1].replace(/^ {10}/gm, "");
    expect(runSource).toBeDefined();
    const mockGit = `
git() {
  if [[ "$1 $2" == "submodule update" ]]; then return 0; fi
  if [[ "$1 $2" == "submodule foreach" ]]; then
    local displaypath
    for displaypath in plugins/chat-groups plugins/goal/nested sdk; do
      eval "$4" || return $?
    done
  elif [[ "$1" == "fetch" ]]; then
    if [[ "$displaypath" == sdk ]]; then echo 'private SDK fetch denied' >&2; return 128; fi
    echo "$displaypath"
  else
    return 2
  fi
}
`;
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", mockGit + (runSource ?? "")],
      {
        encoding: "utf8",
        timeout: 5000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("plugins/chat-groups\nplugins/goal/nested\n");
    expect(result.stderr).toBe("");
  });

  test("Runtime publication credentials fail before expensive qualification", async () => {
    const detect = await releaseJobSource("detect", "sdk-release");
    const credentialStep = detect.slice(
      detect.indexOf("      - name: Require private release credentials"),
    );
    const runSource = credentialStep
      .match(/ {8}run: \|\n((?: {10}.*\n|\n)+)/)?.[1]
      .replace(/^ {10}/gm, "");
    expect(runSource).toBeDefined();

    for (const [runtime, token, expectedStatus] of [
      ["true", "", 1],
      ["true", "fixture-token", 0],
      ["false", "", 0],
    ]) {
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", runSource ?? ""],
        {
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...process.env,
            OPENAGENT_CI_REPORTER_APP_ID: "fixture-app",
            OPENAGENT_CI_REPORTER_PRIVATE_KEY: "fixture-key",
            OPENAGENT_SDK_RELEASE_TOKEN: "fixture-sdk-token",
            TAURI_SIGNING_PRIVATE_KEY: "fixture-signing-key",
            OPENAGENT_PLUGIN_RELEASE_TOKEN: String(token),
            RUNTIME: String(runtime),
            PRERELEASE: "true",
            NATIVE_SHELL: "false",
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(expectedStatus);
      if (expectedStatus === 1) {
        expect(result.stderr).toContain(
          "OPENAGENT_PLUGIN_RELEASE_TOKEN is required for Runtime releases",
        );
      }
    }
  });

  test("overlapping complete resources cannot upload concurrently with component publishers", async () => {
    const job = await releaseJobSource(
      "publish-distribution-resources",
      "publish-runtime-components",
    );
    const dependencies = job.slice(0, job.indexOf("    if:"));
    expect(dependencies).toContain("- publish-runtime-components");
    expect(dependencies).toContain("- publish-frontend-components");
    expect(job).toContain("always()");
    expect(job).toContain("needs.distribution-resources.result == 'success'");
    for (const publisher of ["publish-runtime-components", "publish-frontend-components"]) {
      expect(job).toContain(
        `(needs.${publisher}.result == 'success' || needs.${publisher}.result == 'skipped')`,
      );
    }
  });

  test("tagging accepts skipped candidate jobs for unselected components", async () => {
    const job = await releaseJobSource("tag", "create-draft");

    expect(job).toContain("always()");
    for (const dependency of ["build", "runtime-components", "frontend-components"]) {
      expect(job).toContain(
        `(needs.${dependency}.result == 'success' || needs.${dependency}.result == 'skipped')`,
      );
    }
  });

  test("draft creation continues after unselected component jobs are skipped", async () => {
    const job = await releaseJobSource("create-draft", "build");

    expect(job).toContain("always()");
    expect(job).toContain("needs.detect.result == 'success'");
    expect(job).toContain("needs.tag.result == 'success'");
  });

  test("selected publication jobs evaluate after skipped candidate ancestors", async () => {
    /** @type {Array<[string, string, string]>} */
    const jobs = [
      ["publish-native-assets", "publish-runtime-components", "build"],
      ["publish-runtime-components", "publish-frontend-components", "runtime-components"],
      ["publish-frontend-components", "publish-store", "frontend-components"],
      ["publish-store", "publish-sdk-release", "build"],
    ];

    for (const [jobName, nextJobName, candidateJob] of jobs) {
      const job = await releaseJobSource(jobName, nextJobName);
      expect(job).toContain("always()");
      expect(job).toContain("needs.detect.result == 'success'");
      expect(job).toContain("needs.create-draft.result == 'success'");
      expect(job).toContain(`needs.${candidateJob}.result == 'success'`);
    }
  });

  test("selected component publishers cannot be skipped before publication", async () => {
    /** @type {Array<[string, string]>} */
    const finalPublicationJobs = [
      ["publish-sdk-release", "publish"],
      ["publish", "archive-prerelease"],
    ];

    for (const [jobName, nextJobName] of finalPublicationJobs) {
      const job = await releaseJobSource(jobName, nextJobName);
      expect(job).toContain(
        "needs.detect.outputs.native_shell != 'true' || needs.publish-native-assets.result == 'success'",
      );
      expect(job).toContain(
        "needs.detect.outputs.runtime != 'true' || needs.publish-runtime-components.result == 'success'",
      );
      expect(job).toContain(
        "needs.detect.outputs.frontend != 'true' || needs.publish-frontend-components.result == 'success'",
      );
      expect(job).not.toContain(
        "needs.publish-frontend-components.result == 'success' || needs.publish-frontend-components.result == 'skipped'",
      );
      expect(job).toContain(
        "needs.detect.outputs.prerelease == 'true' || needs.publish-store.result == 'success'",
      );
    }
  });
});
