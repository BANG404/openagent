import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workflowPath = new URL("../.github/workflows/release.yml", import.meta.url);

/**
 * @param {string} jobName
 * @param {string} nextJobName
 */
async function releaseJobSource(jobName, nextJobName) {
  const source = await readFile(workflowPath, "utf8");
  const start = source.indexOf(`  ${jobName}:\n`);
  const end = source.indexOf(`  ${nextJobName}:\n`, start + 1);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("release workflow publication gates", () => {
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
