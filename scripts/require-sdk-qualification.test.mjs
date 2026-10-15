import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { requireSdkQualification } from "./require-sdk-qualification.mjs";

const sdkSha = "a".repeat(40);
const success = {
  context: "Public SDK CI",
  state: "success",
  description: "Public SDK full validation passed",
  target_url: "https://github.com/BANG404/openagent/actions/runs/38524205057",
};

describe("immutable SDK qualification for plugin publication", () => {
  test("retains completed full qualification during a later concurrent run", () => {
    const result = requireSdkQualification(sdkSha, (requestedSha) => {
      expect(requestedSha).toBe(sdkSha);
      return [
        [
          { ...success, state: "pending", description: "Public SDK full validation is running" },
          success,
        ],
      ];
    });
    expect(result).toBe(success);
  });

  test("finds completed qualification beyond the first history page", () => {
    expect(
      requireSdkQualification(sdkSha, () => [
        Array.from({ length: 100 }, () => ({ ...success, state: "pending" })),
        [success],
      ]),
    ).toBe(success);
  });

  test("a later failed rerun does not revoke qualification of unchanged source", () => {
    expect(
      requireSdkQualification(sdkSha, () => [[{ ...success, state: "failure" }, success]]),
    ).toBe(success);
  });

  test.each([
    { name: "missing", statuses: [] },
    { name: "pending", statuses: [{ ...success, state: "pending" }] },
    { name: "failure", statuses: [{ ...success, state: "failure" }] },
    { name: "error", statuses: [{ ...success, state: "error" }] },
    { name: "fast context", statuses: [{ ...success, context: "Public SDK Fast CI" }] },
    {
      name: "fast description",
      statuses: [{ ...success, description: "Public SDK fast validation passed" }],
    },
    { name: "missing evidence URL", statuses: [{ ...success, target_url: null }] },
  ])("rejects history without full success: $name", ({ statuses }) => {
    expect(() => requireSdkQualification(sdkSha, () => [statuses])).toThrow(
      "no successful full Public SDK qualification",
    );
  });

  test("rejects mutable inputs before loading statuses and propagates API failures", () => {
    expect(() =>
      requireSdkQualification("main", () => {
        throw new Error("unexpected API call");
      }),
    ).toThrow("immutable SDK source SHA");
    expect(() =>
      requireSdkQualification(sdkSha, () => {
        throw new Error("API unavailable");
      }),
    ).toThrow("API unavailable");
  });

  test("the publication workflow enforces qualification before package setup", () => {
    const source = readFileSync(
      new URL("../.github/workflows/plugin-releases.yml", import.meta.url),
      "utf8",
    );
    const gate = source.indexOf("bun scripts/require-sdk-qualification.mjs");
    expect(gate).toBeGreaterThan(source.indexOf("git -C sdk merge-base --is-ancestor"));
    expect(gate).toBeLessThan(source.indexOf("Synchronize independent standard package sources"));
    expect(source).not.toContain('/commits/$SDK_SHA/status"');
  });
});
