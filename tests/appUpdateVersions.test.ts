// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { formatComponentVersionTransitions } from "../src/lib/appUpdateVersions";

describe("component update version identities", () => {
  test("shows each component's current and candidate version independently", () => {
    expect(
      formatComponentVersionTransitions([
        {
          label: "desktop shell",
          currentVersion: "0.60.0-beta.1",
          candidateVersion: "0.61.0-beta.1",
        },
        { label: "frontend", currentVersion: "0.60.0-beta.1", candidateVersion: "0.61.0-beta.2" },
        { label: "Runtime", currentVersion: "0.7.1", candidateVersion: "0.8.0" },
      ]),
    ).toBe(
      "desktop shell 0.60.0-beta.1 → 0.61.0-beta.1, frontend 0.60.0-beta.1 → 0.61.0-beta.2, Runtime 0.7.1 → 0.8.0",
    );
  });

  test("shows a candidate without inventing an unknown current version", () => {
    expect(
      formatComponentVersionTransitions([{ label: "Runtime", candidateVersion: "0.8.0" }]),
    ).toBe("Runtime 0.8.0");
  });
});
