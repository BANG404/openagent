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
});
