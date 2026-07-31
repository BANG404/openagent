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

  test("rejects a run that skipped a required platform", () => {
    const jobs = successfulJobs().map((job) =>
      job.name === "Native desktop / Check macOS arm64" ? { ...job, conclusion: "skipped" } : job,
    );
    expect(() => verifyReleaseCiJobs(jobs)).toThrow(
      "Native desktop / Check macOS arm64 must succeed before release preparation; got: skipped",
    );
  });

  test("rejects a run without a required job", () => {
    const jobs = successfulJobs().filter((job) => job.name !== "Native desktop / Rust quality");
    expect(() => verifyReleaseCiJobs(jobs)).toThrow(
      "Native desktop / Rust quality must succeed before release preparation; got: missing",
    );
  });
});
