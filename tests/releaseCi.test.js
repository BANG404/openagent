// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { REQUIRED_RELEASE_CI_JOBS, verifyReleaseCiJobs } from "../scripts/verify-release-ci.mjs";

function successfulJobs() {
  return REQUIRED_RELEASE_CI_JOBS.map((name) => ({ name, conclusion: "success" }));
}

describe("release CI verification", () => {
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
