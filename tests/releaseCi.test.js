// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REQUIRED_RELEASE_CI_JOBS, verifyReleaseCiJobs } from "../scripts/verify-release-ci.mjs";

const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

function successfulJobs() {
  return REQUIRED_RELEASE_CI_JOBS.map((name) => ({ name, conclusion: "success" }));
}

describe("release CI verification", () => {
  test("fetches tags before validating release metadata", () => {
    const detectJob = releaseWorkflow.match(/ {2}detect:\n(?<job>[\s\S]*?)\n {2}tag:/)?.groups?.job;

    expect(detectJob).toContain("fetch-depth: 0");
  });

  test("accepts a complete successful CI run", () => {
    expect(() => verifyReleaseCiJobs(successfulJobs())).not.toThrow();
  });

  test("accepts skipped modules after the Required aggregate succeeds", () => {
    const jobs = successfulJobs().map((job) =>
      job.name === "Detect changed modules" ? job : { ...job, conclusion: "success" },
    );
    jobs.push({ name: "Native desktop / Check macOS arm64", conclusion: "skipped" });
    expect(() => verifyReleaseCiJobs(jobs)).not.toThrow();
  });

  test("rejects a run without a required job", () => {
    const jobs = successfulJobs().filter((job) => job.name !== "Detect changed modules");
    expect(() => verifyReleaseCiJobs(jobs)).toThrow(
      "Detect changed modules must succeed before release preparation; got: missing",
    );
  });
});
