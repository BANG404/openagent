// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { appUpdateReleaseUrl } from "$lib/appUpdateRelease";

describe("application update release links", () => {
  test("links an updater version to its GitHub release tag", () => {
    expect(appUpdateReleaseUrl("0.32.0-beta.1")).toBe(
      "https://github.com/BANG404/openagent/releases/tag/v0.32.0-beta.1",
    );
  });

  test("does not duplicate an existing tag prefix", () => {
    expect(appUpdateReleaseUrl("v0.32.0-beta.1")).toBe(
      "https://github.com/BANG404/openagent/releases/tag/v0.32.0-beta.1",
    );
  });
});
