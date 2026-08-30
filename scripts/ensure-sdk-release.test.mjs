import { describe, expect, test } from "bun:test";
import { validateSdkManifest } from "./ensure-sdk-release.mjs";

describe("SDK release manifest verification", () => {
  const plan = { version: "0.6.3", releaseSha: "0123456789abcdef0123456789abcdef01234567" };

  test("accepts the exact SDK source and protocol range", () => {
    expect(
      validateSdkManifest(
        { version: "0.6.3", sdk_sha: plan.releaseSha, protocol: { min: 12, max: 12 } },
        plan,
      ),
    ).toEqual({ protocolMin: 12, protocolMax: 12 });
  });

  test("rejects a manifest built from another SDK revision", () => {
    expect(() =>
      validateSdkManifest(
        {
          version: "0.6.3",
          sdk_sha: "fedcba9876543210fedcba9876543210fedcba98",
          protocol: { min: 12, max: 12 },
        },
        plan,
      ),
    ).toThrow(/does not match/);
  });
});
